/**
 * Empresa (tenant) de la petición en curso. `getTenantId` lanza si no hay: nunca hay un tenant por defecto.
 */
export interface ITenantContext {
  getTenantId(): string;
}
