import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import { DeleteFormulaUseCase } from '@/application/use-case/formulas/FormulaUseCases.js';
import { CreateProductUseCase } from '@/application/use-case/products/ProductUseCases.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { PrismaTransactionManager } from '@/infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaFormulaRepository } from '@/infrastructure/persistence/repositories/PrismaFormulaRepository.js';
import { PrismaProductRepository } from '@/infrastructure/persistence/repositories/PrismaProductRepository.js';
import {
  type TenantWithTeam,
  persistFormula,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';

// F3-A20: borrar una fórmula y asignarla a un producto a la vez no puede dejar un producto apuntando a una fórmula
// borrada. Se prueba con dos transacciones reales; una de ellas se retiene a propósito para forzar el orden.

const HOLD_TRANSACTION_MS = 400;
const START_SECOND_AFTER_MS = 120;
const owner = { role: Role.OWNER, userId: 'owner-id' };

/** Auditoría que se queda un rato dentro de la transacción: mantiene los bloqueos mientras tanto. */
class SlowAuditLogger extends RecordingAuditLogger {
  async record(...parameters: Parameters<RecordingAuditLogger['record']>): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, HOLD_TRANSACTION_MS));
    return super.record(...parameters);
  }
}

describe('Fórmula y producto a la vez (F3-A20)', () => {
  let company: TenantWithTeam;
  let tenantContext: FixedTenantContext;
  let transactionManager: PrismaTransactionManager;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    tenantContext = new FixedTenantContext(company.tenant.id);
    transactionManager = new PrismaTransactionManager(prisma);
  });

  function deleteFormula(auditLogger: RecordingAuditLogger) {
    return new DeleteFormulaUseCase(
      new PrismaFormulaRepository(prisma, tenantContext),
      transactionManager,
      auditLogger,
    );
  }

  function createProduct(auditLogger: RecordingAuditLogger) {
    return new CreateProductUseCase(
      new PrismaProductRepository(prisma, tenantContext),
      tenantContext,
      transactionManager,
      auditLogger,
    );
  }

  const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  it('si el producto se está creando con la fórmula, borrarla responde FORMULA_IN_USE', async () => {
    const formula = await persistFormula(company.tenant.id, company.owner.id);

    const creating = createProduct(new SlowAuditLogger()).execute(owner, { name: 'Vidrio', formulaId: formula.id });
    await wait(START_SECOND_AFTER_MS);
    const deleting = deleteFormula(new RecordingAuditLogger()).execute(owner, formula.id);

    await expect(creating).resolves.toMatchObject({ formulaId: formula.id });
    await expect(deleting).rejects.toMatchObject({ code: ErrorCode.FORMULA_IN_USE });
    await expect(prisma.formula.findUniqueOrThrow({ where: { id: formula.id } })).resolves.toMatchObject({
      deleted: 'INUSE',
    });
  });

  it('si la fórmula se está borrando, crear un producto con ella responde INVALID_PRODUCT_FORMULA', async () => {
    const formula = await persistFormula(company.tenant.id, company.owner.id);

    const deleting = deleteFormula(new SlowAuditLogger()).execute(owner, formula.id);
    await wait(START_SECOND_AFTER_MS);
    const creating = createProduct(new RecordingAuditLogger()).execute(owner, {
      name: 'Vidrio',
      formulaId: formula.id,
    });

    await expect(deleting).resolves.toBeUndefined();
    await expect(creating).rejects.toMatchObject({ code: ErrorCode.INVALID_PRODUCT_FORMULA });
    await expect(prisma.product.count()).resolves.toBe(0);
  });

  it('sin carrera, ambas operaciones siguen funcionando', async () => {
    const formula = await persistFormula(company.tenant.id, company.owner.id);
    const auditLogger = new RecordingAuditLogger();

    await createProduct(auditLogger).execute(owner, { name: 'Vidrio', formulaId: formula.id });
    await expect(deleteFormula(auditLogger).execute(owner, formula.id)).rejects.toMatchObject({
      code: ErrorCode.FORMULA_IN_USE,
    });

    expect(auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.PRODUCT_CREATED]);
  });
});
