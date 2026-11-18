import { Product } from '../../../domain/entities/Product.js';
import { IFilterableRepository } from './IFilterableRepository.js';

/**
 * Catálogo de productos de la empresa de la sesión (F3-T02). Todo se acota al tenant y excluye lo borrado (R5).
 */
export interface IProductRepository extends IFilterableRepository<Product> {
  create(product: Product): Promise<void>;
  findById(productId: string): Promise<Product | null>;
  update(product: Product): Promise<void>;
  /** Borrado suave: las cotizaciones que ya lo usan conservan su copia del ítem. */
  delete(productId: string): Promise<void>;
  /**
   * Indica si la fórmula existe, no está borrada y es de la empresa de la sesión. Dentro de una transacción además
   * bloquea la fila (`FOR SHARE`) hasta confirmar: un borrado de la fórmula espera a que el producto quede guardado y
   * entonces ve que la usa (F3-A20). Por eso se llama dentro de la transacción que guarda el producto.
   */
  formulaExists(formulaId: string): Promise<boolean>;
}
