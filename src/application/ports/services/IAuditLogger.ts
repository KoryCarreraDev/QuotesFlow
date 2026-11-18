/** Qué ocurrió. Son valores estables: se guardan en `AuditLog.action` y se consultarán por ellos. */
export enum AuditAction {
  COMPANY_REGISTERED = 'COMPANY_REGISTERED',
  LOGIN_SUCCEEDED = 'LOGIN_SUCCEEDED',
  LOGIN_FAILED = 'LOGIN_FAILED',
  /** Demasiados fallos seguidos: la cuenta queda bloqueada un tiempo (F2-T03). */
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  /** Intento de login con la cuenta bloqueada; la contraseña ni se comprueba. */
  LOGIN_REJECTED_ACCOUNT_LOCKED = 'LOGIN_REJECTED_ACCOUNT_LOCKED',
  LOGOUT = 'LOGOUT',
  /** Registro con un correo que ya tiene cuenta: se avisa al dueño del correo (H8, F2-T04). */
  REGISTRATION_WITH_EXISTING_EMAIL = 'REGISTRATION_WITH_EXISTING_EMAIL',
  /** Contraseña correcta de una cuenta sin el correo verificado (D-12). */
  LOGIN_REJECTED_EMAIL_NOT_VERIFIED = 'LOGIN_REJECTED_EMAIL_NOT_VERIFIED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  USER_INVITED = 'USER_INVITED',
  USER_INVITATION_REVOKED = 'USER_INVITATION_REVOKED',
  USER_INVITATION_ACCEPTED = 'USER_INVITATION_ACCEPTED',
  USER_UPDATED = 'USER_UPDATED',
  TENANT_UPDATED = 'TENANT_UPDATED',
  /** Se subió o reemplazó el logo de la empresa (F3-T07). */
  TENANT_LOGO_UPDATED = 'TENANT_LOGO_UPDATED',
  TENANT_LOGO_REMOVED = 'TENANT_LOGO_REMOVED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',
  LOGOUT_ALL_SESSIONS = 'LOGOUT_ALL_SESSIONS',
  /** Se presentó un refresh token ya rotado y la sesión se revocó (F2-T02). */
  SESSION_REUSE_DETECTED = 'SESSION_REUSE_DETECTED',
  LEAD_CREATED = 'LEAD_CREATED',
  LEAD_UPDATED = 'LEAD_UPDATED',
  LEAD_DELETED = 'LEAD_DELETED',
  LEAD_STATUS_CHANGED = 'LEAD_STATUS_CHANGED',
  LEAD_STATUS_CONFIG_CREATED = 'LEAD_STATUS_CONFIG_CREATED',
  LEAD_STATUS_CONFIG_UPDATED = 'LEAD_STATUS_CONFIG_UPDATED',
  LEAD_STATUS_CONFIG_DELETED = 'LEAD_STATUS_CONFIG_DELETED',
  LEAD_STATUS_CONFIGS_REORDERED = 'LEAD_STATUS_CONFIGS_REORDERED',
  CONTACT_CREATED = 'CONTACT_CREATED',
  CONTACT_UPDATED = 'CONTACT_UPDATED',
  CONTACT_DELETED = 'CONTACT_DELETED',
  COMPANY_CONTACT_CREATED = 'COMPANY_CONTACT_CREATED',
  COMPANY_CONTACT_UPDATED = 'COMPANY_CONTACT_UPDATED',
  COMPANY_CONTACT_DELETED = 'COMPANY_CONTACT_DELETED',
  PRODUCT_CREATED = 'PRODUCT_CREATED',
  PRODUCT_UPDATED = 'PRODUCT_UPDATED',
  PRODUCT_DELETED = 'PRODUCT_DELETED',
  FORMULA_CREATED = 'FORMULA_CREATED',
  FORMULA_UPDATED = 'FORMULA_UPDATED',
  FORMULA_DELETED = 'FORMULA_DELETED',
  QUOTE_CREATED = 'QUOTE_CREATED',
  QUOTE_UPDATED = 'QUOTE_UPDATED',
  QUOTE_DELETED = 'QUOTE_DELETED',
  QUOTE_SENT = 'QUOTE_SENT',
  QUOTE_ACCEPTED = 'QUOTE_ACCEPTED',
  QUOTE_REJECTED = 'QUOTE_REJECTED',
  /** Se creó la versión siguiente de una cotización enviada o rechazada (D-22). */
  QUOTE_REVISED = 'QUOTE_REVISED',
  /** Un comercial cambió el precio calculado de un ítem (D-24, Q-015): F4-T06 avisará a los líderes. */
  QUOTE_PRICE_OVERRIDDEN = 'QUOTE_PRICE_OVERRIDDEN',
  /** Se descargó el PDF de una cotización (H13: las descargas también se auditan, F3-A14). */
  QUOTE_PDF_DOWNLOADED = 'QUOTE_PDF_DOWNLOADED',
}

/** Sobre qué tipo de registro. Se guarda en `AuditLog.entity`. */
export enum AuditEntity {
  TENANT = 'Tenant',
  USER = 'User',
  SESSION = 'UserSession',
  USER_INVITATION = 'UserInvitation',
  LEAD = 'Lead',
  LEAD_STATUS_CONFIG = 'LeadStatusConfig',
  CONTACT = 'Contact',
  COMPANY_CONTACT = 'CompanyContact',
  PRODUCT = 'Product',
  FORMULA = 'Formula',
  QUOTE = 'Quote',
}

/**
 * Un registro de auditoría: qué acción, sobre qué entidad y, en rutas públicas, quién.
 */
export interface AuditEntry {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  /**
   * Datos que explican el cambio. Nunca valores personales ni secretos: en una modificación,
   * los nombres de los campos cambiados (`changedFields`), no sus valores. Única excepción (F3-A21): los precios,
   * tasas y expresiones de fórmula de una lista cerrada, que llevan `changedValues` con su valor anterior y el nuevo.
   */
  metadata?: Record<string, unknown>;
  /**
   * Solo en rutas públicas (registro, login), donde aún no hay sesión. En el resto, el usuario y la
   * empresa salen de la sesión de la petición y no se pueden indicar.
   */
  publicActor?: { userId: string; tenantId: string };
}

/**
 * Auditoría de negocio (F1-T07, H13): toda modificación y todo evento de autenticación queda en
 * `AuditLog`. Dentro de una transacción (`ITransactionManager`), se escribe en ella: si la operación
 * se revierte, su registro de auditoría también.
 */
export interface IAuditLogger {
  record(entry: AuditEntry): Promise<void>;
}

/** De qué a qué cambió un campo sensible. `null` es "sin valor". */
export interface ChangedValue {
  from: string | null;
  to: string | null;
}

/** Valores de campos, como texto, para compararlos antes y después de un cambio. */
export type AuditedValues = Readonly<Record<string, string | null | undefined>>;

/**
 * Valor anterior y nuevo de los campos **de la lista** que de verdad cambiaron, para `metadata.changedValues`
 * (F3-A21). La lista es explícita y solo debe llevar campos sin datos personales (precios, tasas, expresiones de
 * fórmula): nunca se copia el objeto entero. Los campos iguales o fuera de la lista no aparecen.
 */
export function changedValues(
  before: AuditedValues,
  after: AuditedValues,
  fields: readonly string[],
): Record<string, ChangedValue> {
  const beforeValues = new Map(Object.entries(before));
  const afterValues = new Map(Object.entries(after));
  const changes: Array<[string, ChangedValue]> = [];
  for (const field of fields) {
    const from = beforeValues.get(field) ?? null;
    const to = afterValues.get(field) ?? null;
    if (from !== to) changes.push([field, { from, to }]);
  }
  return Object.fromEntries(changes);
}

/** Nombres de los campos que una modificación envió con valor; sirve para `metadata.changedFields`. */
export function changedFieldNames(changes: object): string[] {
  return Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field)
    .sort();
}
