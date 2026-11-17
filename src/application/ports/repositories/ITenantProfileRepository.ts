/** Perfil de la empresa de la sesión (F2-T06). */
export interface TenantProfile {
  id: string;
  name: string;
  /** Lo subirá F3-T07 (`IFileStorage`); hasta entonces solo se lee. */
  logoUrl?: string;
  /** Zona horaria IANA para fechas de cotizaciones, alertas y reportes. */
  timezone: string;
}

/** Cambios que admite el perfil. */
export interface TenantProfileChanges {
  name?: string;
  timezone?: string;
}

/** Perfil y configuración de la empresa de la sesión (`Tenant` + `TenantSettings`). Siempre la del contexto (R5). */
export interface ITenantProfileRepository {
  /** El perfil; `null` si la empresa no existe o está borrada. */
  findCurrent(): Promise<TenantProfile | null>;

  /** Aplica los cambios a la empresa del contexto; crea su configuración si aún no la tenía. */
  updateCurrent(changes: TenantProfileChanges): Promise<void>;
}
