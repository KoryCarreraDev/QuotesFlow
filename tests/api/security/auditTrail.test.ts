// Auditoría de negocio (F1-T07, H13): toda ruta que modifica datos deja un registro en AuditLog con
// su autor, su empresa y el id de la petición. Recorre el inventario: una ruta nueva que modifique
// datos sin auditar hace fallar esta suite.

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
import { authenticatedRoutes, buildConcretePath, describeRoute, apiPaths } from '@tests/support/http/apiRoutes.js';
import {
  creationBody,
  persistScenarioResource,
  scenarioFor,
  scenarioUpdateBody,
} from '@tests/support/http/routeSecurityScenarios.js';

const REQUEST_ID_HEADER = 'x-request-id';
const FIRST_NON_SUCCESS_STATUS = 300;

const mutatingRoutes = authenticatedRoutes.flatMap((route) => {
  const scenario = scenarioFor(route);
  return scenario && scenario.operation !== 'list' ? [{ title: describeRoute(route), route, scenario }] : [];
});

describe('Rastro de auditoría', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
  });

  it.each(mutatingRoutes)(
    '$title deja un registro con autor, empresa e id de petición',
    async ({ route, scenario }) => {
      let response: request.Response;
      if (scenario.operation === 'bulkUpdate') {
        response = await request(app)
          .patch(route.pattern)
          .set('Cookie', ownerCookie)
          .send(scenarioUpdateBody(scenario, company));
      } else if (scenario.operation === 'create') {
        response = await request(app)
          .post(route.pattern)
          .set('Cookie', ownerCookie)
          .send(creationBody(scenario.resource));
      } else {
        const resourceId = await persistScenarioResource(scenario.resource, company, company.owner.id);
        const path = buildConcretePath(route, resourceId);
        response =
          route.method === 'PATCH'
            ? await request(app).patch(path).set('Cookie', ownerCookie).send(scenarioUpdateBody(scenario, company))
            : await request(app).post(path).set('Cookie', ownerCookie);
      }

      expect(response.status).toBeLessThan(FIRST_NON_SUCCESS_STATUS);
      const auditEntries = await prisma.auditLog.findMany();
      expect(auditEntries).toEqual([
        expect.objectContaining({
          tenantId: company.tenant.id,
          userId: company.owner.id,
          metadata: expect.objectContaining({ requestId: response.headers[REQUEST_ID_HEADER] }),
        }),
      ]);
    },
  );

  it('una petición rechazada no deja registro', async () => {
    await request(app)
      .post(apiPaths.leadStatusConfigs.create)
      .set('Cookie', sessionCookieFor(company.salesRep))
      .send(creationBody('leadStatus'));

    await expect(prisma.auditLog.count()).resolves.toBe(0);
  });

  it('una modificación guarda los nombres de los campos cambiados, no sus valores', async () => {
    const leadId = await persistScenarioResource('lead', company, company.owner.id);

    await request(app)
      .patch(apiPaths.leads.update(leadId))
      .set('Cookie', ownerCookie)
      .send({ email: 'nuevo.correo@example.com', notes: 'Cliente confidencial' });

    const [auditEntry] = await prisma.auditLog.findMany();
    expect(auditEntry.metadata).toMatchObject({ changedFields: ['email', 'notes'] });
    expect(JSON.stringify(auditEntry.metadata)).not.toContain('nuevo.correo@example.com');
  });

  describe('autenticación', () => {
    it('el registro de una empresa queda auditado con el dueño como autor', async () => {
      const response = await request(app).post(apiPaths.auth.register).send({
        companyName: 'Empresa Auditada SAS',
        ownerEmail: 'audit.owner@example.com',
        password: TEST_USER_PASSWORD,
        ownerFirstName: 'Ana',
        ownerLastName: 'Gómez',
      });

      const [auditEntry] = await prisma.auditLog.findMany();
      expect(auditEntry).toMatchObject({
        action: 'COMPANY_REGISTERED',
        tenantId: response.body.tenantId,
        userId: response.body.ownerId,
      });
    });

    it('un inicio de sesión correcto y uno con contraseña incorrecta quedan auditados, sin la contraseña', async () => {
      const wrongPassword = `${TEST_USER_PASSWORD}-wrong`;
      await request(app).post(apiPaths.auth.login).send({ email: company.owner.email, password: TEST_USER_PASSWORD });
      await request(app).post(apiPaths.auth.login).send({ email: company.owner.email, password: wrongPassword });

      const auditEntries = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
      expect(auditEntries.map((entry) => entry.action).sort()).toEqual(['LOGIN_FAILED', 'LOGIN_SUCCEEDED']);
      expect(auditEntries.every((entry) => entry.userId === company.owner.id)).toBe(true);
      expect(JSON.stringify(auditEntries)).not.toContain(wrongPassword);
    });

    it('un intento con un correo que no existe no se audita: no hay usuario ni empresa', async () => {
      await request(app).post(apiPaths.auth.login).send({ email: 'nobody@example.com', password: TEST_USER_PASSWORD });

      await expect(prisma.auditLog.count()).resolves.toBe(0);
    });
  });
});
