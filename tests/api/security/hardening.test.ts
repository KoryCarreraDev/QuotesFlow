import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '@/app.js';
import { env } from '@/config/env.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { TEST_USER_PASSWORD } from '@tests/support/database/persistenceFactories.js';
import { GLOBAL_RATE_LIMIT_MAX_REQUESTS } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const BYTES_PER_KILOBYTE = 1024;
const KILOBYTES_OVER_PLANNED_LIMIT = 200;

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_TOO_MANY_REQUESTS = 429;

const UNTRUSTED_ORIGIN = 'https://untrusted-site.example';
// Cualquier ruta que pase por el limitador global sirve para agotarlo; una inexistente no toca la base.
const RATE_LIMITED_PATH = '/api/v1/route-that-does-not-exist';
const ALLOW_ANY_ORIGIN = '*';

// Límite de cuerpo previsto en la tarea F1-T06 (hallazgo H14): 100 kb.
const BODY_SIZE_OVER_PLANNED_LIMIT_BYTES = KILOBYTES_OVER_PLANNED_LIMIT * BYTES_PER_KILOBYTE;

describe('Cabeceras de seguridad', () => {
  it('no revela la tecnología del servidor', async () => {
    const response = await request(app).get(apiPaths.health);

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('impide que el navegador adivine el tipo de contenido y que la API se cargue en un iframe', async () => {
    const response = await request(app).get(apiPaths.health);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('responde 404 a una ruta que no existe', async () => {
    const response = await request(app).get('/api/route-that-does-not-exist');

    expect(response.status).toBe(HTTP_NOT_FOUND);
  });

  it('CORS no autoriza a cualquier origen', async () => {
    const response = await request(app).get(apiPaths.health).set('Origin', UNTRUSTED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).not.toBe(ALLOW_ANY_ORIGIN);
    expect(response.headers['access-control-allow-origin']).not.toBe(UNTRUSTED_ORIGIN);
  });

  it('rechaza con 413 un cuerpo mayor que el límite previsto de 100 kb', async () => {
    const response = await request(app)
      .post(apiPaths.auth.login)
      .send({
        email: 'owner@example.com',
        password: TEST_USER_PASSWORD,
        padding: 'x'.repeat(BODY_SIZE_OVER_PLANNED_LIMIT_BYTES),
      });

    expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
    expect(response.body.error.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
  });

  it('CORS autoriza, con credenciales, un origen de CORS_ALLOWED_ORIGINS', async () => {
    const [trustedOrigin] = env.CORS_ALLOWED_ORIGINS;

    const response = await request(app).get(apiPaths.health).set('Origin', trustedOrigin);

    expect(response.headers['access-control-allow-origin']).toBe(trustedOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('las rutas de autenticación tienen su propio cupo, más bajo que el global', async () => {
    const response = await request(app).post(apiPaths.auth.login).send({});

    expect(response.headers['ratelimit-limit']).toBe(String(env.RATE_LIMIT_AUTH_MAX_REQUESTS));
  });
});

// Va al final del archivo: agota el cupo de peticiones de esta instancia de la aplicación.
describe('Límite global de peticiones', () => {
  it(`tras ${GLOBAL_RATE_LIMIT_MAX_REQUESTS} peticiones en la ventana responde 429`, async () => {
    let lastAllowedResponseStatus = HTTP_NOT_FOUND;
    let firstRejectedRequestNumber: number | undefined;

    // Las peticiones de los tests anteriores de este archivo ya cuentan para el cupo.
    for (let requestNumber = 1; requestNumber <= GLOBAL_RATE_LIMIT_MAX_REQUESTS + 1; requestNumber += 1) {
      const response = await request(app).get(RATE_LIMITED_PATH);
      if (response.status === HTTP_TOO_MANY_REQUESTS) {
        firstRejectedRequestNumber = requestNumber;
        break;
      }
      lastAllowedResponseStatus = response.status;
    }

    expect(lastAllowedResponseStatus).toBe(HTTP_NOT_FOUND);
    expect(firstRejectedRequestNumber).toBeDefined();
    expect(firstRejectedRequestNumber).toBeLessThanOrEqual(GLOBAL_RATE_LIMIT_MAX_REQUESTS + 1);
  });

  it('una vez superado el límite, sigue rechazando y anuncia el cupo en las cabeceras', async () => {
    const response = await request(app).get(RATE_LIMITED_PATH);

    expect(response.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(response.headers['ratelimit-limit'] ?? response.headers['ratelimit']).toBeDefined();
  });

  // Regresión de F1-S5 (F2-T10): un orquestador que sondea a menudo no debe recibir 429.
  it('con el cupo agotado, /health sigue respondiendo 200 y sin cabeceras de límite', async () => {
    const response = await request(app).get(apiPaths.health);

    expect(response.status).toBe(HTTP_OK);
    expect(response.headers['ratelimit-limit']).toBeUndefined();
  });

  it('con el cupo agotado, /ready sigue respondiendo según la base de datos, no 429', async () => {
    const response = await request(app).get(apiPaths.ready);

    expect(response.status).toBe(HTTP_OK);
  });
});
