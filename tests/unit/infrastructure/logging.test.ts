import { Writable } from 'node:stream';
import express from 'express';
import request from 'supertest';
import winston from 'winston';
import { describe, expect, it } from 'vitest';
import { runWithRequestContext } from '@/cross-cutting/requestContext.js';
import { WinstonLogger } from '@/infrastructure/logging/WinstonLogger.js';
import { REDACTED_VALUE, redactSensitiveData } from '@/infrastructure/logging/redactSensitiveData.js';
import {
  REQUEST_ID_HEADER,
  createAccessLogMiddleware,
  createRequestContextMiddleware,
} from '@/infrastructure/web/middleware/requestLogging.js';
import { RecordingLogger } from '@tests/support/doubles/RecordingLogger.js';

// F1-T07 (H13): logs estructurados con id de petición y sin datos sensibles.

const HTTP_OK = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NESTING_DEEPER_THAN_LIMIT = 10;
const OVERSIZED_REQUEST_ID_LENGTH = 100;

function loggerWithMemoryTransport() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const logger = new WinstonLogger('debug', new winston.transports.Stream({ stream }));
  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, entries };
}

describe('redactSensitiveData', () => {
  it('redacta contraseñas, tokens, cookies, cabeceras de autorización y secretos a cualquier profundidad', () => {
    const redacted = redactSensitiveData({
      email: 'ana@example.com',
      password: 'Correct-Horse-Battery-9',
      user: { passwordHash: '$2b$12$hash', profile: { accessToken: 'eyJ...' } },
      headers: { authorization: 'Bearer eyJ...', cookie: 'accessToken=eyJ...', 'x-api-key': 'key' },
      config: { JWT_SECRET: 'secret', DATABASE_URL: 'postgresql://user:pass@db/app' },
    });

    expect(redacted).toEqual({
      email: 'ana@example.com',
      password: REDACTED_VALUE,
      user: { passwordHash: REDACTED_VALUE, profile: { accessToken: REDACTED_VALUE } },
      headers: { authorization: REDACTED_VALUE, cookie: REDACTED_VALUE, 'x-api-key': REDACTED_VALUE },
      config: { JWT_SECRET: REDACTED_VALUE, DATABASE_URL: REDACTED_VALUE },
    });
  });

  it('borra usuario y contraseña de las URLs de conexión que aparecen en un texto, por ejemplo en un error', () => {
    const connectionError = new Error('connect failed for postgresql://quotesflow:s3cret@10.0.0.5:5432/app');

    const redacted = redactSensitiveData({ error: connectionError }) as { error: { message: string; stack: string } };

    expect(redacted.error.message).toBe(`connect failed for postgresql://${REDACTED_VALUE}@10.0.0.5:5432/app`);
    expect(redacted.error.stack).not.toContain('s3cret');
  });

  it('no modifica el objeto original', () => {
    const original = { password: 'Correct-Horse-Battery-9' };

    redactSensitiveData(original);

    expect(original.password).toBe('Correct-Horse-Battery-9');
  });

  it('corta estructuras demasiado profundas en lugar de recorrerlas sin fin', () => {
    let deeplyNested: Record<string, unknown> = { value: 'leaf' };
    for (let level = 0; level < NESTING_DEEPER_THAN_LIMIT; level += 1) deeplyNested = { nested: deeplyNested };

    expect(JSON.stringify(redactSensitiveData(deeplyNested))).toContain('[TRUNCATED]');
  });
});

describe('WinstonLogger', () => {
  it('escribe una línea JSON con nivel, mensaje, contexto redactado e id de la petición en curso', () => {
    const { logger, entries } = loggerWithMemoryTransport();

    runWithRequestContext({ requestId: 'request-1234', userId: 'user-1', tenantId: 'tenant-1' }, () => {
      logger.warn('Login throttled', { email: 'ana@example.com', password: 'Correct-Horse-Battery-9' });
    });

    expect(entries()).toEqual([
      expect.objectContaining({
        level: 'warn',
        message: 'Login throttled',
        email: 'ana@example.com',
        password: REDACTED_VALUE,
        requestId: 'request-1234',
        userId: 'user-1',
        tenantId: 'tenant-1',
        timestamp: expect.any(String),
      }),
    ]);
  });

  it('registra el error con su nombre, su mensaje y su traza', () => {
    const { logger, entries } = loggerWithMemoryTransport();

    logger.error('Unhandled error', new TypeError('boom'));

    expect(entries()[0].error).toEqual(
      expect.objectContaining({ name: 'TypeError', message: 'boom', stack: expect.stringContaining('TypeError') }),
    );
  });

  it('con el nivel silent no escribe nada', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });

    new WinstonLogger('silent', new winston.transports.Stream({ stream })).error('ignored');

    expect(lines).toEqual([]);
  });
});

describe('contexto de petición y log de acceso', () => {
  function appWithRequestLogging(logger: RecordingLogger) {
    const app = express();
    app.use(createRequestContextMiddleware());
    app.use(createAccessLogMiddleware(logger));
    app.get('/resource', (_request, response) => {
      logger.info('Inside handler');
      response.status(HTTP_OK).json({ ok: true });
    });
    return app;
  }

  it('genera un id de petición y lo devuelve en X-Request-Id', async () => {
    const response = await request(appWithRequestLogging(new RecordingLogger())).get('/resource');

    expect(response.headers[REQUEST_ID_HEADER.toLowerCase()]).toMatch(UUID_PATTERN);
  });

  it('conserva un X-Request-Id entrante seguro, para seguir la petición entre servicios', async () => {
    const response = await request(appWithRequestLogging(new RecordingLogger()))
      .get('/resource')
      .set(REQUEST_ID_HEADER, 'frontend-request-0001');

    expect(response.headers[REQUEST_ID_HEADER.toLowerCase()]).toBe('frontend-request-0001');
  });

  it.each(['short', 'bad id with spaces\nInjected: log line', 'x'.repeat(OVERSIZED_REQUEST_ID_LENGTH)])(
    'sustituye un X-Request-Id entrante no seguro (%s) por uno generado',
    async (unsafeRequestId) => {
      const response = await request(appWithRequestLogging(new RecordingLogger()))
        .get('/resource')
        .set(REQUEST_ID_HEADER, unsafeRequestId.replace('\n', ' '));

      expect(response.headers[REQUEST_ID_HEADER.toLowerCase()]).toMatch(UUID_PATTERN);
    },
  );

  it('registra una entrada por petición con método, ruta sin query, código y duración', async () => {
    const logger = new RecordingLogger();

    await request(appWithRequestLogging(logger)).get('/resource?email=ana@example.com');

    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: 'info',
        message: 'HTTP request completed',
        context: { method: 'GET', path: '/resource', statusCode: HTTP_OK, durationMs: expect.any(Number) },
      }),
    );
    expect(JSON.stringify(logger.entries)).not.toContain('ana@example.com');
  });
});
