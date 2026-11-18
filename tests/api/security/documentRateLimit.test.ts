import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import { env } from '@/config/env.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import { type TenantWithTeam, persistTenantWithTeam } from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F3-A15: generar un PDF (y enviarlo por correo) es caro. Tienen un cupo propio por IP, más bajo que el global.
// Va en su propio archivo porque agota el cupo de esta instancia de la aplicación.

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const EVERY_OTHER_REQUEST = 2;
const HTTP_TOO_MANY_REQUESTS = 429;

describe('Límite de documentos (PDF y envío de cotizaciones)', () => {
  let company: TenantWithTeam;
  let cookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    cookie = sessionCookieFor(company.owner);
  });

  it('anuncia su cupo propio en las cabeceras', async () => {
    const response = await request(app).get(apiPaths.quotes.pdf(NON_EXISTENT_ID)).set('Cookie', cookie);

    expect(response.headers['ratelimit-limit']).toBe(String(env.RATE_LIMIT_DOCUMENT_MAX_REQUESTS));
  });

  it('la petición siguiente al cupo responde 429, también para el envío, que comparte el cupo con el PDF', async () => {
    const statuses: number[] = [];

    // Las peticiones del test anterior ya cuentan. Alternar PDF y envío comparte un solo cupo.
    for (let requestNumber = 1; requestNumber <= env.RATE_LIMIT_DOCUMENT_MAX_REQUESTS + 1; requestNumber += 1) {
      const response =
        requestNumber % EVERY_OTHER_REQUEST === 0
          ? await request(app).post(apiPaths.quotes.send(NON_EXISTENT_ID)).set('Cookie', cookie)
          : await request(app).get(apiPaths.quotes.pdf(NON_EXISTENT_ID)).set('Cookie', cookie);
      statuses.push(response.status);
      if (response.status === HTTP_TOO_MANY_REQUESTS) break;
    }

    expect(statuses.at(-1)).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(statuses.slice(0, -1).every((status) => status === HTTP_NOT_FOUND)).toBe(true);
  });

  it('el resto de la API no se ve afectada por el cupo de documentos', async () => {
    const response = await request(app).get(apiPaths.quotes.filtered).set('Cookie', cookie);

    expect(response.status).toBe(HTTP_OK);
  });
});
