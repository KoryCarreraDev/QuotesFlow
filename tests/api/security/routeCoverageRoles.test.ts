// Matriz de permisos contra la API real, en TODAS las rutas protegidas (R5, F1-T05).
// Lo esperado sale de `permissionMatrix` (F1-T04): si la matriz y la API no coinciden, falla.
// Los casos de negocio concretos (qué leads ve cada rol, qué campos se ignoran) están en `roles.test.ts`.

import type { User as UserRecord } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import { type Grant, permissionMatrix } from '@/application/policies/authorizationPolicy.js';
import { Role } from '@/domain/enums/Role.js';
import { type TenantWithTeam, persistTenantWithTeam } from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import {
  type RouteInventoryEntry,
  authenticatedRoutes,
  buildConcretePath,
  describeRoute,
} from '@tests/support/http/apiRoutes.js';
import {
  type RouteSecurityScenario,
  creationBody,
  persistScenarioResource,
  scenarioFor,
  updateBody,
} from '@tests/support/http/routeSecurityScenarios.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_FORBIDDEN = 403;

type TeamMember = 'owner' | 'partner' | 'salesLeader' | 'salesRep';

const roleOfMember: Record<TeamMember, Role> = {
  owner: Role.OWNER,
  partner: Role.PARTNER,
  salesLeader: Role.SALES_LEADER,
  salesRep: Role.SALES_REP,
};

const cases = authenticatedRoutes.flatMap((route) => {
  const scenario = scenarioFor(route);
  if (!scenario) return [];
  return (Object.keys(roleOfMember) as TeamMember[]).map((member) => {
    const grant: Grant = permissionMatrix[scenario.action][roleOfMember[member]];
    return { title: `${member} en ${describeRoute(route)}: ${grant}`, route, scenario, member, grant };
  });
});

function successStatusFor(scenario: RouteSecurityScenario): number {
  return scenario.operation === 'create' ? HTTP_CREATED : HTTP_OK;
}

describe('Permisos por rol en cada ruta protegida', () => {
  let company: TenantWithTeam;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
  });

  async function sendAs(
    actingUser: UserRecord,
    route: RouteInventoryEntry,
    scenario: RouteSecurityScenario,
    id?: string,
  ) {
    const cookie = sessionCookieFor(actingUser);
    const path = id ? buildConcretePath(route, id) : route.pattern;
    if (route.method === 'GET') return request(app).get(path).set('Cookie', cookie);
    if (route.method === 'PATCH')
      return request(app).patch(path).set('Cookie', cookie).send(updateBody(scenario.resource));
    const body = scenario.operation === 'create' ? creationBody(scenario.resource) : undefined;
    return request(app).post(path).set('Cookie', cookie).send(body);
  }

  /** Códigos HTTP que la API devuelve al actor, por cada situación que aplica a la ruta. */
  async function observeStatuses(actingUser: UserRecord, route: RouteInventoryEntry, scenario: RouteSecurityScenario) {
    if (!targetsOneRecord(scenario)) {
      return { onCollection: (await sendAs(actingUser, route, scenario)).status };
    }

    // Recurso de otro comercial: solo un permiso `all` lo alcanza.
    const someoneElsesResourceId = await persistScenarioResource(scenario.resource, company, company.otherSalesRep.id);
    const ownResourceId = await persistScenarioResource(scenario.resource, company, actingUser.id);
    return {
      onSomeoneElsesRecord: (await sendAs(actingUser, route, scenario, someoneElsesResourceId)).status,
      onOwnRecord: (await sendAs(actingUser, route, scenario, ownResourceId)).status,
    };
  }

  it.each(cases)('$title', async ({ route, scenario, member, grant }) => {
    const observedStatuses = await observeStatuses(company[member], route, scenario);

    expect(observedStatuses).toEqual(expectedStatuses(scenario, grant));
  });
});

function targetsOneRecord(scenario: RouteSecurityScenario): boolean {
  return scenario.operation === 'update' || scenario.operation === 'delete';
}

/** Lo que exige la matriz de permisos para cada situación. */
function expectedStatuses(scenario: RouteSecurityScenario, grant: Grant) {
  if (!targetsOneRecord(scenario)) {
    return { onCollection: grant === 'none' ? HTTP_FORBIDDEN : successStatusFor(scenario) };
  }
  return {
    onSomeoneElsesRecord: grant === 'all' ? HTTP_OK : HTTP_FORBIDDEN,
    onOwnRecord: grant === 'none' ? HTTP_FORBIDDEN : HTTP_OK,
  };
}
