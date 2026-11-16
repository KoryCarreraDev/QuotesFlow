import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '@/app.js';
import { TEST_USER_PASSWORD } from '@tests/support/database/persistenceFactories.js';
import { GLOBAL_RATE_LIMIT_MAX_REQUESTS } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';
import { itKnownDefect } from '@tests/support/knownDefect.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_TOO_MANY_REQUESTS = 429;

const UNTRUSTED_ORIGIN = 'https://untrusted-site.example';
const ALLOW_ANY_ORIGIN = '*';

// Límite de cuerpo previsto en la tarea F1-T06 (hallazgo H14): 100 kb.
const BODY_SIZE_OVER_PLANNED_LIMIT_BYTES = 200 * 1024;

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

  itKnownDefect('H4', 'CORS no autoriza a cualquier origen', async () => {
    const response = await request(app).get(apiPaths.health).set('Origin', UNTRUSTED_ORIGIN);

    expect(response.headers['access-control-allow-origin']).not.toBe(ALLOW_ANY_ORIGIN);
    expect(response.headers['access-control-allow-origin']).not.toBe(UNTRUSTED_ORIGIN);
  });

  itKnownDefect('H14', 'rechaza con 413 un cuerpo mayor que el límite previsto de 100 kb', async () => {
    const response = await request(app)
      .post(apiPaths.auth.login)
      .send({
        email: 'owner@example.com',
        password: TEST_USER_PASSWORD,
        padding: 'x'.repeat(BODY_SIZE_OVER_PLANNED_LIMIT_BYTES),
      });

    expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
  });
});

// Va al final del archivo: agota el cupo de peticiones de esta instancia de la aplicación.
describe('Límite global de peticiones', () => {
  it(`tras ${GLOBAL_RATE_LIMIT_MAX_REQUESTS} peticiones en la ventana responde 429`, async () => {
    let lastAllowedResponseStatus = HTTP_OK;
    let firstRejectedRequestNumber: number | undefined;

    // Las peticiones de los tests anteriores de este archivo ya cuentan para el cupo.
    for (let requestNumber = 1; requestNumber <= GLOBAL_RATE_LIMIT_MAX_REQUESTS + 1; requestNumber += 1) {
      const response = await request(app).get(apiPaths.health);
      if (response.status === HTTP_TOO_MANY_REQUESTS) {
        firstRejectedRequestNumber = requestNumber;
        break;
      }
      lastAllowedResponseStatus = response.status;
    }

    expect(lastAllowedResponseStatus).toBe(HTTP_OK);
    expect(firstRejectedRequestNumber).toBeDefined();
    expect(firstRejectedRequestNumber).toBeLessThanOrEqual(GLOBAL_RATE_LIMIT_MAX_REQUESTS + 1);
  });

  it('una vez superado el límite, sigue rechazando y anuncia el cupo en las cabeceras', async () => {
    const response = await request(app).get(apiPaths.health);

    expect(response.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(response.headers['ratelimit-limit'] ?? response.headers['ratelimit']).toBeDefined();
  });
});
