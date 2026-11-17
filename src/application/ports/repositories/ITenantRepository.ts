import { Tenant } from '../../../domain/entities/Tenant.js';

/**
 * Persistencia de empresas (tenants). Es el único repositorio que no filtra por tenant: crea y lee el propio tenant.
 */
export interface ITenantRepository {
  create(tenant: Tenant): Promise<void>;
  /** La empresa, o `null` si no existe o está borrada (F2-T05: una empresa borrada no acepta invitaciones). */
  findById(id: string): Promise<Tenant | null>;
}
