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
  persistProduct,
  persistUser,
  persistUserInvitation,
  testSessionIdFor,
} from '@tests/support/database/persistenceFactories.js';
import { Role } from '@/domain/enums/Role.js';
import { type RouteInventoryEntry, apiPaths, describeRoute } from '@tests/support/http/apiRoutes.js';

/** Recurso de negocio sobre el que actúa la ruta. */
export type ScenarioResource =
  'lead' | 'leadStatus' | 'contact' | 'companyContact' | 'session' | 'user' | 'invitation' | 'tenant' | 'product';

/** Qué hace la ruta con el recurso; decide cómo se prueba. */
/** `bulkUpdate`: modifica varios registros de la empresa a la vez, sin id en la ruta (reordenar). */
/** `self`: modifica lo propio (sus sesiones, su empresa), sin id en la ruta (F2-T02, F2-T06). */
/** `readOwn`: lee un registro propio que no es una colección (el perfil de su empresa, F2-T06). */
export type ScenarioOperation = 'list' | 'create' | 'update' | 'delete' | 'bulkUpdate' | 'self' | 'readOwn';

export interface RouteSecurityScenario {
  /** Acción de `permissionMatrix` que autoriza la ruta. */
  action: Action;
  resource: ScenarioResource;
  operation: ScenarioOperation;
  /** Código de éxito cuando no es el habitual de la operación (por defecto 201 al crear, 204 en `self`, 200 el resto). */
  successStatus?: number;
  /** Cuerpo propio para `update`, cuando el genérico del recurso no sirve. Recibe la empresa de quien llama. */
  updateBody?: (company: TenantWithTeam) => Record<string, unknown>;
}

const HTTP_OK_STATUS = 200;

const scenariosByRoute = new Map<string, RouteSecurityScenario>([
  [`POST ${apiPaths.auth.logoutAll}`, { action: Action.SESSION_REVOKE_OWN, resource: 'session', operation: 'self' }],

  [`GET ${apiPaths.tenant.profile}`, { action: Action.TENANT_VIEW, resource: 'tenant', operation: 'readOwn' }],
  [
    `PATCH ${apiPaths.tenant.profile}`,
    { action: Action.TENANT_UPDATE, resource: 'tenant', operation: 'self', successStatus: HTTP_OK_STATUS },
  ],

  [`GET ${apiPaths.users.getAll}`, { action: Action.USER_LIST, resource: 'user', operation: 'list' }],
  [`PATCH ${apiPaths.users.update(':id')}`, { action: Action.USER_MANAGE, resource: 'user', operation: 'update' }],
  [`GET ${apiPaths.users.invitations}`, { action: Action.USER_LIST, resource: 'invitation', operation: 'list' }],
  [`POST ${apiPaths.users.invite}`, { action: Action.USER_INVITE, resource: 'invitation', operation: 'create' }],
  [
    `DELETE ${apiPaths.users.revokeInvitation(':id')}`,
    { action: Action.USER_INVITE, resource: 'invitation', operation: 'delete' },
  ],

  [`GET ${apiPaths.leads.getAll}`, { action: Action.LEAD_LIST, resource: 'lead', operation: 'list' }],
  [`GET ${apiPaths.leads.filtered}`, { action: Action.LEAD_LIST, resource: 'lead', operation: 'list' }],
  [`POST ${apiPaths.leads.create}`, { action: Action.LEAD_CREATE, resource: 'lead', operation: 'create' }],
  [`PATCH ${apiPaths.leads.update(':id')}`, { action: Action.LEAD_UPDATE, resource: 'lead', operation: 'update' }],
  [`DELETE ${apiPaths.leads.delete(':id')}`, { action: Action.LEAD_DELETE, resource: 'lead', operation: 'delete' }],
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

  [
    `DELETE ${apiPaths.leadStatusConfigs.delete(':id')}`,
    { action: Action.LEAD_STATUS_DELETE, resource: 'leadStatus', operation: 'delete' },
  ],
  [
    `PATCH ${apiPaths.leadStatusConfigs.reorder}`,
    {
      action: Action.LEAD_STATUS_UPDATE,
      resource: 'leadStatus',
      operation: 'bulkUpdate',
      updateBody: (company) => ({ statusIds: [...company.leadStatuses].reverse().map((status) => status.id) }),
    },
  ],

  [`GET ${apiPaths.contacts.getAll}`, { action: Action.CONTACT_LIST, resource: 'contact', operation: 'list' }],
  [`GET ${apiPaths.contacts.filtered}`, { action: Action.CONTACT_LIST, resource: 'contact', operation: 'list' }],
  [`POST ${apiPaths.contacts.create}`, { action: Action.CONTACT_CREATE, resource: 'contact', operation: 'create' }],
  [
    `PATCH ${apiPaths.contacts.update(':id')}`,
    { action: Action.CONTACT_UPDATE, resource: 'contact', operation: 'update' },
  ],

  [
    `DELETE ${apiPaths.contacts.delete(':id')}`,
    { action: Action.CONTACT_DELETE, resource: 'contact', operation: 'delete' },
  ],

  [
    `DELETE ${apiPaths.companyContacts.delete(':id')}`,
    { action: Action.COMPANY_CONTACT_DELETE, resource: 'companyContact', operation: 'delete' },
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

  [`GET ${apiPaths.products.filtered}`, { action: Action.PRODUCT_LIST, resource: 'product', operation: 'list' }],
  [`POST ${apiPaths.products.create}`, { action: Action.PRODUCT_CREATE, resource: 'product', operation: 'create' }],
  [
    `PATCH ${apiPaths.products.update(':id')}`,
    { action: Action.PRODUCT_UPDATE, resource: 'product', operation: 'update' },
  ],
  [
    `DELETE ${apiPaths.products.delete(':id')}`,
    { action: Action.PRODUCT_DELETE, resource: 'product', operation: 'delete' },
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
 * @param ownerUserId Responsable del recurso: `assignedToId` en leads, `ownerId` en clientes. Los estados no tienen.
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
  if (resource === 'contact') return (await persistContact(tenantId, { ownerId: ownerUserId })).id;
  // La sesión de test que `persistUser` abrió para el responsable.
  if (resource === 'session') return testSessionIdFor(ownerUserId ?? company.owner.id);
  if (resource === 'tenant') return tenantId;
  // Usuarios e invitaciones no tienen responsable: siempre un comercial, que todo rol de gestión gestiona.
  if (resource === 'user') return (await persistUser(tenantId, { role: Role.SALES_REP })).id;
  if (resource === 'invitation') return (await persistUserInvitation(tenantId, company.owner.id)).id;
  // Los productos no tienen responsable: son del catálogo de la empresa.
  if (resource === 'product') return (await persistProduct(tenantId)).id;
  return (await persistCompanyContact(tenantId, { ownerId: ownerUserId })).id;
}

/** Cuerpo válido para crear el recurso. */
export function creationBody(resource: ScenarioResource): Record<string, unknown> {
  if (resource === 'lead') return { contactName: 'Cliente Escenario' };
  if (resource === 'leadStatus') {
    nextStatusOrder += 1;
    return { name: `Estado ${nextStatusOrder}`, order: nextStatusOrder };
  }
  if (resource === 'contact') return { firstName: 'Julián', lastName: 'Escenario' };
  if (resource === 'invitation') {
    nextStatusOrder += 1;
    return { email: `invitado.escenario.${nextStatusOrder}@example.com`, role: Role.SALES_REP };
  }
  if (resource === 'product') return { name: 'Producto Escenario', basePrice: '150000' };
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
  if (resource === 'user') return { isActive: false };
  if (resource === 'tenant') return { timezone: 'America/Lima' };
  if (resource === 'product') return { name: 'Producto modificado' };
  return { city: 'Modificada' };
}

/** Estado guardado del recurso, para comprobar que una petición rechazada no lo cambió. */
export async function readScenarioResource(resource: ScenarioResource, id: string): Promise<unknown> {
  if (resource === 'lead') return prisma.lead.findUnique({ where: { id } });
  if (resource === 'leadStatus') return prisma.leadStatusConfig.findUnique({ where: { id } });
  if (resource === 'contact') return prisma.contact.findUnique({ where: { id } });
  if (resource === 'session') return prisma.userSession.findUnique({ where: { id } });
  if (resource === 'user') return prisma.user.findUnique({ where: { id } });
  if (resource === 'invitation') return prisma.userInvitation.findUnique({ where: { id } });
  if (resource === 'tenant') return prisma.tenant.findUnique({ where: { id }, include: { tenantSettings: true } });
  if (resource === 'product') return prisma.product.findUnique({ where: { id } });
  return prisma.companyContact.findUnique({ where: { id } });
}

/** Ids de los registros que trae una respuesta de listado (`getAll` devuelve un array; `filtered`, `{ data }`). */
export function listedIds(responseBody: unknown): string[] {
  const records = Array.isArray(responseBody) ? responseBody : (responseBody as { data: unknown[] }).data;
  return (records as Array<{ id: string }>).map((record) => record.id);
}
