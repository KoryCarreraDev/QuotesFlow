import { describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { Tenant } from '@/domain/entities/Tenant.js';
import { PrismaTenantRepository } from '@/infrastructure/persistence/repositories/PrismaTenantRepository.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import { persistTenant } from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

function createRepository(): PrismaTenantRepository {
  // El repositorio de tenants no filtra por tenant: el contexto no se llega a consultar.
  return new PrismaTenantRepository(prisma, new FixedTenantContext(NON_EXISTENT_ID));
}

describe('PrismaTenantRepository', () => {
  it('guarda un tenant y lo recupera por id', async () => {
    const tenant = Tenant.create({ name: 'Carpintería Metálica del Sur' });

    await createRepository().create(tenant);
    const foundTenant = await createRepository().findById(tenant.id);

    expect(foundTenant?.id).toBe(tenant.id);
    expect(foundTenant?.name).toBe('Carpintería Metálica del Sur');
    expect(foundTenant?.logoUrl).toBeNull();
    expect(foundTenant?.createdAt).toBeInstanceOf(Date);
  });

  it('devuelve null si el tenant no existe', async () => {
    await persistTenant();

    const foundTenant = await createRepository().findById(NON_EXISTENT_ID);

    expect(foundTenant).toBeNull();
  });
});
