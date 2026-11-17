// F2-T06: perfil y configuración de la empresa contra la API real.

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import {
  TEST_USER_PASSWORD,
  type TenantWithTeam,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;

describe('Perfil de la empresa (F2-T06)', () => {
  let company: TenantWithTeam;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
  });

  it('una empresa sin configuración guardada tiene la zona horaria de Colombia', async () => {
    const response = await request(app).get(apiPaths.tenant.profile).set('Cookie', sessionCookieFor(company.salesRep));

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({
      id: company.tenant.id,
      name: company.tenant.name,
      timezone: 'America/Bogota',
      emailDeliveryEnabled: false,
    });
  });

  it('el registro crea la configuración de la empresa nueva', async () => {
    await request(app).post(apiPaths.auth.register).send({
      companyName: 'Empresa Con Configuración SAS',
      ownerEmail: 'config.owner@example.com',
      password: TEST_USER_PASSWORD,
      ownerFirstName: 'Ana',
      ownerLastName: 'Gómez',
    });

    const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'config.owner@example.com' } });
    await expect(prisma.tenantSettings.findUnique({ where: { tenantId: owner.tenantId } })).resolves.toMatchObject({
      timezone: 'America/Bogota',
      emailDeliveryEnabled: false,
    });
  });

  it('el dueño cambia nombre y zona horaria', async () => {
    const response = await request(app)
      .patch(apiPaths.tenant.profile)
      .set('Cookie', sessionCookieFor(company.owner))
      .send({ name: 'Nuevo Nombre SAS', timezone: 'America/Mexico_City' });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toMatchObject({ name: 'Nuevo Nombre SAS', timezone: 'America/Mexico_City' });
    await expect(prisma.tenantSettings.findUnique({ where: { tenantId: company.tenant.id } })).resolves.toMatchObject({
      timezone: 'America/Mexico_City',
    });
  });

  // D-57 (F3-T10): el correo para cotizaciones y alertas es opcional por empresa y empieza desactivado.
  it('el socio activa el correo de la empresa y luego lo desactiva', async () => {
    const partnerCookie = sessionCookieFor(company.partner);

    const enabled = await request(app)
      .patch(apiPaths.tenant.profile)
      .set('Cookie', partnerCookie)
      .send({ emailDeliveryEnabled: true });
    const disabled = await request(app)
      .patch(apiPaths.tenant.profile)
      .set('Cookie', partnerCookie)
      .send({ emailDeliveryEnabled: false });

    expect(enabled.status).toBe(HTTP_OK);
    expect(enabled.body.emailDeliveryEnabled).toBe(true);
    expect(disabled.body).toMatchObject({ emailDeliveryEnabled: false, timezone: 'America/Bogota' });
    await expect(prisma.tenantSettings.findUnique({ where: { tenantId: company.tenant.id } })).resolves.toMatchObject({
      emailDeliveryEnabled: false,
    });
  });

  it('activar el correo no cambia la zona horaria guardada', async () => {
    const ownerCookie = sessionCookieFor(company.owner);
    await request(app).patch(apiPaths.tenant.profile).set('Cookie', ownerCookie).send({ timezone: 'America/Lima' });

    const response = await request(app)
      .patch(apiPaths.tenant.profile)
      .set('Cookie', ownerCookie)
      .send({ emailDeliveryEnabled: true });

    expect(response.body).toMatchObject({ timezone: 'America/Lima', emailDeliveryEnabled: true });
  });

  it('emailDeliveryEnabled tiene que ser booleano', async () => {
    const response = await request(app)
      .patch(apiPaths.tenant.profile)
      .set('Cookie', sessionCookieFor(company.owner))
      .send({ emailDeliveryEnabled: 'true' });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.details).toEqual([expect.objectContaining({ path: ['emailDeliveryEnabled'] })]);
  });

  it('el comercial no activa el correo de la empresa', async () => {
    const response = await request(app)
      .patch(apiPaths.tenant.profile)
      .set('Cookie', sessionCookieFor(company.salesRep))
      .send({ emailDeliveryEnabled: true });

    expect(response.status).toBe(HTTP_FORBIDDEN);
  });

  it('una zona horaria que no es IANA responde 400 en el campo timezone', async () => {
    const response = await request(app)
      .patch(apiPaths.tenant.profile)
      .set('Cookie', sessionCookieFor(company.owner))
      .send({ timezone: 'GMT-5' });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.details).toEqual([expect.objectContaining({ path: ['timezone'] })]);
  });

  it('un cambio vacío responde 400', async () => {
    const response = await request(app)
      .patch(apiPaths.tenant.profile)
      .set('Cookie', sessionCookieFor(company.owner))
      .send({});

    expect(response.status).toBe(HTTP_BAD_REQUEST);
  });

  it('el líder comercial no cambia el perfil', async () => {
    const response = await request(app)
      .patch(apiPaths.tenant.profile)
      .set('Cookie', sessionCookieFor(company.salesLeader))
      .send({ name: 'Intento' });

    expect(response.status).toBe(HTTP_FORBIDDEN);
    await expect(prisma.tenant.findUniqueOrThrow({ where: { id: company.tenant.id } })).resolves.toMatchObject({
      name: company.tenant.name,
    });
  });

  it('el cuerpo no puede cambiar el id ni el logo', async () => {
    await request(app)
      .patch(apiPaths.tenant.profile)
      .set('Cookie', sessionCookieFor(company.owner))
      .send({ name: 'Nombre Válido SAS', id: 'otro-id', logoUrl: 'https://malicioso.example/logo.png' });

    const storedTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: company.tenant.id } });
    expect(storedTenant.logoUrl).toBeNull();
  });
});
