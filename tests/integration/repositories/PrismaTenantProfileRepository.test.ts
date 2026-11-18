import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { PrismaTransactionManager } from '@/infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaTenantProfileRepository } from '@/infrastructure/persistence/repositories/PrismaTenantProfileRepository.js';
import { type TenantWithTeam, persistTenantWithTeam } from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

// F3-T07, F3-A19: la clave del logo se cambia devolviendo, en la misma sentencia, la que había justo antes.

describe('PrismaTenantProfileRepository.updateLogoKey', () => {
  let company: TenantWithTeam;
  let repository: PrismaTenantProfileRepository;
  let transactionManager: PrismaTransactionManager;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    repository = new PrismaTenantProfileRepository(prisma, new FixedTenantContext(company.tenant.id));
    transactionManager = new PrismaTransactionManager(prisma);
  });

  it('devuelve la clave anterior (ninguna la primera vez) y guarda la nueva', async () => {
    const first = await repository.updateLogoKey('logos/t/uno.png');
    const second = await repository.updateLogoKey('logos/t/dos.png');
    const removed = await repository.updateLogoKey(null);

    expect([first, second, removed]).toEqual([undefined, 'logos/t/uno.png', 'logos/t/dos.png']);
    await expect(prisma.tenant.findUniqueOrThrow({ where: { id: company.tenant.id } })).resolves.toMatchObject({
      logoUrl: null,
    });
  });

  it('dos cambios simultáneos se encadenan: cada clave se devuelve una sola vez, así no queda ningún archivo huérfano', async () => {
    const [firstPrevious, secondPrevious] = await Promise.all([
      transactionManager.runInTransaction(() => repository.updateLogoKey('logos/t/a.png')),
      transactionManager.runInTransaction(() => repository.updateLogoKey('logos/t/b.png')),
    ]);

    const stored = (await prisma.tenant.findUniqueOrThrow({ where: { id: company.tenant.id } })).logoUrl;
    const returned = [firstPrevious, secondPrevious];
    // Quien ganó la carrera ve la clave inicial (ninguna); el otro, la que dejó el primero. La que queda guardada
    // nunca se devuelve: es la vigente.
    expect(returned).toContain(undefined);
    const chained = returned.find((key) => key !== undefined);
    expect(['logos/t/a.png', 'logos/t/b.png']).toContain(chained);
    expect(chained).not.toBe(stored);
    expect(['logos/t/a.png', 'logos/t/b.png']).toContain(stored);
  });

  it('no toca el logo de otra empresa', async () => {
    const other = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    await prisma.tenant.update({ where: { id: other.tenant.id }, data: { logoUrl: 'logos/otra/logo.png' } });

    await repository.updateLogoKey('logos/t/mio.png');

    await expect(prisma.tenant.findUniqueOrThrow({ where: { id: other.tenant.id } })).resolves.toMatchObject({
      logoUrl: 'logos/otra/logo.png',
    });
  });
});
