import { Quote } from '../../domain/entities/Quote.js';
import { QuoteDTO, QuoteItemDTO } from '../dtos/QuoteDTOs.js';

const REFERENCE_PREFIX = 'COT-';
const REFERENCE_DIGITS = 6;
const FIRST_VERSION = 1;

/** `COT-000123`, y `COT-000123 v2` desde la segunda versión (Q-018). */
export function quoteReference(number: number, version: number): string {
  const base = `${REFERENCE_PREFIX}${String(number).padStart(REFERENCE_DIGITS, '0')}`;
  return version > FIRST_VERSION ? `${base} v${version}` : base;
}

/** Cotización a DTO: sin tenant ni marca de borrado; importes como texto decimal. */
export function toQuoteDTO(quote: Quote, today: string): QuoteDTO {
  const totals = quote.totals();
  const items: QuoteItemDTO[] = quote.items.map((item) => {
    const amounts = quote.itemAmounts(item);
    return {
      position: item.position,
      productId: item.productId,
      description: item.description,
      quantity: item.quantity,
      variables: item.variables ? { ...item.variables } : undefined,
      calculatedUnitPrice: item.calculatedUnitPrice?.toDecimalString(),
      unitPrice: item.unitPrice.toDecimalString(),
      isPriceOverridden: item.isPriceOverridden,
      priceOverrideReason: item.priceOverrideReason,
      discountRate: item.discountRate.toDecimalString(),
      taxRate: item.taxRate.toDecimalString(),
      netAmount: amounts.netAmount.toDecimalString(),
      taxAmount: amounts.taxAmount.toDecimalString(),
      total: amounts.total.toDecimalString(),
    };
  });
  return {
    id: quote.id,
    number: quote.number,
    reference: quoteReference(quote.number, quote.version),
    version: quote.version,
    status: quote.status,
    displayStatus: quote.displayStatusOn(today),
    leadId: quote.customer.leadId,
    contactId: quote.customer.contactId,
    companyContactId: quote.customer.companyContactId,
    validUntil: quote.validUntil,
    discountRate: quote.discountRate.toDecimalString(),
    notes: quote.notes,
    items,
    subtotal: totals.subtotal.toDecimalString(),
    discountTotal: totals.discountTotal.toDecimalString(),
    taxTotal: totals.taxTotal.toDecimalString(),
    total: totals.total.toDecimalString(),
    createdById: quote.createdById,
    previousVersionId: quote.previousVersionId,
    sentAt: quote.sentAt,
    decidedAt: quote.decidedAt,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  };
}
