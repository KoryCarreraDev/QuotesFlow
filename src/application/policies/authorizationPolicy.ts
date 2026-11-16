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
  CONTACT_LIST = 'contact:list',
  CONTACT_CREATE = 'contact:create',
  CONTACT_UPDATE = 'contact:update',
  CONTACT_DELETE = 'contact:delete',
  COMPANY_CONTACT_LIST = 'company-contact:list',
  COMPANY_CONTACT_CREATE = 'company-contact:create',
  COMPANY_CONTACT_UPDATE = 'company-contact:update',
  COMPANY_CONTACT_DELETE = 'company-contact:delete',
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
  // Contactos y empresas cliente aún no tienen responsable: la visibilidad por rol (D-18) llega con F1-T17.
  [Action.CONTACT_LIST]: everyone,
  [Action.CONTACT_CREATE]: everyone,
  [Action.CONTACT_UPDATE]: everyone,
  // Borrar clientes queda para gestión mientras no tengan responsable (Q-012; F1-T17 añade ownerId).
  [Action.CONTACT_DELETE]: managementOnly,
  [Action.COMPANY_CONTACT_LIST]: everyone,
  [Action.COMPANY_CONTACT_CREATE]: everyone,
  [Action.COMPANY_CONTACT_UPDATE]: everyone,
  [Action.COMPANY_CONTACT_DELETE]: managementOnly,
};

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
