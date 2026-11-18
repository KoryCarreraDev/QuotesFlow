import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { Formula } from '@/domain/entities/Formula.js';
import { formulaFilterConfig } from '@/infrastructure/persistence/filters/formulaFilterConfig.js';
import { PrismaFormulaRepository } from '@/infrastructure/persistence/repositories/PrismaFormulaRepository.js';
import {
  type TenantWithTeam,
  persistFormula,
  persistProduct,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

// F3-T04: fórmulas de precio contra PostgreSQL real.

function repositoryFor(tenantId: string): PrismaFormulaRepository {
  return new PrismaFormulaRepository(prisma, new FixedTenantContext(tenantId));
}

describe('PrismaFormulaRepository', () => {
  let company: TenantWithTeam;
  let otherCompany: TenantWithTeam;
  let repository: PrismaFormulaRepository;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    repository = repositoryFor(company.tenant.id);
  });

  it('guarda y lee una fórmula con sus variables en orden', async () => {
    const formula = Formula.create(company.tenant.id, company.owner.id, {
      name: 'Ventana',
      expression: 'ancho * alto * precioM2',
      variables: [
        { name: 'ancho', label: 'Ancho (m)' },
        { name: 'alto', label: 'Alto (m)' },
        { name: 'precioM2', label: 'Precio por m²' },
      ],
    });

    await repository.create(formula);
    const stored = await repository.findById(formula.id);

    expect(stored).toMatchObject({ name: 'Ventana', createdById: company.owner.id });
    expect(stored?.variableNames).toEqual(['ancho', 'alto', 'precioM2']);
  });

  it('no ve fórmulas de otra empresa ni borradas', async () => {
    const foreignFormula = await persistFormula(otherCompany.tenant.id, otherCompany.owner.id);
    const deletedFormula = await persistFormula(company.tenant.id, company.owner.id, { deleted: 'DELETED' });

    await expect(repository.findById(foreignFormula.id)).resolves.toBeNull();
    await expect(repository.findById(deletedFormula.id)).resolves.toBeNull();
  });

  it('modifica la expresión y las variables', async () => {
    const stored = await persistFormula(company.tenant.id, company.owner.id);
    const formula = await repository.findById(stored.id);

    await repository.update(
      formula!.withChanges({ expression: 'lado * lado', variables: [{ name: 'lado', label: 'Lado' }] }),
    );

    const updated = await repository.findById(stored.id);
    expect(updated).toMatchObject({ expression: 'lado * lado', variables: [{ name: 'lado', label: 'Lado' }] });
  });

  it('sabe si un producto no borrado de la empresa usa la fórmula', async () => {
    const usedFormula = await persistFormula(company.tenant.id, company.owner.id);
    const formulaOfDeletedProduct = await persistFormula(company.tenant.id, company.owner.id);
    const unusedFormula = await persistFormula(company.tenant.id, company.owner.id);
    await persistProduct(company.tenant.id, { formulaId: usedFormula.id });
    await persistProduct(company.tenant.id, { formulaId: formulaOfDeletedProduct.id, deleted: 'DELETED' });

    await expect(repository.isUsedByProducts(usedFormula.id)).resolves.toBe(true);
    await expect(repository.isUsedByProducts(formulaOfDeletedProduct.id)).resolves.toBe(false);
    await expect(repository.isUsedByProducts(unusedFormula.id)).resolves.toBe(false);
  });

  it('borra en suave y busca por nombre solo en su empresa', async () => {
    const window = await persistFormula(company.tenant.id, company.owner.id, { name: 'Ventana' });
    const door = await persistFormula(company.tenant.id, company.owner.id, { name: 'Puerta' });
    await persistFormula(otherCompany.tenant.id, otherCompany.owner.id, { name: 'Ventana ajena' });

    await repository.delete(door.id);
    const found = await repository.findFiltered({ search: 'ventana' }, formulaFilterConfig);

    expect(found.map((formula) => formula.id)).toEqual([window.id]);
    await expect(repository.countFiltered({}, formulaFilterConfig)).resolves.toBe(1);
    const deletedRecord = await prisma.formula.findUnique({ where: { id: door.id } });
    expect(deletedRecord?.deleted).toBe('DELETED');
  });
});
