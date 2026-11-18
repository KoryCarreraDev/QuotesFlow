import { DeletedState as StoredDeletedState, Prisma, QuoteStatus as StoredQuoteStatus } from '@prisma/client';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IQuoteRepository } from '@/application/ports/repositories/IQuoteRepository.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { Quote, QuoteItem, QuoteItemAmounts, QuoteStatus } from '@/domain/entities/Quote.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { calendarDateOfStoredDate } from '@/domain/value-objects/calendarDate.js';
import { Money, Percentage } from '@/domain/value-objects/money.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

const quoteInclude = {
  items: { where: { deleted: 'INUSE' as const }, orderBy: { position: 'asc' as const } },
} satisfies Prisma.QuoteInclude;

type QuoteRecord = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;
type QuoteItemRecord = QuoteRecord['items'][number];

const STATUS_FIELD = 'status';
const STORED_STATUSES: ReadonlySet<string> = new Set(Object.values(QuoteStatus));

/** Importes y porcentajes se leen por su texto, nunca por `Number` (F3-T01). */
function moneyOf(value: Prisma.Decimal): Money {
  return Money.fromDecimalStringRounded(value.toFixed());
}

/** Importes del ítem que se guardaron al emitir la cotización (F3-A06). El bruto y el descuento salen de ellos. */
function storedAmountsOf(record: QuoteItemRecord, unitPrice: Money): QuoteItemAmounts {
  const grossAmount = unitPrice.multiply(record.quantity);
  const netAmount = moneyOf(record.netAmount);
  return {
    grossAmount,
    discountAmount: grossAmount.subtract(netAmount),
    netAmount,
    taxAmount: moneyOf(record.taxAmount),
    total: moneyOf(record.total),
  };
}

function toQuoteItem(record: QuoteItemRecord): QuoteItem {
  return new QuoteItem(record.position, {
    storedAmounts: storedAmountsOf(record, moneyOf(record.unitPrice)),
    productId: record.productId ?? undefined,
    description: record.description,
    quantity: record.quantity,
    variables: (record.variables as Record<string, string> | null) ?? undefined,
    calculatedUnitPrice: record.calculatedUnitPrice ? moneyOf(record.calculatedUnitPrice) : undefined,
    unitPrice: moneyOf(record.unitPrice),
    priceOverrideReason: record.priceOverrideReason ?? undefined,
    discountRate: Percentage.fromDecimalString(record.discountRate.toFixed()),
    taxRate: Percentage.fromDecimalString(record.taxRate.toFixed()),
  });
}

function toQuote(record: QuoteRecord): Quote {
  return Quote.restore({
    id: record.id,
    tenantId: record.tenantId,
    number: record.number,
    version: record.version,
    status: record.status as QuoteStatus,
    customer: {
      leadId: record.leadId ?? undefined,
      contactId: record.contactId ?? undefined,
      companyContactId: record.companyContactId ?? undefined,
    },
    validUntil: calendarDateOfStoredDate(record.validUntil),
    discountRate: Percentage.fromDecimalString(record.discountRate.toFixed()),
    notes: record.notes ?? undefined,
    items: record.items.map(toQuoteItem),
    storedTotals: {
      subtotal: moneyOf(record.subtotal),
      discountTotal: moneyOf(record.discountTotal),
      taxTotal: moneyOf(record.taxTotal),
      total: moneyOf(record.total),
    },
    createdById: record.createdById,
    previousVersionId: record.previousVersionId ?? undefined,
    sentAt: record.sentAt ?? undefined,
    decidedAt: record.decidedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

/** Fecha de calendario `AAAA-MM-DD` a la columna `DATE` (medianoche UTC). */
function storedDateOf(calendarDate: string): Date {
  return new Date(`${calendarDate}T00:00:00.000Z`);
}

/** Cotizaciones sobre Prisma (F3-T05). Toda consulta lleva el tenant y excluye lo borrado (R5). */
export class PrismaQuoteRepository extends BasePrismaRepository implements IQuoteRepository {
  /**
   * `INSERT ... ON CONFLICT DO UPDATE` es atómico: el primer alta de una empresa crea la fila y las siguientes la
   * incrementan. La fila queda bloqueada hasta confirmar la transacción, así que otra alta de la misma empresa
   * espera y recibe el número siguiente; si la transacción se revierte, el incremento también.
   */
  async nextNumber(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ lastNumber: number }>>`
      INSERT INTO "QuoteNumberSequence" ("tenantId", "lastNumber")
      VALUES (${this.tenantId}, 1)
      ON CONFLICT ("tenantId") DO UPDATE SET "lastNumber" = "QuoteNumberSequence"."lastNumber" + 1
      RETURNING "lastNumber"`;
    return rows[0].lastNumber;
  }

  private contentData(quote: Quote) {
    const totals = quote.totals();
    return {
      leadId: quote.customer.leadId ?? null,
      contactId: quote.customer.contactId ?? null,
      companyContactId: quote.customer.companyContactId ?? null,
      validUntil: storedDateOf(quote.validUntil),
      discountRate: quote.discountRate.toDecimalString(),
      subtotal: totals.subtotal.toDecimalString(),
      discountTotal: totals.discountTotal.toDecimalString(),
      taxTotal: totals.taxTotal.toDecimalString(),
      total: totals.total.toDecimalString(),
      notes: quote.notes ?? null,
      updatedAt: quote.updatedAt,
    };
  }

  private itemRows(quote: Quote): Prisma.QuoteItemCreateManyInput[] {
    return quote.items.map((item) => {
      const amounts = item.amounts(quote.discountRate);
      return {
        tenantId: this.tenantId,
        quoteId: quote.id,
        position: item.position,
        productId: item.productId ?? null,
        description: item.description,
        quantity: item.quantity,
        variables: item.variables ?? Prisma.JsonNull,
        calculatedUnitPrice: item.calculatedUnitPrice?.toDecimalString() ?? null,
        unitPrice: item.unitPrice.toDecimalString(),
        priceOverrideReason: item.priceOverrideReason ?? null,
        discountRate: item.discountRate.toDecimalString(),
        taxRate: item.taxRate.toDecimalString(),
        netAmount: amounts.netAmount.toDecimalString(),
        taxAmount: amounts.taxAmount.toDecimalString(),
        total: amounts.total.toDecimalString(),
      };
    });
  }

  async create(quote: Quote): Promise<void> {
    await this.prisma.quote.create({
      data: {
        id: quote.id,
        tenantId: this.tenantId,
        number: quote.number,
        version: quote.version,
        status: quote.status as StoredQuoteStatus,
        createdById: quote.createdById,
        previousVersionId: quote.previousVersionId ?? null,
        sentAt: quote.sentAt ?? null,
        decidedAt: quote.decidedAt ?? null,
        createdAt: quote.createdAt,
        ...this.contentData(quote),
      },
    });
    await this.prisma.quoteItem.createMany({ data: this.itemRows(quote) });
  }

  async findById(quoteId: string): Promise<Quote | null> {
    const record = await this.prisma.quote.findFirst({
      where: { id: quoteId, ...this.tenantWhere() },
      include: quoteInclude,
    });
    return record ? toQuote(record) : null;
  }

  async saveContent(quote: Quote): Promise<void> {
    // Solo un borrador cambia de contenido (D-22): la condición evita pisar uno que otra petición acaba de enviar.
    const { count } = await this.prisma.quote.updateMany({
      where: { id: quote.id, ...this.tenantWhere(), status: StoredQuoteStatus.DRAFT },
      data: this.contentData(quote),
    });
    if (count !== 1) {
      throw new ConflictError(ErrorCode.QUOTE_NOT_EDITABLE, 'Quote is no longer a draft');
    }
    await this.prisma.quoteItem.deleteMany({ where: { quoteId: quote.id, tenantId: this.tenantId } });
    await this.prisma.quoteItem.createMany({ data: this.itemRows(quote) });
  }

  async saveState(quote: Quote, expectedStatus: QuoteStatus): Promise<boolean> {
    const { count } = await this.prisma.quote.updateMany({
      where: { id: quote.id, ...this.tenantWhere(), status: expectedStatus as StoredQuoteStatus },
      data: {
        status: quote.status as StoredQuoteStatus,
        sentAt: quote.sentAt ?? null,
        decidedAt: quote.decidedAt ?? null,
        updatedAt: quote.updatedAt,
      },
    });
    return count === 1;
  }

  async deleteDraft(quoteId: string): Promise<boolean> {
    const { count } = await this.prisma.quote.updateMany({
      where: { id: quoteId, ...this.tenantWhere(), status: StoredQuoteStatus.DRAFT },
      data: { deleted: StoredDeletedState.DELETED, updatedAt: new Date() },
    });
    return count === 1;
  }

  /** Un estado que no existe haría fallar a Prisma con un 500: se rechaza como filtro inválido. */
  private assertKnownStatuses(criteria: FilterCriteriaDTO): void {
    for (const filter of criteria.filters ?? []) {
      if (filter.field !== STATUS_FIELD) continue;
      const values = Array.isArray(filter.value) ? filter.value : [filter.value];
      if (!values.every((value) => typeof value === 'string' && STORED_STATUSES.has(value))) {
        throw new ValidationError(ErrorCode.INVALID_FILTER_VALUE, 'Unknown quote status in filters');
      }
    }
  }

  async findFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<Quote[]> {
    this.assertKnownStatuses(criteria);
    const { skip, take } = this.buildPagination(criteria);
    const records = await this.prisma.quote.findMany({
      where: this.buildFilterWhere(criteria, config),
      orderBy: this.buildOrderBy(criteria, config),
      include: quoteInclude,
      skip,
      take,
    });
    return records.map(toQuote);
  }

  async countFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<number> {
    this.assertKnownStatuses(criteria);
    return this.prisma.quote.count({ where: this.buildFilterWhere(criteria, config) });
  }
}
