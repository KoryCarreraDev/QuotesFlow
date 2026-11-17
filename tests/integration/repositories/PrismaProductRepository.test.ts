import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { Product } from '@/domain/entities/Product.js';
import { Money } from '@/domain/value-objects/money.js';
import { productFilterConfig } from '@/infrastructure/persistence/filters/productFilterConfig.js';
import { PrismaProductRepository } from '@/infrastructure/persistence/repositories/PrismaProductRepository.js';
import {
  type TenantWithTeam,
  persistFormula,
  persistProduct,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

// F3-T02: catálogo de productos contra PostgreSQL real.

// Más cifras de las que number guarda sin error: el precio no pasa por number (F3-T01).
const PRECISE_PRICE = '98765432109876.54';

function repositoryFor(tenantId: string): PrismaProductRepository {
  return new PrismaProductRepository(prisma, new FixedTenantContext(tenantId));
}

describe('PrismaProductRepository', () => {
  let company: TenantWithTeam;
  let otherCompany: TenantWithTeam;
  let repository: PrismaProductRepository;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    repository = repositoryFor(company.tenant.id);
  });

  it('guarda y lee un producto con el precio exacto', async () => {
    const product = Product.create(company.tenant.id, {
      name: 'Fachada flotante',
      description: 'Vidrio templado',
      basePrice: Money.fromDecimalString(PRECISE_PRICE),
      isActive: true,
    });

    await repository.create(product);
    const stored = await repository.findById(product.id);

    expect(stored).toMatchObject({ name: 'Fachada flotante', description: 'Vidrio templado', isActive: true });
    expect(stored?.basePrice?.toDecimalString()).toBe(PRECISE_PRICE);
  });

  it('no ve productos de otra empresa ni borrados', async () => {
    const foreignProduct = await persistProduct(otherCompany.tenant.id);
    const deletedProduct = await persistProduct(company.tenant.id, { deleted: 'DELETED' });

    await expect(repository.findById(foreignProduct.id)).resolves.toBeNull();
    await expect(repository.findById(deletedProduct.id)).resolves.toBeNull();
  });

  it('modifica y quita el precio fijo cuando el producto tiene fórmula', async () => {
    const formula = await persistFormula(company.tenant.id, company.owner.id);
    const stored = await persistProduct(company.tenant.id, { formulaId: formula.id });
    const product = await repository.findById(stored.id);

    await repository.update(product!.withChanges({ basePrice: null, name: 'Ventana a medida' }));

    const updated = await repository.findById(stored.id);
    expect(updated).toMatchObject({ name: 'Ventana a medida', formulaId: formula.id, basePrice: undefined });
  });

  it('el borrado es suave: el registro sigue en la base marcado como borrado', async () => {
    const stored = await persistProduct(company.tenant.id);

    await repository.delete(stored.id);

    await expect(repository.findById(stored.id)).resolves.toBeNull();
    const record = await prisma.product.findUnique({ where: { id: stored.id } });
    expect(record?.deleted).toBe('DELETED');
  });

  it('una fórmula existe solo si es de la empresa y no está borrada', async () => {
    const ownFormula = await persistFormula(company.tenant.id, company.owner.id);
    const foreignFormula = await persistFormula(otherCompany.tenant.id, otherCompany.owner.id);
    const deletedFormula = await persistFormula(company.tenant.id, company.owner.id, { deleted: 'DELETED' });

    await expect(repository.formulaExists(ownFormula.id)).resolves.toBe(true);
    await expect(repository.formulaExists(foreignFormula.id)).resolves.toBe(false);
    await expect(repository.formulaExists(deletedFormula.id)).resolves.toBe(false);
  });

  it('filtra por activos, busca por nombre y ordena por precio, solo en su empresa', async () => {
    const cheap = await persistProduct(company.tenant.id, { name: 'Ventana pequeña', basePrice: '100000' });
    const expensive = await persistProduct(company.tenant.id, { name: 'Ventana grande', basePrice: '900000' });
    await persistProduct(company.tenant.id, { name: 'Ventana retirada', isActive: false });
    await persistProduct(otherCompany.tenant.id, { name: 'Ventana ajena' });

    const criteria = {
      search: 'ventana',
      filters: [{ field: 'isActive', operator: 'equals', value: true }],
      sortBy: 'basePrice',
      sortDir: 'asc' as const,
    };
    const found = await repository.findFiltered(criteria, productFilterConfig);

    expect(found.map((product) => product.id)).toEqual([cheap.id, expensive.id]);
    await expect(repository.countFiltered(criteria, productFilterConfig)).resolves.toBe(found.length);
  });
});
