import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { createCorsMiddleware, createRateLimiter } from '@/infrastructure/web/httpSecurity.js';

// F1-T06: CORS con lista blanca (H4) y límites de tasa que no se esquivan con X-Forwarded-For (H6).

const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_TOO_MANY_REQUESTS = 429;
const SMALL_LIMIT = 2;
const ONE_MINUTE_MS = 60_000;
const ONE_TRUSTED_PROXY_HOP = 1;
const NO_TRUSTED_PROXY = 0;

const TRUSTED_ORIGIN = 'https://app.quotesflow.example';
const UNTRUSTED_ORIGIN = 'https://untrusted-site.example';

function appWithCors(allowedOrigins: string[]) {
  const app = express();
  app.use(createCorsMiddleware(allowedOrigins));
  app.get('/resource', (_request, response) => {
    response.status(HTTP_OK).json({ ok: true });
  });
  return app;
}

function appWithRateLimit(trustedProxyHops: number) {
  const app = express();
  app.set('trust proxy', trustedProxyHops);
  app.use(createRateLimiter({ maxRequests: SMALL_LIMIT, windowMs: ONE_MINUTE_MS }));
  app.get('/resource', (_request, response) => {
    response.status(HTTP_OK).json({ ok: true });
  });
  return app;
}

describe('createCorsMiddleware (H4)', () => {
  it('autoriza un origen de la lista y permite enviar la cookie de sesión', async () => {
    const response = await request(appWithCors([TRUSTED_ORIGIN]))
      .get('/resource')
      .set('Origin', TRUSTED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(TRUSTED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('no autoriza un origen fuera de la lista', async () => {
    const response = await request(appWithCors([TRUSTED_ORIGIN]))
      .get('/resource')
      .set('Origin', UNTRUSTED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('con la lista vacía no autoriza ningún origen', async () => {
    const response = await request(appWithCors([])).get('/resource').set('Origin', TRUSTED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responde la petición previa (preflight) de un origen autorizado', async () => {
    const response = await request(appWithCors([TRUSTED_ORIGIN]))
      .options('/resource')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Access-Control-Request-Method', 'PATCH');

    expect(response.status).toBe(HTTP_NO_CONTENT);
    expect(response.headers['access-control-allow-methods']).toContain('PATCH');
  });

  it('una petición sin cabecera Origin (servidor a servidor) se atiende sin cabeceras CORS', async () => {
    const response = await request(appWithCors([TRUSTED_ORIGIN])).get('/resource');

    expect(response.status).toBe(HTTP_OK);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('createRateLimiter (H6)', () => {
  it('al superar el cupo responde 429 con el formato único de error y anuncia el cupo', async () => {
    const app = appWithRateLimit(NO_TRUSTED_PROXY);

    await request(app).get('/resource');
    await request(app).get('/resource');
    const rejectedResponse = await request(app).get('/resource');

    expect(rejectedResponse.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(rejectedResponse.body).toEqual({
      error: { code: ErrorCode.TOO_MANY_REQUESTS, message: expect.any(String) },
    });
    expect(rejectedResponse.headers['ratelimit-limit'] ?? rejectedResponse.headers['ratelimit']).toBeDefined();
  });

  it('sin proxy de confianza, cambiar X-Forwarded-For no da un cupo nuevo', async () => {
    const app = appWithRateLimit(NO_TRUSTED_PROXY);

    await request(app).get('/resource').set('X-Forwarded-For', '203.0.113.1');
    await request(app).get('/resource').set('X-Forwarded-For', '203.0.113.2');
    const response = await request(app).get('/resource').set('X-Forwarded-For', '203.0.113.3');

    expect(response.status).toBe(HTTP_TOO_MANY_REQUESTS);
  });

  it('detrás de un proxy de confianza, cuenta por la IP real del cliente que el proxy informa', async () => {
    const app = appWithRateLimit(ONE_TRUSTED_PROXY_HOP);

    await request(app).get('/resource').set('X-Forwarded-For', '203.0.113.1');
    await request(app).get('/resource').set('X-Forwarded-For', '203.0.113.1');
    const sameClientResponse = await request(app).get('/resource').set('X-Forwarded-For', '203.0.113.1');
    const otherClientResponse = await request(app).get('/resource').set('X-Forwarded-For', '203.0.113.2');

    expect(sameClientResponse.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(otherClientResponse.status).toBe(HTTP_OK);
  });
});
