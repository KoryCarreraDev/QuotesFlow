import { Role } from '../../domain/enums/Role.js';

/** Quién intenta hacer algo: el usuario de la sesión y su rol. */
export interface Actor {
  role: Role;
  /** Sin él, ningún permiso de alcance `own` se concede. */
  userId?: string;
}

/** Recurso con responsable; las acciones con alcance "solo los suyos" comparan contra él. */
export interface OwnedResource {
  /** Usuario responsable del recurso (por ejemplo, `assignedToId` de un lead). */
  ownerUserId?: string;
}

/** Acciones que la API autoriza. El valor es el nombre que aparece en `docs/security/matriz-permisos.md`. */
export enum Action {
  LEAD_LIST = 'lead:list',
  LEAD_CREATE = 'lead:create',
  LEAD_ASSIGN_TO_OTHERS = 'lead:assign-to-others',
  LEAD_UPDATE = 'lead:update',
  LEAD_REASSIGN = 'lead:reassign',
  LEAD_DELETE = 'lead:delete',
  LEAD_STATUS_LIST = 'lead-status:list',
  LEAD_STATUS_CREATE = 'lead-status:create',
  LEAD_STATUS_UPDATE = 'lead-status:update',
  LEAD_STATUS_DELETE = 'lead-status:delete',
  CONTACT_LIST = 'contact:list',
  CONTACT_CREATE = 'contact:create',
  CONTACT_UPDATE = 'contact:update',
  CONTACT_DELETE = 'contact:delete',
  CONTACT_ASSIGN_OWNER = 'contact:assign-owner',
  COMPANY_CONTACT_LIST = 'company-contact:list',
  COMPANY_CONTACT_CREATE = 'company-contact:create',
  COMPANY_CONTACT_UPDATE = 'company-contact:update',
  COMPANY_CONTACT_DELETE = 'company-contact:delete',
  COMPANY_CONTACT_ASSIGN_OWNER = 'company-contact:assign-owner',
  SESSION_REVOKE_OWN = 'session:revoke-own',
  USER_LIST = 'user:list',
  USER_INVITE = 'user:invite',
  USER_MANAGE = 'user:manage',
  TENANT_VIEW = 'tenant:view',
  TENANT_UPDATE = 'tenant:update',
  PRODUCT_LIST = 'product:list',
  PRODUCT_CREATE = 'product:create',
  PRODUCT_UPDATE = 'product:update',
  PRODUCT_DELETE = 'product:delete',
  FORMULA_LIST = 'formula:list',
  FORMULA_CREATE = 'formula:create',
  FORMULA_UPDATE = 'formula:update',
  FORMULA_DELETE = 'formula:delete',
  QUOTE_LIST = 'quote:list',
  QUOTE_CREATE = 'quote:create',
  QUOTE_UPDATE = 'quote:update',
  QUOTE_DELETE = 'quote:delete',
  QUOTE_SEND = 'quote:send',
  QUOTE_DECIDE = 'quote:decide',
  QUOTE_CREATE_FROM_LEAD = 'quote:create-from-lead',
}

/**
 * Alcance de un permiso:
 * - `all`: sobre cualquier recurso de su empresa.
 * - `own`: solo sobre los recursos de los que es responsable.
 * - `none`: nunca.
 */
export type Grant = 'all' | 'own' | 'none';

export type PermissionMatrix = Readonly<Record<Action, Readonly<Record<Role, Grant>>>>;

const everyone: Record<Role, Grant> = {
  [Role.OWNER]: 'all',
  [Role.PARTNER]: 'all',
  [Role.SALES_LEADER]: 'all',
  [Role.SALES_REP]: 'all',
};

const managementOnly: Record<Role, Grant> = {
  [Role.OWNER]: 'all',
  [Role.PARTNER]: 'all',
  [Role.SALES_LEADER]: 'all',
  [Role.SALES_REP]: 'none',
};

// D-16: el socio tiene los permisos del dueño salvo suscripción y borrar la empresa.
const ownerAndPartner: Record<Role, Grant> = {
  [Role.OWNER]: 'all',
  [Role.PARTNER]: 'all',
  [Role.SALES_LEADER]: 'none',
  [Role.SALES_REP]: 'none',
};

const managementOrOwnForSalesRep: Record<Role, Grant> = {
  [Role.OWNER]: 'all',
  [Role.PARTNER]: 'all',
  [Role.SALES_LEADER]: 'all',
  [Role.SALES_REP]: 'own',
};

/**
 * Única fuente de verdad de los permisos (H12). Cambiar una celda cambia lo que la API permite
 * y exige regenerar y volver a firmar `docs/security/matriz-permisos.md` (`pnpm docs:permissions`).
 *
 * Todo ocurre dentro del tenant de la sesión: el aislamiento entre empresas lo garantizan los
 * repositorios, no esta matriz.
 */
export const permissionMatrix: PermissionMatrix = {
  [Action.LEAD_LIST]: managementOrOwnForSalesRep,
  [Action.LEAD_CREATE]: everyone,
  // Un comercial crea leads, pero siempre asignados a él mismo.
  [Action.LEAD_ASSIGN_TO_OTHERS]: managementOnly,
  [Action.LEAD_UPDATE]: managementOrOwnForSalesRep,
  // Si un comercial envía `assignedToId`, se ignora: no puede pasar su lead a otro.
  [Action.LEAD_REASSIGN]: managementOnly,
  [Action.LEAD_DELETE]: managementOrOwnForSalesRep,
  [Action.LEAD_STATUS_LIST]: everyone,
  [Action.LEAD_STATUS_CREATE]: managementOnly,
  [Action.LEAD_STATUS_UPDATE]: managementOnly,
  [Action.LEAD_STATUS_DELETE]: managementOnly,
  // D-18 (F1-T17): un comercial solo ve y modifica los clientes de los que es responsable; los clientes
  // sin responsable (previos a F1-T17, Q-005) solo los ve gestión.
  [Action.CONTACT_LIST]: managementOrOwnForSalesRep,
  // Lo que crea un comercial queda a su nombre.
  [Action.CONTACT_CREATE]: everyone,
  [Action.CONTACT_UPDATE]: managementOrOwnForSalesRep,
  [Action.CONTACT_ASSIGN_OWNER]: managementOnly,
  // Borrar clientes queda para gestión mientras no tengan responsable (Q-012; F1-T17 añade ownerId).
  [Action.CONTACT_DELETE]: managementOnly,
  [Action.COMPANY_CONTACT_LIST]: managementOrOwnForSalesRep,
  [Action.COMPANY_CONTACT_CREATE]: everyone,
  [Action.COMPANY_CONTACT_UPDATE]: managementOrOwnForSalesRep,
  [Action.COMPANY_CONTACT_ASSIGN_OWNER]: managementOnly,
  [Action.COMPANY_CONTACT_DELETE]: managementOnly,
  // F2-T02: cualquiera cierra todas sus propias sesiones; nunca las de otro usuario.
  [Action.SESSION_REVOKE_OWN]: everyone,
  // F2-T05 (D-16, D-17): gestión de usuarios. Además del permiso, cada rol solo invita y gestiona los roles de
  // `manageableRolesByRole`; nadie gestiona al dueño ni a sí mismo.
  [Action.USER_LIST]: managementOnly,
  // Invitar y revocar invitaciones.
  [Action.USER_INVITE]: managementOnly,
  // Cambiar el rol, desactivar o reactivar.
  [Action.USER_MANAGE]: managementOnly,
  // F2-T06: el perfil de la empresa lo ve todo el equipo; lo cambian el dueño y el socio.
  [Action.TENANT_VIEW]: everyone,
  [Action.TENANT_UPDATE]: ownerAndPartner,
  // F3-T02: el catálogo lo consulta todo el equipo para cotizar; lo gestionan los roles de gestión, como los
  // estados de lead (supuesto pendiente de confirmar por el dueño de producto).
  [Action.PRODUCT_LIST]: everyone,
  [Action.PRODUCT_CREATE]: managementOnly,
  [Action.PRODUCT_UPDATE]: managementOnly,
  [Action.PRODUCT_DELETE]: managementOnly,
  // F3-T04: el comercial consulta las fórmulas para saber qué variables llenar; las gestiona gestión, igual que
  // los productos (supuesto pendiente de confirmar).
  [Action.FORMULA_LIST]: everyone,
  [Action.FORMULA_CREATE]: managementOnly,
  [Action.FORMULA_UPDATE]: managementOnly,
  [Action.FORMULA_DELETE]: managementOnly,
  // F3-T05: un comercial ve y trabaja solo las cotizaciones que creó; gestión, todas las de la empresa. Todos
  // pueden cotizar (a lo que sea suyo, lo comprueba el caso de uso). `update` incluye crear una versión nueva.
  [Action.QUOTE_LIST]: managementOrOwnForSalesRep,
  [Action.QUOTE_CREATE]: everyone,
  [Action.QUOTE_UPDATE]: managementOrOwnForSalesRep,
  [Action.QUOTE_DELETE]: managementOrOwnForSalesRep,
  [Action.QUOTE_SEND]: managementOrOwnForSalesRep,
  // Registrar la respuesta del cliente: aceptar o rechazar.
  [Action.QUOTE_DECIDE]: managementOrOwnForSalesRep,
  // F3-T09: crear la cotización de un lead; un comercial, solo de los suyos (el responsable del lead es el recurso).
  [Action.QUOTE_CREATE_FROM_LEAD]: managementOrOwnForSalesRep,
};

/**
 * Roles que cada rol puede invitar y gestionar (F2-T05). D-16: el socio tiene los permisos del dueño salvo
 * suscripción y borrar la empresa, así que gestiona como él. D-17: el líder comercial solo a los comerciales.
 * Nadie gestiona al dueño: la empresa siempre conserva uno.
 */
export const manageableRolesByRole: Readonly<Record<Role, readonly Role[]>> = {
  [Role.OWNER]: [Role.PARTNER, Role.SALES_LEADER, Role.SALES_REP],
  [Role.PARTNER]: [Role.PARTNER, Role.SALES_LEADER, Role.SALES_REP],
  [Role.SALES_LEADER]: [Role.SALES_REP],
  [Role.SALES_REP]: [],
};

const manageableRoles: ReadonlyMap<string, readonly Role[]> = new Map(Object.entries(manageableRolesByRole));

/** Indica si el actor puede invitar o gestionar a alguien con ese rol. Un rol desconocido no gestiona a nadie. */
export function canManageRole(actor: Actor, targetRole: Role): boolean {
  return (manageableRoles.get(actor.role) ?? []).includes(targetRole);
}

// Con Map, un rol con un nombre inesperado (`__proto__`, `constructor`) nunca resuelve a una propiedad
// heredada de Object: simplemente no está.
const grantsByAction: ReadonlyMap<string, ReadonlyMap<string, Grant>> = new Map(
  Object.entries(permissionMatrix).map(([action, grantsByRole]) => [action, new Map(Object.entries(grantsByRole))]),
);

function grantFor(actor: Actor, action: Action): Grant {
  // Un rol que no está en la matriz (token antiguo, valor inesperado) no tiene ningún permiso.
  return grantsByAction.get(action)?.get(actor.role) ?? 'none';
}

/**
 * Indica si el actor puede hacer la acción.
 *
 * @param resource Recurso concreto. Obligatorio para que un permiso `own` se conceda: sin él no hay
 * forma de saber si el recurso es del actor, así que se deniega.
 */
export function can(actor: Actor, action: Action, resource?: OwnedResource): boolean {
  const grant = grantFor(actor, action);
  if (grant === 'all') return true;
  if (grant === 'own') return resource?.ownerUserId !== undefined && resource.ownerUserId === actor.userId;
  return false;
}

/** Qué parte de una colección puede ver el actor. */
export type AccessScope = { kind: 'all' } | { kind: 'own'; userId: string } | { kind: 'none' };

/** Alcance de una acción de listado: el repositorio filtra según él. */
export function scopeFor(actor: Actor, action: Action): AccessScope {
  const grant = grantFor(actor, action);
  if (grant === 'all') return { kind: 'all' };
  // Sin usuario, "solo los suyos" no identifica nada: se deniega en lugar de devolver todo.
  if (grant === 'own' && actor.userId) return { kind: 'own', userId: actor.userId };
  return { kind: 'none' };
}
