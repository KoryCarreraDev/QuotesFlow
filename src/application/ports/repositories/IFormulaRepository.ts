import { Formula } from '../../../domain/entities/Formula.js';
import { IFilterableRepository } from './IFilterableRepository.js';

/** Fórmulas de precio de la empresa de la sesión (F3-T04). Todo se acota al tenant y excluye lo borrado (R5). */
export interface IFormulaRepository extends IFilterableRepository<Formula> {
  create(formula: Formula): Promise<void>;
  findById(formulaId: string): Promise<Formula | null>;
  update(formula: Formula): Promise<void>;
  delete(formulaId: string): Promise<void>;
  /**
   * Bloquea la fila de la fórmula hasta el final de la transacción (`FOR UPDATE`) antes de borrarla. Debe llamarse
   * dentro de la transacción del borrado: serializa el borrado con la asignación de la fórmula a un producto (F3-A20).
   *
   * @returns `false` si no existe, es de otra empresa o ya está borrada.
   */
  lockForDeletion(formulaId: string): Promise<boolean>;
  /** Indica si algún producto no borrado de la empresa usa la fórmula. */
  isUsedByProducts(formulaId: string): Promise<boolean>;
}
