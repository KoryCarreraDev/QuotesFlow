/** Qué ocurrió. Son valores estables: se guardan en `AuditLog.action` y se consultarán por ellos. */
export enum AuditAction {
  COMPANY_REGISTERED = 'COMPANY_REGISTERED',
  LOGIN_SUCCEEDED = 'LOGIN_SUCCEEDED',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LEAD_CREATED = 'LEAD_CREATED',
  LEAD_UPDATED = 'LEAD_UPDATED',
  LEAD_DELETED = 'LEAD_DELETED',
  LEAD_STATUS_CHANGED = 'LEAD_STATUS_CHANGED',
  LEAD_STATUS_CONFIG_CREATED = 'LEAD_STATUS_CONFIG_CREATED',
  LEAD_STATUS_CONFIG_UPDATED = 'LEAD_STATUS_CONFIG_UPDATED',
  CONTACT_CREATED = 'CONTACT_CREATED',
  CONTACT_UPDATED = 'CONTACT_UPDATED',
  CONTACT_DELETED = 'CONTACT_DELETED',
  COMPANY_CONTACT_CREATED = 'COMPANY_CONTACT_CREATED',
  COMPANY_CONTACT_UPDATED = 'COMPANY_CONTACT_UPDATED',
  COMPANY_CONTACT_DELETED = 'COMPANY_CONTACT_DELETED',
}

/** Sobre qué tipo de registro. Se guarda en `AuditLog.entity`. */
export enum AuditEntity {
  TENANT = 'Tenant',
  USER = 'User',
  LEAD = 'Lead',
  LEAD_STATUS_CONFIG = 'LeadStatusConfig',
  CONTACT = 'Contact',
  COMPANY_CONTACT = 'CompanyContact',
}

export interface AuditEntry {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  /**
   * Datos que explican el cambio. Nunca valores personales ni secretos: en una modificación,
   * los nombres de los campos cambiados (`changedFields`), no sus valores.
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

/** Nombres de los campos que una modificación envió con valor; sirve para `metadata.changedFields`. */
export function changedFieldNames(changes: object): string[] {
  return Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field)
    .sort();
}
