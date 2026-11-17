import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import {
  CreateFormulaUseCase,
  DeleteFormulaUseCase,
  ListFormulasUseCase,
  UpdateFormulaUseCase,
} from '@/application/use-case/formulas/FormulaUseCases.js';
import { Formula, MAXIMUM_FORMULA_VARIABLES } from '@/domain/entities/Formula.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { formulaFilterConfig } from '@/infrastructure/persistence/filters/formulaFilterConfig.js';
import { MathjsFormulaEvaluator } from '@/infrastructure/services/MathjsFormulaEvaluator.js';
import { DEFAULT_TEST_TENANT_ID } from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryFormulaRepository } from '@tests/support/doubles/InMemoryFormulaRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

// F3-T04: fórmulas de precio. La expresión se valida con el evaluador real (F3-T03).

const OTHER_TENANT_ID = 'other-tenant-id';
const owner = { role: Role.OWNER, userId: 'owner-id' };
const salesRep = { role: Role.SALES_REP, userId: 'rep-id' };
const WINDOW_VARIABLES = [
  { name: 'ancho', label: 'Ancho (m)' },
  { name: 'alto', label: 'Alto (m)' },
];

function buildFormula(tenantId = DEFAULT_TEST_TENANT_ID): Formula {
  return Formula.create(tenantId, 'owner-id', {
    name: 'Ventana',
    expression: 'ancho * alto * 180000',
    variables: WINDOW_VARIABLES,
  });
}

function setup() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const repository = new InMemoryFormulaRepository(tenantContext);
  const auditLogger = new RecordingAuditLogger();
  const transactionManager = new RecordingTransactionManager();
  const evaluator = new MathjsFormulaEvaluator();
  return {
    repository,
    auditLogger,
    listFormulas: new ListFormulasUseCase(repository, formulaFilterConfig),
    createFormula: new CreateFormulaUseCase(repository, evaluator, tenantContext, transactionManager, auditLogger),
    updateFormula: new UpdateFormulaUseCase(repository, evaluator, transactionManager, auditLogger),
    deleteFormula: new DeleteFormulaUseCase(repository, transactionManager, auditLogger),
  };
}

describe('Formula (entidad)', () => {
  it('rechaza variables repetidas', () => {
    expect(() =>
      Formula.create(DEFAULT_TEST_TENANT_ID, 'owner-id', {
        name: 'Repetida',
        expression: 'ancho',
        variables: [WINDOW_VARIABLES[0], WINDOW_VARIABLES[0]],
      }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_FORMULA_VARIABLE }));
  });

  it(`rechaza más de ${MAXIMUM_FORMULA_VARIABLES} variables`, () => {
    const variables = Array.from({ length: MAXIMUM_FORMULA_VARIABLES + 1 }, (_, index) => ({
      name: `v${index}`,
      label: `Variable ${index}`,
    }));

    expect(() => buildFormula().withChanges({ variables })).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_FORMULA_VARIABLE }),
    );
  });
});

describe('Fórmulas de precio', () => {
  it('todo el equipo consulta las fórmulas de su empresa con sus variables', async () => {
    const { listFormulas, repository } = setup();
    repository.seed(buildFormula(), buildFormula(OTHER_TENANT_ID));

    const result = await listFormulas.execute(salesRep, {});

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({ name: 'Ventana', variables: WINDOW_VARIABLES });
  });

  it('el dueño crea una fórmula válida, con su autor, y queda auditada', async () => {
    const { createFormula, repository, auditLogger } = setup();

    const created = await createFormula.execute(owner, {
      name: 'Ventana',
      expression: 'ceil(ancho * alto * 180000)',
      variables: WINDOW_VARIABLES,
    });

    expect(created).toMatchObject({ expression: 'ceil(ancho * alto * 180000)', variables: WINDOW_VARIABLES });
    expect(repository.findStoredById(created.id)).toMatchObject({ createdById: 'owner-id' });
    expect(auditLogger.entries).toEqual([
      expect.objectContaining({ action: AuditAction.FORMULA_CREATED, entityId: created.id }),
    ]);
  });

  it.each([
    ['usa una variable no declarada', 'ancho * largo'],
    ['intenta acceder a propiedades', 'ancho.constructor'],
    ['llama a una función peligrosa', 'evaluate("1")'],
  ])('rechaza guardar una fórmula que %s, sin auditar nada', async (_case, expression) => {
    const { createFormula, auditLogger } = setup();

    await expect(
      createFormula.execute(owner, { name: 'Mala', expression, variables: WINDOW_VARIABLES }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_FORMULA });
    expect(auditLogger.entries).toEqual([]);
  });

  it('rechaza un nombre de variable que no es un identificador', async () => {
    const { createFormula } = setup();

    await expect(
      createFormula.execute(owner, { name: 'Mala', expression: '1', variables: [{ name: 'ancho total', label: 'X' }] }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_FORMULA_VARIABLE });
  });

  it.each(['create', 'update', 'delete'] as const)('el comercial no puede %s fórmulas', async (operation) => {
    const { createFormula, updateFormula, deleteFormula, repository } = setup();
    const formula = buildFormula();
    repository.seed(formula);

    const attempt = {
      create: () => createFormula.execute(salesRep, { name: 'X', expression: '1', variables: [] }),
      update: () => updateFormula.execute(salesRep, formula.id, { name: 'X' }),
      delete: () => deleteFormula.execute(salesRep, formula.id),
    }[operation];

    await expect(attempt()).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });
  });

  it('modificar la expresión la valida contra las variables que quedan', async () => {
    const { updateFormula, repository } = setup();
    const formula = buildFormula();
    repository.seed(formula);

    await expect(updateFormula.execute(owner, formula.id, { variables: [WINDOW_VARIABLES[0]] })).rejects.toMatchObject({
      code: ErrorCode.INVALID_FORMULA,
    });
  });

  it('modifica una fórmula y audita los campos cambiados', async () => {
    const { updateFormula, repository, auditLogger } = setup();
    const formula = buildFormula();
    repository.seed(formula);

    const updated = await updateFormula.execute(owner, formula.id, { expression: 'ancho * alto * 200000' });

    expect(updated.expression).toBe('ancho * alto * 200000');
    expect(auditLogger.entries).toEqual([
      expect.objectContaining({ action: AuditAction.FORMULA_UPDATED, metadata: { changedFields: ['expression'] } }),
    ]);
  });

  it.each(['update', 'delete'] as const)('%s de una fórmula de otra empresa responde FORMULA_NOT_FOUND', async (op) => {
    const { updateFormula, deleteFormula, repository } = setup();
    const foreignFormula = buildFormula(OTHER_TENANT_ID);
    repository.seed(foreignFormula);

    const attempt =
      op === 'update'
        ? updateFormula.execute(owner, foreignFormula.id, { name: 'X' })
        : deleteFormula.execute(owner, foreignFormula.id);

    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.FORMULA_NOT_FOUND });
  });

  it('no borra una fórmula que usan productos: 409 FORMULA_IN_USE', async () => {
    const { deleteFormula, repository } = setup();
    const formula = buildFormula();
    repository.seed(formula);
    repository.formulaIdsUsedByProducts.add(formula.id);

    await expect(deleteFormula.execute(owner, formula.id)).rejects.toMatchObject({ code: ErrorCode.FORMULA_IN_USE });
    expect(repository.isDeleted(formula.id)).toBe(false);
  });

  it('borra (suave) una fórmula sin productos y queda auditado', async () => {
    const { deleteFormula, repository, auditLogger } = setup();
    const formula = buildFormula();
    repository.seed(formula);

    await deleteFormula.execute(owner, formula.id);

    expect(repository.isDeleted(formula.id)).toBe(true);
    expect(auditLogger.entries).toEqual([
      expect.objectContaining({ action: AuditAction.FORMULA_DELETED, entityId: formula.id }),
    ]);
  });

  it('un id inexistente al borrar responde FORMULA_NOT_FOUND', async () => {
    const { deleteFormula } = setup();

    await expect(deleteFormula.execute(owner, randomUUID())).rejects.toMatchObject({
      code: ErrorCode.FORMULA_NOT_FOUND,
    });
  });
});
