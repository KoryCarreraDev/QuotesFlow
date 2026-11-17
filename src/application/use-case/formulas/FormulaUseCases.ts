import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { PaginatedResult } from '@/application/dtos/PaginatedResultDTO.js';
import { IMapper } from '@/application/ports/mappers/IMapper.js';
import { IFormulaRepository } from '@/application/ports/repositories/IFormulaRepository.js';
import {
  AuditAction,
  AuditEntity,
  IAuditLogger,
  changedFieldNames,
} from '@/application/ports/services/IAuditLogger.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { IFormulaEvaluator } from '@/application/ports/services/IFormulaEvaluator.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { Action, Actor, can } from '@/application/policies/authorizationPolicy.js';
import { GenericListFilteredUseCase } from '@/application/use-case/filter/GenericListFilteredUseCase.js';
import { Formula, FormulaData, FormulaVariable } from '@/domain/entities/Formula.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';

// F3-T04: fórmulas de precio. Todo el equipo las consulta (el comercial ve qué variables llenar); las gestionan
// dueño, socio y líder. La expresión se valida con el evaluador endurecido (F3-T03) antes de guardarla.

/** Fórmula tal como la devuelve la API. */
export interface FormulaDTO {
  id: string;
  name: string;
  expression: string;
  variables: FormulaVariable[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class FormulaMapper implements IMapper<Formula, FormulaDTO> {
  toDTO(formula: Formula): FormulaDTO {
    return {
      id: formula.id,
      name: formula.name,
      expression: formula.expression,
      variables: [...formula.variables],
      createdAt: formula.createdAt,
      updatedAt: formula.updatedAt,
    };
  }
}

const formulaMapper = new FormulaMapper();

function assertAllowed(actor: Actor, action: Action): void {
  if (!can(actor, action)) throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
}

function formulaNotFound(): NotFoundError {
  return new NotFoundError(ErrorCode.FORMULA_NOT_FOUND, 'Formula not found');
}

/** Busca, filtra, ordena y pagina las fórmulas. Lo ve todo el equipo. */
export class ListFormulasUseCase {
  private readonly listFiltered: GenericListFilteredUseCase<Formula, FormulaDTO>;

  constructor(repository: IFormulaRepository, filterConfig: IFilterFieldConfig) {
    this.listFiltered = new GenericListFilteredUseCase(repository, formulaMapper, filterConfig);
  }

  async execute(actor: Actor, criteria: FilterCriteriaDTO): Promise<PaginatedResult<FormulaDTO>> {
    assertAllowed(actor, Action.FORMULA_LIST);
    return this.listFiltered.execute(criteria);
  }
}

/**
 * Crea una fórmula. La expresión solo puede usar las variables declaradas y la lista blanca del evaluador.
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {ValidationError} `INVALID_FORMULA`, `INVALID_FORMULA_VARIABLE`.
 */
export class CreateFormulaUseCase {
  constructor(
    private readonly repository: IFormulaRepository,
    private readonly formulaEvaluator: IFormulaEvaluator,
    private readonly tenantContext: ITenantContext,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor & { userId: string }, input: FormulaData): Promise<FormulaDTO> {
    assertAllowed(actor, Action.FORMULA_CREATE);
    const formula = Formula.create(this.tenantContext.getTenantId(), actor.userId, input);
    this.formulaEvaluator.validate(formula.expression, formula.variableNames);

    await this.transactionManager.runInTransaction(async () => {
      await this.repository.create(formula);
      await this.auditLogger.record({
        action: AuditAction.FORMULA_CREATED,
        entity: AuditEntity.FORMULA,
        entityId: formula.id,
      });
    });
    return formulaMapper.toDTO(formula);
  }
}

/**
 * Modifica una fórmula. Las cotizaciones ya hechas no cambian: guardan el precio calculado (F3-T05).
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {NotFoundError} `FORMULA_NOT_FOUND` (también si es de otra empresa).
 * @throws {ValidationError} `INVALID_FORMULA`, `INVALID_FORMULA_VARIABLE`.
 */
export class UpdateFormulaUseCase {
  constructor(
    private readonly repository: IFormulaRepository,
    private readonly formulaEvaluator: IFormulaEvaluator,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, formulaId: string, changes: Partial<FormulaData>): Promise<FormulaDTO> {
    assertAllowed(actor, Action.FORMULA_UPDATE);
    const storedFormula = await this.repository.findById(formulaId);
    if (!storedFormula) throw formulaNotFound();

    const updatedFormula = storedFormula.withChanges(changes);
    this.formulaEvaluator.validate(updatedFormula.expression, updatedFormula.variableNames);

    await this.transactionManager.runInTransaction(async () => {
      await this.repository.update(updatedFormula);
      await this.auditLogger.record({
        action: AuditAction.FORMULA_UPDATED,
        entity: AuditEntity.FORMULA,
        entityId: formulaId,
        metadata: { changedFields: changedFieldNames(changes) },
      });
    });
    return formulaMapper.toDTO(updatedFormula);
  }
}

/**
 * Borra (suave) una fórmula que ningún producto usa.
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {NotFoundError} `FORMULA_NOT_FOUND`.
 * @throws {ConflictError} `FORMULA_IN_USE` si algún producto no borrado la usa.
 */
export class DeleteFormulaUseCase {
  constructor(
    private readonly repository: IFormulaRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, formulaId: string): Promise<void> {
    assertAllowed(actor, Action.FORMULA_DELETE);
    if (!(await this.repository.findById(formulaId))) throw formulaNotFound();
    if (await this.repository.isUsedByProducts(formulaId)) {
      throw new ConflictError(ErrorCode.FORMULA_IN_USE, 'Formula is used by products');
    }

    await this.transactionManager.runInTransaction(async () => {
      await this.repository.delete(formulaId);
      await this.auditLogger.record({
        action: AuditAction.FORMULA_DELETED,
        entity: AuditEntity.FORMULA,
        entityId: formulaId,
      });
    });
  }
}
