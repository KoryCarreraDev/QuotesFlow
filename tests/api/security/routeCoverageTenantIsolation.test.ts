// Aislamiento por tenant sobre TODO el inventario de rutas protegidas (R5, F1-T05).
// Complementa a `tenantIsolation.test.ts`, que prueba casos concretos: esta suite garantiza que ninguna
// ruta protegida queda sin prueba de aislamiento, porque falla si una ruta no tiene escenario.

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import { type TenantWithTeam, persistTenantWithTeam } from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import {
  type RouteInventoryEntry,
  authenticatedRoutes,
  buildConcretePath,
  describeRoute,
} from '@tests/support/http/apiRoutes.js';
import { ROLE_COVERAGE_GROUPS } from '@tests/support/http/rolePermissionCoverage.js';
import {
  type RouteSecurityScenario,
  creationBody,
  declaredScenarioRoutes,
  listedIds,
  persistScenarioResource,
  readScenarioResource,
  scenarioFor,
  scenarioUpdateBody,
} from '@tests/support/http/routeSecurityScenarios.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NOT_FOUND = 404;

const routesWithScenario = authenticatedRoutes.flatMap((route) => {
  const scenario = scenarioFor(route);
  return scenario ? [{ title: describeRoute(route), route, scenario }] : [];
});

describe('Cobertura de seguridad del inventario de rutas', () => {
  it('toda ruta protegida declara su escenario en tests/support/http/routeSecurityScenarios.ts', () => {
    const uncoveredRoutes = authenticatedRoutes.filter((route) => !scenarioFor(route)).map(describeRoute);

    // Si falla: la ruta nueva necesita su escenario (acción de la matriz, recurso y operación).
    expect(uncoveredRoutes).toEqual([]);
  });

  it('cada recurso con escenario está en un grupo de la suite de permisos por rol', () => {
    const coveredResources = new Set(Object.values(ROLE_COVERAGE_GROUPS).flat());
    const scenarioResources = authenticatedRoutes.flatMap((route) => scenarioFor(route)?.resource ?? []);

    expect(scenarioResources.filter((resource) => !coveredResources.has(resource))).toEqual([]);
  });

  it('no hay escenarios de rutas que ya no existen', () => {
    const inventoryRoutes = new Set(authenticatedRoutes.map(describeRoute));

    expect(declaredScenarioRoutes().filter((route) => !inventoryRoutes.has(route))).toEqual([]);
  });
});

describe('Aislamiento por tenant en cada ruta protegida', () => {
  let victimCompany: TenantWithTeam;
  let intruderCompany: TenantWithTeam;
  let intruderCookie: string;

  beforeEach(async () => {
    victimCompany = await persistTenantWithTeam({ name: 'Empresa Víctima SAS' });
    intruderCompany = await persistTenantWithTeam({ name: 'Empresa Intrusa SAS' });
    // El dueño es el rol con más permisos dentro de su propia empresa.
    intruderCookie = sessionCookieFor(intruderCompany.owner);
  });

  async function expectListExcludesForeignRecords(route: RouteInventoryEntry, scenario: RouteSecurityScenario) {
    const victimResourceId = await persistScenarioResource(scenario.resource, victimCompany, victimCompany.owner.id);

    const response = await request(app).get(route.pattern).set('Cookie', intruderCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(listedIds(response.body)).not.toContain(victimResourceId);
  }

  async function expectCreationStaysInOwnTenant(route: RouteInventoryEntry, scenario: RouteSecurityScenario) {
    // Intento de asignación masiva: el cuerpo trae el tenant de la víctima.
    const response = await request(app)
      .post(route.pattern)
      .set('Cookie', intruderCookie)
      .send({ ...creationBody(scenario.resource), tenantId: victimCompany.tenant.id });

    expect(response.status).toBe(HTTP_CREATED);
    const createdRecord = (await readScenarioResource(scenario.resource, response.body.id)) as { tenantId: string };
    expect(createdRecord.tenantId).toBe(intruderCompany.tenant.id);
  }

  async function expectForeignRecordUntouched(route: RouteInventoryEntry, scenario: RouteSecurityScenario) {
    const victimResourceId = await persistScenarioResource(scenario.resource, victimCompany, victimCompany.owner.id);
    const recordBefore = await readScenarioResource(scenario.resource, victimResourceId);
    const path = buildConcretePath(route, victimResourceId);

    const response =
      route.method === 'PATCH'
        ? await request(app)
            .patch(path)
            .set('Cookie', intruderCookie)
            .send(scenarioUpdateBody(scenario, intruderCompany))
        : await request(app).post(path).set('Cookie', intruderCookie);

    expect(response.status).toBe(HTTP_NOT_FOUND);
    await expect(readScenarioResource(scenario.resource, victimResourceId)).resolves.toEqual(recordBefore);
  }

  it.each(routesWithScenario)('$title no alcanza datos de otra empresa', async ({ route, scenario }) => {
    if (scenario.operation === 'list') await expectListExcludesForeignRecords(route, scenario);
    else if (scenario.operation === 'create') await expectCreationStaysInOwnTenant(route, scenario);
    else await expectForeignRecordUntouched(route, scenario);
  });
});
