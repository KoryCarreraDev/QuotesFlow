import { Quote, QuoteStatus } from '../../../domain/entities/Quote.js';
import { IFilterableRepository } from './IFilterableRepository.js';

/**
 * Cotizaciones de la empresa de la sesión (F3-T05). Todo se acota al tenant y excluye lo borrado (R5).
 * Las escrituras van dentro de una transacción (`ITransactionManager`).
 */
export interface IQuoteRepository extends IFilterableRepository<Quote> {
  // `findFiltered` (el listado) devuelve cotizaciones **sin ítems**, con los totales guardados: usar
  // `Quote.snapshotTotals()`. Para los ítems, `findById` (F3-A07).
  /**
   * Siguiente número consecutivo de la empresa. Tiene que llamarse dentro de la transacción que crea la cotización:
   * la fila de la secuencia queda bloqueada hasta confirmar, así que dos altas simultáneas no repiten número y un
   * alta revertida no deja hueco.
   */
  nextNumber(): Promise<number>;

  /** Guarda una cotización nueva con sus ítems (también la versión siguiente de una revisión). */
  create(quote: Quote): Promise<void>;

  /**
   * Número de la versión siguiente de un número de cotización: el mayor ya usado más uno. Cuenta también las versiones
   * borradas, porque siguen ocupando la unicidad `(empresa, número, versión)` (F3-A03).
   */
  nextVersionNumber(quoteNumber: number): Promise<number>;

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

  /**
   * Borrado suave de un borrador, comparando el estado (como `saveState`): si otra petición lo envió mientras tanto,
   * no se borra.
   *
   * @returns `false` si ya no es un borrador, no existe o es de otra empresa.
   */
  deleteDraft(quoteId: string): Promise<boolean>;
}
