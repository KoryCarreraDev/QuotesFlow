/** Ruta pública del logo de la empresa de la sesión (F3-T07). */
export const TENANT_LOGO_PATH = '/api/v1/tenant/logo';

/** Perfil de la empresa tal como lo devuelve la API: sin la clave interna del logo. */
export interface TenantProfileDTO {
  id: string;
  name: string;
  /** Solo si la empresa tiene logo: `GET` a esta ruta devuelve la imagen. */
  logoUrl?: string;
  timezone: string;
  emailDeliveryEnabled: boolean;
  /** IVA por defecto de las cotizaciones (`"19.00"`); sin él, se pide en cada ítem. */
  defaultTaxRate?: string;
  maximumDiscountRateSalesRep: string;
  maximumDiscountRateSalesLeader: string;
}
