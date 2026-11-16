import { Tenant } from '../../../domain/entities/Tenant.js';

/**
 * Persistencia de empresas (tenants). Es el único repositorio que no filtra por tenant: crea y lee el propio tenant.
 */
export interface ITenantRepository {
  create(tenant: Tenant): Promise<void>;
  findById(id: string): Promise<Tenant | null>;
}
