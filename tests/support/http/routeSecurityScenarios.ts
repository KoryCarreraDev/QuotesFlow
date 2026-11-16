// Escenario de seguridad de cada ruta protegida (R5, F1-T05).
//
// Las suites `tests/api/security/routeCoverage*.test.ts` recorren `authenticatedRoutes` y, para cada ruta,
// usan este escenario para probar el aislamiento entre empresas y la matriz de permisos por rol.
// Una ruta protegida sin escenario hace fallar la suite: ningún endpoint nuevo entra sin esas pruebas.

import prisma from '@/config/database.js';
import { Action } from '@/application/policies/authorizationPolicy.js';
import {
  type TenantWithTeam,
  persistCompanyContact,
  persistContact,
  persistLead,
  persistLeadStatus,
} from '@tests/support/database/persistenceFactories.js';
import { type RouteInventoryEntry, apiPaths, describeRoute } from '@tests/support/http/apiRoutes.js';

/** Recurso de negocio sobre el que actúa la ruta. */
export type ScenarioResource = 'lead' | 'leadStatus' | 'contact' | 'companyContact';

/** Qué hace la ruta con el recurso; decide cómo se prueba. */
export type ScenarioOperation = 'list' | 'create' | 'update' | 'delete';

export interface RouteSecurityScenario {
  /** Acción de `permissionMatrix` que autoriza la ruta. */
  action: Action;
  resource: ScenarioResource;
  operation: ScenarioOperation;
  /** Cuerpo propio para `update`, cuando el genérico del recurso no sirve. Recibe la empresa de quien llama. */
  updateBody?: (company: TenantWithTeam) => Record<string, unknown>;
}

const scenariosByRoute = new Map<string, RouteSecurityScenario>([
  [`GET ${apiPaths.leads.getAll}`, { action: Action.LEAD_LIST, resource: 'lead', operation: 'list' }],
  [`GET ${apiPaths.leads.filtered}`, { action: Action.LEAD_LIST, resource: 'lead', operation: 'list' }],
  [`POST ${apiPaths.leads.create}`, { action: Action.LEAD_CREATE, resource: 'lead', operation: 'create' }],
  [`PATCH ${apiPaths.leads.update(':id')}`, { action: Action.LEAD_UPDATE, resource: 'lead', operation: 'update' }],
  [`POST ${apiPaths.leads.delete(':id')}`, { action: Action.LEAD_DELETE, resource: 'lead', operation: 'delete' }],
  [
    `PATCH ${apiPaths.leads.changeStatus(':id')}`,
    {
      action: Action.LEAD_UPDATE,
      resource: 'lead',
      operation: 'update',
      updateBody: (company) => ({ statusId: company.leadStatuses[1].id }),
    },
  ],

  [
    `GET ${apiPaths.leadStatusConfigs.getAll}`,
    { action: Action.LEAD_STATUS_LIST, resource: 'leadStatus', operation: 'list' },
  ],
  [
    `POST ${apiPaths.leadStatusConfigs.create}`,
    { action: Action.LEAD_STATUS_CREATE, resource: 'leadStatus', operation: 'create' },
  ],
  [
    `PATCH ${apiPaths.leadStatusConfigs.update(':id')}`,
    { action: Action.LEAD_STATUS_UPDATE, resource: 'leadStatus', operation: 'update' },
  ],

  [`GET ${apiPaths.contacts.getAll}`, { action: Action.CONTACT_LIST, resource: 'contact', operation: 'list' }],
  [`GET ${apiPaths.contacts.filtered}`, { action: Action.CONTACT_LIST, resource: 'contact', operation: 'list' }],
  [`POST ${apiPaths.contacts.create}`, { action: Action.CONTACT_CREATE, resource: 'contact', operation: 'create' }],
  [
    `PATCH ${apiPaths.contacts.update(':id')}`,
    { action: Action.CONTACT_UPDATE, resource: 'contact', operation: 'update' },
  ],

  [
    `GET ${apiPaths.companyContacts.getAll}`,
    { action: Action.COMPANY_CONTACT_LIST, resource: 'companyContact', operation: 'list' },
  ],
  [
    `GET ${apiPaths.companyContacts.filtered}`,
    { action: Action.COMPANY_CONTACT_LIST, resource: 'companyContact', operation: 'list' },
  ],
  [
    `POST ${apiPaths.companyContacts.create}`,
    { action: Action.COMPANY_CONTACT_CREATE, resource: 'companyContact', operation: 'create' },
  ],
  [
    `PATCH ${apiPaths.companyContacts.update(':id')}`,
    { action: Action.COMPANY_CONTACT_UPDATE, resource: 'companyContact', operation: 'update' },
  ],
]);

/** Escenario de una ruta, o `undefined` si nadie lo ha declarado (la suite de cobertura lo reporta). */
export function scenarioFor(route: RouteInventoryEntry): RouteSecurityScenario | undefined {
  return scenariosByRoute.get(describeRoute(route));
}

export function declaredScenarioRoutes(): string[] {
  return [...scenariosByRoute.keys()];
}

// El orden de los estados es único por empresa; los estados por defecto usan del 1 al 5.
const FIRST_FREE_STATUS_ORDER = 100;
let nextStatusOrder = FIRST_FREE_STATUS_ORDER;

/**
 * Crea un recurso del tipo indicado en la empresa y devuelve su id.
 *
 * @param ownerUserId Responsable del recurso. Solo los leads tienen responsable (`assignedToId`).
 */
export async function persistScenarioResource(
  resource: ScenarioResource,
  company: TenantWithTeam,
  ownerUserId?: string,
): Promise<string> {
  const tenantId = company.tenant.id;
  if (resource === 'lead') {
    return (await persistLead(tenantId, { statusId: company.defaultLeadStatus.id, assignedToId: ownerUserId })).id;
  }
  if (resource === 'leadStatus') {
    nextStatusOrder += 1;
    return (await persistLeadStatus(tenantId, { name: `Estado ${nextStatusOrder}`, order: nextStatusOrder })).id;
  }
  if (resource === 'contact') return (await persistContact(tenantId)).id;
  return (await persistCompanyContact(tenantId)).id;
}

/** Cuerpo válido para crear el recurso. */
export function creationBody(resource: ScenarioResource): Record<string, unknown> {
  if (resource === 'lead') return { contactName: 'Cliente Escenario' };
  if (resource === 'leadStatus') {
    nextStatusOrder += 1;
    return { name: `Estado ${nextStatusOrder}`, order: nextStatusOrder };
  }
  if (resource === 'contact') return { firstName: 'Julián', lastName: 'Escenario' };
  return { name: 'Empresa Escenario SAS' };
}

/** Cuerpo válido para la ruta de modificación del escenario, enviado por un usuario de `company`. */
export function scenarioUpdateBody(scenario: RouteSecurityScenario, company: TenantWithTeam): Record<string, unknown> {
  return scenario.updateBody ? scenario.updateBody(company) : updateBody(scenario.resource);
}

/** Cuerpo válido para modificar el recurso. */
export function updateBody(resource: ScenarioResource): Record<string, unknown> {
  if (resource === 'lead') return { notes: 'Modificado en el escenario' };
  if (resource === 'leadStatus') return { name: 'Modificado en el escenario' };
  if (resource === 'contact') return { lastName: 'Modificado' };
  return { city: 'Modificada' };
}

/** Estado guardado del recurso, para comprobar que una petición rechazada no lo cambió. */
export async function readScenarioResource(resource: ScenarioResource, id: string): Promise<unknown> {
  if (resource === 'lead') return prisma.lead.findUnique({ where: { id } });
  if (resource === 'leadStatus') return prisma.leadStatusConfig.findUnique({ where: { id } });
  if (resource === 'contact') return prisma.contact.findUnique({ where: { id } });
  return prisma.companyContact.findUnique({ where: { id } });
}

/** Ids de los registros que trae una respuesta de listado (`getAll` devuelve un array; `filtered`, `{ data }`). */
export function listedIds(responseBody: unknown): string[] {
  const records = Array.isArray(responseBody) ? responseBody : (responseBody as { data: unknown[] }).data;
  return (records as Array<{ id: string }>).map((record) => record.id);
}
