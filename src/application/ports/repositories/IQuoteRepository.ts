import { Quote, QuoteStatus } from '../../../domain/entities/Quote.js';
import { IFilterableRepository } from './IFilterableRepository.js';

/**
 * Cotizaciones de la empresa de la sesión (F3-T05). Todo se acota al tenant y excluye lo borrado (R5).
 * Las escrituras van dentro de una transacción (`ITransactionManager`).
 */
export interface IQuoteRepository extends IFilterableRepository<Quote> {
  /**
   * Siguiente número consecutivo de la empresa. Tiene que llamarse dentro de la transacción que crea la cotización:
   * la fila de la secuencia queda bloqueada hasta confirmar, así que dos altas simultáneas no repiten número y un
   * alta revertida no deja hueco.
   */
  nextNumber(): Promise<number>;

  /** Guarda una cotización nueva con sus ítems (también la versión siguiente de una revisión). */
  create(quote: Quote): Promise<void>;

  /** La cotización con sus ítems por orden; `null` si no existe, es de otra empresa o está borrada. */
  findById(quoteId: string): Promise<Quote | null>;

  /** Reemplaza los datos y los ítems de un borrador. */
  saveContent(quote: Quote): Promise<void>;

  /**
   * Guarda el estado y sus fechas solo si la cotización sigue en `expectedStatus` (comparar y cambiar: dos
   * peticiones simultáneas no pueden aceptar y rechazar la misma cotización).
   *
   * @returns `false` si otra petición ya la cambió.
   */
  saveState(quote: Quote, expectedStatus: QuoteStatus): Promise<boolean>;

  /** Borrado suave; solo borradores. */
  delete(quoteId: string): Promise<void>;
}
