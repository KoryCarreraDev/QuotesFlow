import { Formula } from '../../../domain/entities/Formula.js';
import { IFilterableRepository } from './IFilterableRepository.js';

/** Fórmulas de precio de la empresa de la sesión (F3-T04). Todo se acota al tenant y excluye lo borrado (R5). */
export interface IFormulaRepository extends IFilterableRepository<Formula> {
  create(formula: Formula): Promise<void>;
  findById(formulaId: string): Promise<Formula | null>;
  update(formula: Formula): Promise<void>;
  delete(formulaId: string): Promise<void>;
  /** Indica si algún producto no borrado de la empresa usa la fórmula. */
  isUsedByProducts(formulaId: string): Promise<boolean>;
}
