// Escenario de seguridad de cada ruta protegida (R5, F1-T05).
//
// Las suites `tests/api/security/routeCoverage*.test.ts` recorren `authenticatedRoutes` y, para cada ruta,
// usan este escenario para probar el aislamiento entre empresas y la matriz de permisos por rol.
// Una ruta protegida sin escenario hace fallar la suite: ningún endpoint nuevo entra sin esas pruebas.

import request from 'supertest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { Action } from '@/application/policies/authorizationPolicy.js';
import {
  type TenantWithTeam,
  persistCompanyContact,
  persistContact,
  persistLead,
  persistFormula,
  persistLeadStatus,
  TEST_LOGO_PNG,
  persistProduct,
  persistQuote,
  persistTenantLogo,
  persistUser,
  persistUserInvitation,
  testSessionIdFor,
} from '@tests/support/database/persistenceFactories.js';
import { Role } from '@/domain/enums/Role.js';
import { type RouteInventoryEntry, apiPaths, describeRoute } from '@tests/support/http/apiRoutes.js';

/** Recurso de negocio sobre el que actúa la ruta. */
export type ScenarioResource =
  | 'lead'
  | 'leadStatus'
  | 'contact'
  | 'companyContact'
  | 'session'
  | 'user'
  | 'invitation'
  | 'tenant'
  | 'product'
  | 'formula'
  | 'quote'
  | 'sentQuote';

/** Qué hace la ruta con el recurso; decide cómo se prueba. */
/** `read`: lee un registro por su id (F3-T05). */
/** `readOwnFile`: lee un archivo propio (el logo de su empresa, F3-T07); sin archivo, 404. */
/** `transition`: cambia el estado de un registro con un POST sobre su id, sin cuerpo (F3-T05). */
/** `bulkUpdate`: modifica varios registros de la empresa a la vez, sin id en la ruta (reordenar). */
/** `self`: modifica lo propio (sus sesiones, su empresa), sin id en la ruta (F2-T02, F2-T06). */
/** `readOwn`: lee un registro propio que no es una colección (el perfil de su empresa, F2-T06). */
export type ScenarioOperation =
  'list' | 'create' | 'update' | 'delete' | 'bulkUpdate' | 'self' | 'readOwn' | 'readOwnFile' | 'read' | 'transition';

const READ_ONLY_OPERATIONS: ReadonlySet<ScenarioOperation> = new Set(['list', 'read', 'readOwn', 'readOwnFile']);

/** Las rutas de solo lectura no modifican datos: no dejan rastro de auditoría ni hay nada que revertir. */
export function isReadOnlyScenario(scenario: RouteSecurityScenario | undefined): boolean {
  return scenario !== undefined && READ_ONLY_OPERATIONS.has(scenario.operation);
}

export interface RouteSecurityScenario {
  /** Acción de `permissionMatrix` que autoriza la ruta. */
  action: Action;
  resource: ScenarioResource;
  operation: ScenarioOperation;
  /** Código de éxito cuando no es el habitual de la operación (por defecto 201 al crear, 204 en `self`, 200 el resto). */
  successStatus?: number;
  /** Cuerpo propio para `update`, cuando el genérico del recurso no sirve. Recibe la empresa de quien llama. */
  updateBody?: (company: TenantWithTeam) => Record<string, unknown>;
  /** Archivo que la ruta recibe como `multipart/form-data` (subida del logo, F3-T07). */
  attachment?: { field: string; filename: string; contentType: string; content: Buffer };
  /** Deja la empresa en el estado que la ruta necesita para tener efecto (por ejemplo, con logo que quitar). */
  prepare?: (company: TenantWithTeam) => Promise<void>;
}

const HTTP_OK_STATUS = 200;
const HTTP_CREATED_STATUS = 201;
const HTTP_NOT_FOUND_STATUS = 404;

const scenariosByRoute = new Map<string, RouteSecurityScenario>([
  [`POST ${apiPaths.auth.logoutAll}`, { action: Action.SESSION_REVOKE_OWN, resource: 'session', operation: 'self' }],

  [`GET ${apiPaths.tenant.profile}`, { action: Action.TENANT_VIEW, resource: 'tenant', operation: 'readOwn' }],
  [
    `PATCH ${apiPaths.tenant.profile}`,
    { action: Action.TENANT_UPDATE, resource: 'tenant', operation: 'self', successStatus: HTTP_OK_STATUS },
  ],
  // Ninguna empresa de los escenarios tiene logo: leerlo responde 404, y eso ya prueba que el permiso se concedió.
  [
    `GET ${apiPaths.tenant.logo}`,
    { action: Action.TENANT_VIEW, resource: 'tenant', operation: 'readOwnFile', successStatus: HTTP_NOT_FOUND_STATUS },
  ],
  [
    `PUT ${apiPaths.tenant.logo}`,
    {
      action: Action.TENANT_UPDATE,
      resource: 'tenant',
      operation: 'self',
      successStatus: HTTP_OK_STATUS,
      attachment: { field: 'file', filename: 'logo.png', contentType: 'image/png', content: TEST_LOGO_PNG },
      prepare: async (company) => void (await persistTenantLogo(company.tenant.id)),
    },
  ],
  [
    `DELETE ${apiPaths.tenant.logo}`,
    {
      action: Action.TENANT_UPDATE,
      resource: 'tenant',
      operation: 'self',
      prepare: async (company) => void (await persistTenantLogo(company.tenant.id)),
    },
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

  [`GET ${apiPaths.quotes.filtered}`, { action: Action.QUOTE_LIST, resource: 'quote', operation: 'list' }],
  [`POST ${apiPaths.quotes.create}`, { action: Action.QUOTE_CREATE, resource: 'quote', operation: 'create' }],
  [`GET ${apiPaths.quotes.get(':id')}`, { action: Action.QUOTE_LIST, resource: 'quote', operation: 'read' }],
  [`GET ${apiPaths.quotes.pdf(':id')}`, { action: Action.QUOTE_LIST, resource: 'quote', operation: 'read' }],
  [`PATCH ${apiPaths.quotes.update(':id')}`, { action: Action.QUOTE_UPDATE, resource: 'quote', operation: 'update' }],
  [`DELETE ${apiPaths.quotes.delete(':id')}`, { action: Action.QUOTE_DELETE, resource: 'quote', operation: 'delete' }],
  [`POST ${apiPaths.quotes.send(':id')}`, { action: Action.QUOTE_SEND, resource: 'quote', operation: 'transition' }],
  [
    `POST ${apiPaths.quotes.accept(':id')}`,
    { action: Action.QUOTE_DECIDE, resource: 'sentQuote', operation: 'transition' },
  ],
  [
    `POST ${apiPaths.quotes.reject(':id')}`,
    { action: Action.QUOTE_DECIDE, resource: 'sentQuote', operation: 'transition' },
  ],
  [
    `POST ${apiPaths.quotes.revise(':id')}`,
    { action: Action.QUOTE_UPDATE, resource: 'sentQuote', operation: 'transition', successStatus: HTTP_CREATED_STATUS },
  ],

  [`GET ${apiPaths.formulas.filtered}`, { action: Action.FORMULA_LIST, resource: 'formula', operation: 'list' }],
  [`POST ${apiPaths.formulas.create}`, { action: Action.FORMULA_CREATE, resource: 'formula', operation: 'create' }],
  [
    `PATCH ${apiPaths.formulas.update(':id')}`,
    { action: Action.FORMULA_UPDATE, resource: 'formula', operation: 'update' },
  ],
  [
    `DELETE ${apiPaths.formulas.delete(':id')}`,
    { action: Action.FORMULA_DELETE, resource: 'formula', operation: 'delete' },
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
  // Las fórmulas tampoco: son de la empresa; el autor es el dueño.
  if (resource === 'formula') return (await persistFormula(tenantId, company.owner.id)).id;
  // Las cotizaciones son de quien las creó; `ownerUserId` es su autor (F3-T05).
  if (resource === 'quote' || resource === 'sentQuote') {
    const status = resource === 'sentQuote' ? 'SENT' : 'DRAFT';
    return (await persistQuote(tenantId, ownerUserId ?? company.owner.id, { status })).id;
  }
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
  if (resource === 'formula') {
    return { name: 'Fórmula Escenario', expression: 'ancho * 2', variables: [{ name: 'ancho', label: 'Ancho' }] };
  }
  return { name: 'Empresa Escenario SAS' };
}

/**
 * Cuerpo válido para crear el recurso por parte de `actingUserId`, que puede necesitar datos propios: una cotización
 * solo se hace a un cliente al alcance de quien la crea (un comercial, a los suyos).
 */
export async function creationBodyFor(
  resource: ScenarioResource,
  company: TenantWithTeam,
  actingUserId: string,
): Promise<Record<string, unknown>> {
  if (resource !== 'quote') return creationBody(resource);
  const contact = await persistContact(company.tenant.id, { ownerId: actingUserId });
  return {
    contactId: contact.id,
    items: [{ description: 'Instalación', quantity: 1, unitPrice: '150000', taxRate: '19' }],
  };
}

/** Deja la empresa lista para un escenario `self` que lo necesite (ver `RouteSecurityScenario.prepare`). */
export async function prepareSelfScenario(scenario: RouteSecurityScenario, company: TenantWithTeam): Promise<void> {
  await scenario.prepare?.(company);
}

/** Pide una ruta `self` (sin id) con la cookie de quien actúa: modificar, subir un archivo, borrar o un POST sin cuerpo. */
export async function requestSelf(
  route: RouteInventoryEntry,
  cookie: string,
  scenario: RouteSecurityScenario,
  company: TenantWithTeam,
): Promise<request.Response> {
  const agent = request(app);
  if (route.method === 'DELETE') return agent.delete(route.pattern).set('Cookie', cookie);
  if (route.method === 'PUT' && scenario.attachment) {
    const { field, filename, contentType, content } = scenario.attachment;
    return agent.put(route.pattern).set('Cookie', cookie).attach(field, content, { filename, contentType });
  }
  if (route.method === 'PATCH') {
    return agent.patch(route.pattern).set('Cookie', cookie).send(scenarioUpdateBody(scenario, company));
  }
  return agent.post(route.pattern).set('Cookie', cookie);
}

/** Pide la ruta del escenario sobre un registro concreto, con la cookie de quien actúa. */
export async function requestOnRecord(
  route: RouteInventoryEntry,
  path: string,
  cookie: string,
  scenario: RouteSecurityScenario,
  company: TenantWithTeam,
): Promise<request.Response> {
  if (route.method === 'GET') return request(app).get(path).set('Cookie', cookie);
  if (route.method === 'PATCH') {
    return request(app).patch(path).set('Cookie', cookie).send(scenarioUpdateBody(scenario, company));
  }
  if (route.method === 'POST') return request(app).post(path).set('Cookie', cookie);
  return request(app).delete(path).set('Cookie', cookie);
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
  if (resource === 'formula') return { name: 'Fórmula modificada' };
  if (resource === 'quote') return { notes: 'Modificada en el escenario' };
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
  if (resource === 'formula') return prisma.formula.findUnique({ where: { id } });
  if (resource === 'quote' || resource === 'sentQuote') {
    return prisma.quote.findUnique({ where: { id }, include: { items: true } });
  }
  return prisma.companyContact.findUnique({ where: { id } });
}

/** Ids de los registros que trae una respuesta de listado (`getAll` devuelve un array; `filtered`, `{ data }`). */
export function listedIds(responseBody: unknown): string[] {
  const records = Array.isArray(responseBody) ? responseBody : (responseBody as { data: unknown[] }).data;
  return (records as Array<{ id: string }>).map((record) => record.id);
}
