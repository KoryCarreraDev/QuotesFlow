import { ITenantRepository } from '@/application/ports/repositories/ITenantRepository.js';
import { Tenant } from '@/domain/entities/Tenant.js';

/** Doble en memoria de `ITenantRepository`. */
export class InMemoryTenantRepository implements ITenantRepository {
  private readonly tenantsById = new Map<string, Tenant>();

  /** Todos los tenants guardados. */
  listStored(): Tenant[] {
    return [...this.tenantsById.values()];
  }

  async create(tenant: Tenant): Promise<void> {
    this.tenantsById.set(tenant.id, tenant);
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.tenantsById.get(id) ?? null;
  }
}
