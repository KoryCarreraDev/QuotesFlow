// Protección CSRF por verificación de origen (F2-T07, D-14) sobre la aplicación real.

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { env } from '@/config/env.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { persistTenantWithTeam } from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_FORBIDDEN = 403;
const UNTRUSTED_ORIGIN = 'https://untrusted-site.example';

describe('Verificación de origen en peticiones que modifican datos', () => {
  it('una modificación con sesión válida desde un origen ajeno responde 403 y no escribe nada', async () => {
    const company = await persistTenantWithTeam();

    const response = await request(app)
      .post(apiPaths.leads.create)
      .set('Cookie', sessionCookieFor(company.owner))
      .set('Origin', UNTRUSTED_ORIGIN)
      .send({ contactName: 'Cliente Forzado' });

    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(response.body.error.code).toBe(ErrorCode.ORIGIN_NOT_ALLOWED);
    await expect(prisma.lead.count()).resolves.toBe(0);
  });

  it('la misma modificación desde el frontend autorizado se atiende', async () => {
    const company = await persistTenantWithTeam();
    const [frontendOrigin] = env.CORS_ALLOWED_ORIGINS;

    const response = await request(app)
      .post(apiPaths.leads.create)
      .set('Cookie', sessionCookieFor(company.owner))
      .set('Origin', frontendOrigin)
      .send({ contactName: 'Cliente Legítimo' });

    expect(response.status).toBe(HTTP_CREATED);
  });

  it('el login desde un origen ajeno se rechaza (CSRF de inicio de sesión)', async () => {
    const response = await request(app)
      .post(apiPaths.auth.login)
      .set('Origin', UNTRUSTED_ORIGIN)
      .send({ email: 'owner@example.com', password: 'Correct-Horse-Battery-9' });

    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('una lectura desde un origen ajeno no se bloquea aquí: CORS impide al navegador leer la respuesta', async () => {
    const company = await persistTenantWithTeam();

    const response = await request(app)
      .get(apiPaths.leads.getAll)
      .set('Cookie', sessionCookieFor(company.owner))
      .set('Origin', UNTRUSTED_ORIGIN);

    expect(response.status).toBe(HTTP_OK);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
