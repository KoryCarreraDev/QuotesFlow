import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IFormulaRepository } from '@/application/ports/repositories/IFormulaRepository.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Formula } from '@/domain/entities/Formula.js';
import { paginateInMemory } from './inMemoryPagination.js';

/**
 * Doble en memoria de `IFormulaRepository`. Solo ve fórmulas del tenant actual y no borradas.
 * `findFiltered` no interpreta los filtros (eso se prueba contra PostgreSQL); solo pagina.
 */
export class InMemoryFormulaRepository implements IFormulaRepository {
  private readonly formulasById = new Map<string, Formula>();
  private readonly deletedFormulaIds = new Set<string>();
  /** Fórmulas que algún producto no borrado usa. */
  readonly formulaIdsUsedByProducts = new Set<string>();

  constructor(private readonly tenantContext: ITenantContext) {}

  seed(...formulas: Formula[]): void {
    for (const formula of formulas) this.formulasById.set(formula.id, formula);
  }

  findStoredById(formulaId: string): Formula | undefined {
    return this.formulasById.get(formulaId);
  }

  isDeleted(formulaId: string): boolean {
    return this.deletedFormulaIds.has(formulaId);
  }

  private visibleFormulas(): Formula[] {
    return [...this.formulasById.values()].filter(
      (formula) => formula.tenantId === this.tenantContext.getTenantId() && !this.deletedFormulaIds.has(formula.id),
    );
  }

  async create(formula: Formula): Promise<void> {
    this.formulasById.set(formula.id, formula);
  }

  async findById(formulaId: string): Promise<Formula | null> {
    return this.visibleFormulas().find((formula) => formula.id === formulaId) ?? null;
  }

  async update(formula: Formula): Promise<void> {
    this.formulasById.set(formula.id, formula);
  }

  async delete(formulaId: string): Promise<void> {
    this.deletedFormulaIds.add(formulaId);
  }

  async isUsedByProducts(formulaId: string): Promise<boolean> {
    return this.formulaIdsUsedByProducts.has(formulaId);
  }

  async findFiltered(criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<Formula[]> {
    return paginateInMemory(this.visibleFormulas(), criteria);
  }

  async countFiltered(_criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<number> {
    return this.visibleFormulas().length;
  }
}
