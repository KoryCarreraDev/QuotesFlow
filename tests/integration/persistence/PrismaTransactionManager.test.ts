import { describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { Tenant } from '@/domain/entities/Tenant.js';
import { PrismaTransactionManager } from '@/infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaTenantRepository } from '@/infrastructure/persistence/repositories/PrismaTenantRepository.js';
import { DEFAULT_TEST_TENANT_ID } from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

// F1-T03: los repositorios toman la transacción abierta sin recibirla como parámetro, así que los casos
// de uso solo conocen el puerto ITransactionManager y nunca a Prisma.

const transactionManager = new PrismaTransactionManager(prisma);
const tenantRepository = new PrismaTenantRepository(prisma, new FixedTenantContext(DEFAULT_TEST_TENANT_ID));

function buildTenant(name: string): Tenant {
  return Tenant.create({ name });
}

async function tenantExists(tenant: Tenant): Promise<boolean> {
  return (await prisma.tenant.count({ where: { id: tenant.id } })) === 1;
}

describe('PrismaTransactionManager', () => {
  it('confirma las escrituras de los repositorios cuando el trabajo termina bien', async () => {
    const tenant = buildTenant('Aluminios Andinos SAS');

    await transactionManager.runInTransaction(async () => {
      await tenantRepository.create(tenant);
    });

    await expect(tenantExists(tenant)).resolves.toBe(true);
  });

  it('devuelve el resultado del trabajo', async () => {
    const result = await transactionManager.runInTransaction(async () => 'work result');

    expect(result).toBe('work result');
  });

  it('revierte las escrituras de los repositorios y relanza el mismo error si el trabajo falla', async () => {
    const tenant = buildTenant('Vidrios del Norte SAS');
    const workFailure = new Error('work failed after writing');

    const run = transactionManager.runInTransaction(async () => {
      await tenantRepository.create(tenant);
      throw workFailure;
    });

    await expect(run).rejects.toBe(workFailure);
    await expect(tenantExists(tenant)).resolves.toBe(false);
  });

  it('una transacción anidada se une a la exterior: si la exterior falla, se revierte todo', async () => {
    const outerTenant = buildTenant('Empresa Exterior SAS');
    const innerTenant = buildTenant('Empresa Interior SAS');

    const run = transactionManager.runInTransaction(async () => {
      await tenantRepository.create(outerTenant);
      await transactionManager.runInTransaction(async () => {
        await tenantRepository.create(innerTenant);
      });
      throw new Error('outer work failed');
    });

    await expect(run).rejects.toThrow('outer work failed');
    await expect(tenantExists(outerTenant)).resolves.toBe(false);
    await expect(tenantExists(innerTenant)).resolves.toBe(false);
  });

  it('dos transacciones simultáneas no se mezclan: revertir una no afecta a la otra', async () => {
    const committedTenant = buildTenant('Empresa Confirmada SAS');
    const rolledBackTenant = buildTenant('Empresa Revertida SAS');

    const [committed, rolledBack] = await Promise.allSettled([
      transactionManager.runInTransaction(async () => {
        await tenantRepository.create(committedTenant);
      }),
      transactionManager.runInTransaction(async () => {
        await tenantRepository.create(rolledBackTenant);
        throw new Error('second transaction failed');
      }),
    ]);

    expect(committed.status).toBe('fulfilled');
    expect(rolledBack.status).toBe('rejected');
    await expect(tenantExists(committedTenant)).resolves.toBe(true);
    await expect(tenantExists(rolledBackTenant)).resolves.toBe(false);
  });

  it('fuera de una transacción los repositorios escriben directamente', async () => {
    const tenant = buildTenant('Empresa Sin Transacción SAS');

    await tenantRepository.create(tenant);

    await expect(tenantExists(tenant)).resolves.toBe(true);
  });
});
