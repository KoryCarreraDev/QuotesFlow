import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IQuoteRepository } from '@/application/ports/repositories/IQuoteRepository.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Quote, QuoteStatus } from '@/domain/entities/Quote.js';
import { paginateInMemory } from './inMemoryPagination.js';

/**
 * Doble en memoria de `IQuoteRepository`. Solo ve cotizaciones del tenant actual y no borradas. La secuencia de
 * números empieza en 1 por empresa. `findFiltered` no interpreta los filtros (eso se prueba contra PostgreSQL).
 */
export class InMemoryQuoteRepository implements IQuoteRepository {
  private readonly quotesById = new Map<string, Quote>();
  private readonly deletedQuoteIds = new Set<string>();
  private lastNumber = 0;
  /** Estado que ve el siguiente `saveState` como ya cambiado por otra petición (simula la carrera). */
  failNextStateSave = false;

  constructor(private readonly tenantContext: ITenantContext) {}

  seed(...quotes: Quote[]): void {
    for (const quote of quotes) this.quotesById.set(quote.id, quote);
  }

  findStoredById(quoteId: string): Quote | undefined {
    return this.quotesById.get(quoteId);
  }

  isDeleted(quoteId: string): boolean {
    return this.deletedQuoteIds.has(quoteId);
  }

  allStored(): Quote[] {
    return [...this.quotesById.values()];
  }

  private visibleQuotes(): Quote[] {
    return [...this.quotesById.values()].filter(
      (quote) => quote.tenantId === this.tenantContext.getTenantId() && !this.deletedQuoteIds.has(quote.id),
    );
  }

  async nextNumber(): Promise<number> {
    this.lastNumber += 1;
    return this.lastNumber;
  }

  async nextVersionNumber(quoteNumber: number): Promise<number> {
    const versions = this.allStored()
      .filter((quote) => quote.tenantId === this.tenantContext.getTenantId() && quote.number === quoteNumber)
      .map((quote) => quote.version);
    return Math.max(0, ...versions) + 1;
  }

  async create(quote: Quote): Promise<void> {
    this.quotesById.set(quote.id, quote);
  }

  async findById(quoteId: string): Promise<Quote | null> {
    return this.visibleQuotes().find((quote) => quote.id === quoteId) ?? null;
  }

  async saveContent(quote: Quote): Promise<void> {
    this.quotesById.set(quote.id, quote);
  }

  async saveState(quote: Quote, expectedStatus: QuoteStatus): Promise<boolean> {
    const stored = this.quotesById.get(quote.id);
    if (this.failNextStateSave || stored?.status !== expectedStatus) {
      this.failNextStateSave = false;
      return false;
    }
    this.quotesById.set(quote.id, quote);
    return true;
  }

  async deleteDraft(quoteId: string): Promise<boolean> {
    const stored = this.quotesById.get(quoteId);
    if (!stored || stored.status !== QuoteStatus.DRAFT) return false;
    this.deletedQuoteIds.add(quoteId);
    return true;
  }

  async findFiltered(criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<Quote[]> {
    return paginateInMemory(this.visibleQuotes(), criteria);
  }

  async countFiltered(_criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<number> {
    return this.visibleQuotes().length;
  }
}
