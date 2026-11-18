// F2-T08 (F1-S1): toda modificación y su registro de auditoría van en la misma transacción. Si la auditoría
// falla, la modificación se revierte: nunca queda un cambio sin rastro. Recorre el inventario de rutas, así
// que una ruta nueva que escriba fuera de la transacción hace fallar esta suite.

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { PrismaAuditLogger } from '@/infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { type TenantWithTeam, persistTenantWithTeam } from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { authenticatedRoutes, buildConcretePath, describeRoute } from '@tests/support/http/apiRoutes.js';
import {
  type RouteSecurityScenario,
  type ScenarioResource,
  creationBodyFor,
  persistScenarioResource,
  prepareSelfScenario,
  readScenarioResource,
  requestOnRecord,
  requestSelf,
  isReadOnlyScenario,
  scenarioFor,
  scenarioUpdateBody,
} from '@tests/support/http/routeSecurityScenarios.js';

const HTTP_INTERNAL_SERVER_ERROR = 500;

const mutatingRoutes = authenticatedRoutes.flatMap((route) => {
  const scenario = scenarioFor(route);
  return scenario && !isReadOnlyScenario(scenario) ? [{ title: describeRoute(route), route, scenario }] : [];
});

async function countStored(resource: ScenarioResource): Promise<number> {
  if (resource === 'lead') return prisma.lead.count();
  if (resource === 'leadStatus') return prisma.leadStatusConfig.count();
  if (resource === 'contact') return prisma.contact.count();
  if (resource === 'session') return prisma.userSession.count();
  if (resource === 'user') return prisma.user.count();
  if (resource === 'invitation') return prisma.userInvitation.count();
  if (resource === 'tenant') return prisma.tenant.count();
  if (resource === 'product') return prisma.product.count();
  if (resource === 'formula') return prisma.formula.count();
  if (resource === 'quote' || resource === 'sentQuote') return prisma.quote.count();
  return prisma.companyContact.count();
}

describe('Auditoría en la misma transacción que la modificación', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
    vi.spyOn(PrismaAuditLogger.prototype, 'record').mockRejectedValue(new Error('simulated audit failure'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function expectCreationRolledBack(route: (typeof mutatingRoutes)[number]['route'], resource: ScenarioResource) {
    const countBefore = await countStored(resource);

    const body = await creationBodyFor(resource, company, company.owner.id);
    const response = await request(app).post(route.pattern).set('Cookie', ownerCookie).send(body);

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    await expect(countStored(resource)).resolves.toBe(countBefore);
  }

  async function expectBulkUpdateRolledBack(
    route: (typeof mutatingRoutes)[number]['route'],
    scenario: RouteSecurityScenario,
  ) {
    const ordersBefore = await prisma.leadStatusConfig.findMany({ orderBy: { id: 'asc' } });

    const response = await request(app)
      .patch(route.pattern)
      .set('Cookie', ownerCookie)
      .send(scenarioUpdateBody(scenario, company));

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    await expect(prisma.leadStatusConfig.findMany({ orderBy: { id: 'asc' } })).resolves.toEqual(ordersBefore);
  }

  async function expectRecordChangeRolledBack(
    route: (typeof mutatingRoutes)[number]['route'],
    scenario: RouteSecurityScenario,
  ) {
    const resourceId = await persistScenarioResource(scenario.resource, company, company.owner.id);
    const recordBefore = await readScenarioResource(scenario.resource, resourceId);
    const path = buildConcretePath(route, resourceId);

    const response = await requestOnRecord(route, path, ownerCookie, scenario, company);

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    await expect(readScenarioResource(scenario.resource, resourceId)).resolves.toEqual(recordBefore);
  }

  async function expectSelfActionRolledBack(
    route: (typeof mutatingRoutes)[number]['route'],
    scenario: RouteSecurityScenario,
  ) {
    await prepareSelfScenario(scenario, company);
    const ownResourceId = await persistScenarioResource(scenario.resource, company, company.owner.id);
    const recordBefore = await readScenarioResource(scenario.resource, ownResourceId);

    const response = await requestSelf(route, ownerCookie, scenario, company);

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    await expect(readScenarioResource(scenario.resource, ownResourceId)).resolves.toEqual(recordBefore);
  }

  it.each(mutatingRoutes)('$title no deja la modificación si falla su auditoría', async ({ route, scenario }) => {
    if (scenario.operation === 'create') await expectCreationRolledBack(route, scenario.resource);
    else if (scenario.operation === 'self') await expectSelfActionRolledBack(route, scenario);
    else if (scenario.operation === 'bulkUpdate') await expectBulkUpdateRolledBack(route, scenario);
    else await expectRecordChangeRolledBack(route, scenario);
  });
});
