/** Perfil de la empresa de la sesión (F2-T06). */
export interface TenantProfile {
  id: string;
  name: string;
  /** Clave del logo en `IFileStorage` (F3-T07). Es interna: la API publica `logoUrl`, nunca esta clave. */
  logoKey?: string;
  /** Zona horaria IANA para fechas de cotizaciones, alertas y reportes. */
  timezone: string;
  /**
   * D-57 (F3-T10): si la empresa usa el correo además de las notificaciones del sistema (enviar cotizaciones,
   * alertas). Desactivado por defecto. Los correos de la cuenta no dependen de él.
   */
  emailDeliveryEnabled: boolean;
  /** Q-020 (F3-T05): IVA por defecto de las cotizaciones (`"19.00"`); sin él, se pide en cada ítem. */
  defaultTaxRate?: string;
  /** D-25 (F3-T05): descuento máximo que aplica un comercial (`"10.00"`). */
  maximumDiscountRateSalesRep: string;
  /** D-25 (F3-T05): descuento máximo que aplica un líder comercial (`"20.00"`). Dueño y socio no tienen tope. */
  maximumDiscountRateSalesLeader: string;
}

/** Cambios que admite el perfil. */
export interface TenantProfileChanges {
  name?: string;
  timezone?: string;
  emailDeliveryEnabled?: boolean;
  /** `null` quita el IVA por defecto. */
  defaultTaxRate?: string | null;
  maximumDiscountRateSalesRep?: string;
  maximumDiscountRateSalesLeader?: string;
}

/** Perfil y configuración de la empresa de la sesión (`Tenant` + `TenantSettings`). Siempre la del contexto (R5). */
export interface ITenantProfileRepository {
  /** El perfil; `null` si la empresa no existe o está borrada. */
  findCurrent(): Promise<TenantProfile | null>;

  /** Aplica los cambios a la empresa del contexto; crea su configuración si aún no la tenía. */
  updateCurrent(changes: TenantProfileChanges): Promise<void>;

  /**
   * Guarda (o quita, con `null`) la clave del logo de la empresa del contexto y devuelve la que había justo antes,
   * leída y cambiada en la misma sentencia con la fila bloqueada: dos cambios simultáneos se encadenan y cada archivo
   * viejo lo borra exactamente uno (F3-A19).
   */
  updateLogoKey(logoKey: string | null): Promise<string | undefined>;
}
