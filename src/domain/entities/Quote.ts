import { ConflictError } from '../errors/ConflictError.js';
import { ErrorCode } from '../errors/ErrorCode.js';
import { ValidationError } from '../errors/ValidationError.js';
import { isCalendarDate } from '../value-objects/calendarDate.js';
import { Money, Percentage } from '../value-objects/money.js';

/** Estado guardado de una cotización (F3-T05). */
export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  /** D-22: tiene una versión más reciente; queda de solo lectura. */
  SUPERSEDED = 'SUPERSEDED',
}

/** Estado que ve el usuario: `EXPIRED` no se guarda, se calcula con la vigencia (Q-016). */
export type QuoteDisplayStatus = QuoteStatus | 'EXPIRED';

/** Cantidad máxima de un ítem: evita importes absurdos por un error de tecleo. */
export const MAXIMUM_ITEM_QUANTITY = 1_000_000;
/** Ítems máximos de una cotización. */
export const MAXIMUM_QUOTE_ITEMS = 200;

/** Datos de un ítem tal como los decide la cotización (ya resueltos el producto y su precio). */
export interface QuoteItemData {
  productId?: string;
  description: string;
  quantity: number;
  /** Variables de la fórmula del producto, como texto decimal (`{ "ancho": "1.20" }`). */
  variables?: Readonly<Record<string, string>>;
  /** Precio que dio el producto o su fórmula al cotizar; sin producto no hay. */
  calculatedUnitPrice?: Money;
  /** Precio unitario antes de IVA que se cobra. */
  unitPrice: Money;
  /** Obligatorio si `unitPrice` difiere de `calculatedUnitPrice` (D-24). */
  priceOverrideReason?: string;
  discountRate: Percentage;
  taxRate: Percentage;
  /**
   * Importes que se calcularon y guardaron cuando la cotización se emitió (F3-A06). Solo los pone el repositorio
   * al leer de la base; una cotización nueva o editada no los lleva.
   */
  storedAmounts?: QuoteItemAmounts;
}

/** Importes de un ítem, todos en centavos exactos. */
export interface QuoteItemAmounts {
  /** Precio unitario × cantidad. */
  grossAmount: Money;
  /** Descuento del ítem más su parte del descuento global. */
  discountAmount: Money;
  /** Base del IVA. */
  netAmount: Money;
  taxAmount: Money;
  total: Money;
}

/** Ítem de una cotización: una instantánea que no cambia aunque cambie el producto (F3-T05). */
export class QuoteItem {
  readonly productId?: string;
  readonly description: string;
  readonly quantity: number;
  readonly variables?: Readonly<Record<string, string>>;
  readonly calculatedUnitPrice?: Money;
  readonly unitPrice: Money;
  readonly priceOverrideReason?: string;
  readonly discountRate: Percentage;
  readonly taxRate: Percentage;
  readonly storedAmounts?: QuoteItemAmounts;

  /**
   * @throws {ValidationError} `INVALID_QUANTITY`, `INVALID_MONEY_AMOUNT` (precio negativo) o
   * `PRICE_OVERRIDE_REASON_REQUIRED` (precio cambiado sin motivo).
   */
  constructor(
    readonly position: number,
    data: QuoteItemData,
  ) {
    if (!Number.isInteger(data.quantity) || data.quantity < 1 || data.quantity > MAXIMUM_ITEM_QUANTITY) {
      throw new ValidationError(ErrorCode.INVALID_QUANTITY, 'Item quantity must be an integer from 1 to 1000000');
    }
    if (data.unitPrice.isNegative()) {
      throw new ValidationError(ErrorCode.INVALID_MONEY_AMOUNT, 'Item price cannot be negative');
    }
    const isOverridden = data.calculatedUnitPrice !== undefined && !data.unitPrice.equals(data.calculatedUnitPrice);
    if (isOverridden && !data.priceOverrideReason?.trim()) {
      throw new ValidationError(ErrorCode.PRICE_OVERRIDE_REASON_REQUIRED, 'A changed price needs a reason');
    }
    this.productId = data.productId;
    this.description = data.description;
    this.quantity = data.quantity;
    this.variables = data.variables;
    this.calculatedUnitPrice = data.calculatedUnitPrice;
    this.unitPrice = data.unitPrice;
    this.priceOverrideReason = isOverridden ? data.priceOverrideReason?.trim() : undefined;
    this.discountRate = data.discountRate;
    this.taxRate = data.taxRate;
    this.storedAmounts = data.storedAmounts;
  }

  /** D-24: el comercial cambió el precio que dio el producto. */
  get isPriceOverridden(): boolean {
    return this.calculatedUnitPrice !== undefined && !this.unitPrice.equals(this.calculatedUnitPrice);
  }

  /**
   * Importes del ítem. Orden: descuento del ítem, después el global sobre lo que queda, y el IVA sobre la base
   * final. Cada porcentaje se redondea a centavos en el ítem, así que los totales son la suma exacta de los ítems.
   */
  amounts(globalDiscountRate: Percentage): QuoteItemAmounts {
    const grossAmount = this.unitPrice.multiply(this.quantity);
    const itemDiscount = grossAmount.percentage(this.discountRate);
    const afterItemDiscount = grossAmount.subtract(itemDiscount);
    const globalDiscount = afterItemDiscount.percentage(globalDiscountRate);
    const netAmount = afterItemDiscount.subtract(globalDiscount);
    const taxAmount = netAmount.percentage(this.taxRate);
    return {
      grossAmount,
      discountAmount: itemDiscount.add(globalDiscount),
      netAmount,
      taxAmount,
      total: netAmount.add(taxAmount),
    };
  }
}

/** Totales de la cotización: suma exacta de los importes de sus ítems. */
export interface QuoteTotals {
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  total: Money;
}

/** A quién se cotiza: un lead, una persona, una empresa cliente, o varios a la vez. */
export interface QuoteCustomer {
  leadId?: string;
  contactId?: string;
  companyContactId?: string;
}

/** Contenido editable de una cotización en borrador. */
export interface QuoteContent {
  customer: QuoteCustomer;
  /** Último día de vigencia (`AAAA-MM-DD`), en la zona horaria de la empresa. */
  validUntil: string;
  discountRate: Percentage;
  notes?: string;
  items: readonly QuoteItem[];
}

export interface QuoteRecord extends QuoteContent {
  /** Estado que tenía antes de ser reemplazada por una versión nueva (F3-A03); solo en `SUPERSEDED`. */
  supersededFromStatus?: QuoteStatus;
  /** Totales guardados al emitir o al guardar el borrador (F3-A06); solo los pone el repositorio al leer. */
  storedTotals?: QuoteTotals;
  id: string;
  tenantId: string;
  number: number;
  version: number;
  status: QuoteStatus;
  createdById: string;
  previousVersionId?: string;
  sentAt?: Date;
  decidedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

function invalidTransition(message: string): ConflictError {
  return new ConflictError(ErrorCode.QUOTE_INVALID_TRANSITION, message);
}

/**
 * Cotización (F3-T05). Ciclo de vida:
 * - `DRAFT`: se edita libremente; se envía (`SENT`) o se borra.
 * - `SENT`: ya no se edita (D-22). Se acepta o rechaza mientras esté vigente; pasada la vigencia se muestra como
 *   `EXPIRED` (Q-016) y solo se rechaza o se revisa.
 * - Revisar una `SENT`, `REJECTED` o vencida crea la versión siguiente en `DRAFT`, con el mismo número, y deja la
 *   anterior en `SUPERSEDED`. Una `ACCEPTED` es definitiva.
 */
export class Quote {
  readonly id: string;
  readonly tenantId: string;
  readonly number: number;
  readonly version: number;
  readonly status: QuoteStatus;
  readonly customer: QuoteCustomer;
  readonly validUntil: string;
  readonly discountRate: Percentage;
  readonly notes?: string;
  readonly items: readonly QuoteItem[];
  readonly storedTotals?: QuoteTotals;
  readonly supersededFromStatus?: QuoteStatus;
  readonly createdById: string;
  readonly previousVersionId?: string;
  readonly sentAt?: Date;
  readonly decidedAt?: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  /**
   * @throws {ValidationError} `QUOTE_CUSTOMER_REQUIRED`, `INVALID_VALIDITY_DATE`, `QUOTE_ITEMS_REQUIRED` (más de
   * 200 ítems).
   */
  private constructor(record: QuoteRecord) {
    const { leadId, contactId, companyContactId } = record.customer;
    if (!leadId && !contactId && !companyContactId) {
      throw new ValidationError(ErrorCode.QUOTE_CUSTOMER_REQUIRED, 'Quote needs a lead, a contact or a company');
    }
    if (!isCalendarDate(record.validUntil)) {
      throw new ValidationError(ErrorCode.INVALID_VALIDITY_DATE, 'validUntil must be a YYYY-MM-DD date');
    }
    if (record.items.length > MAXIMUM_QUOTE_ITEMS) {
      throw new ValidationError(ErrorCode.QUOTE_ITEMS_REQUIRED, 'Quote has too many items');
    }
    this.id = record.id;
    this.tenantId = record.tenantId;
    this.number = record.number;
    this.version = record.version;
    this.status = record.status;
    this.customer = { leadId, contactId, companyContactId };
    this.validUntil = record.validUntil;
    this.discountRate = record.discountRate;
    this.notes = record.notes;
    this.items = record.items;
    this.storedTotals = record.storedTotals;
    this.supersededFromStatus = record.supersededFromStatus;
    this.createdById = record.createdById;
    this.previousVersionId = record.previousVersionId;
    this.sentAt = record.sentAt;
    this.decidedAt = record.decidedAt;
    this.createdAt = record.createdAt;
    this.updatedAt = record.updatedAt;
  }

  static restore(record: QuoteRecord): Quote {
    return new Quote(record);
  }

  /** Borrador nuevo con el número que asignó la secuencia de la empresa. */
  static createDraft(params: {
    id: string;
    tenantId: string;
    number: number;
    createdById: string;
    content: QuoteContent;
    now: Date;
  }): Quote {
    return new Quote({
      ...params.content,
      id: params.id,
      tenantId: params.tenantId,
      number: params.number,
      version: 1,
      status: QuoteStatus.DRAFT,
      createdById: params.createdById,
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  private toRecord(): QuoteRecord {
    return { ...this, customer: { ...this.customer } };
  }

  private with(changes: Partial<QuoteRecord>, now: Date): Quote {
    return new Quote({ ...this.toRecord(), ...changes, updatedAt: now });
  }

  /** Vencida: enviada y con la vigencia ya pasada en la fecha `today` de la empresa. */
  isExpiredOn(today: string): boolean {
    return this.status === QuoteStatus.SENT && this.validUntil < today;
  }

  displayStatusOn(today: string): QuoteDisplayStatus {
    return this.isExpiredOn(today) ? 'EXPIRED' : this.status;
  }

  /**
   * Importes de un ítem de esta cotización. Una cotización ya emitida (cualquier estado menos borrador) devuelve los
   * guardados cuando se emitió: así un cambio posterior en el redondeo o en el orden de los descuentos no altera
   * lo que el cliente ya recibió (F3-A06). El borrador se calcula siempre.
   */
  itemAmounts(item: QuoteItem): QuoteItemAmounts {
    const stored = this.status === QuoteStatus.DRAFT ? undefined : item.storedAmounts;
    return stored ?? item.amounts(this.discountRate);
  }

  /** Lo guardado si la cotización es emitida y lo tiene; si no, la suma calculada de sus ítems. */
  totals(): QuoteTotals {
    if (this.status !== QuoteStatus.DRAFT && this.storedTotals) return this.storedTotals;
    return this.calculatedTotals();
  }

  /**
   * Totales guardados si los hay, sea cual sea el estado (el listado los usa sin cargar los ítems, F3-A07); si no,
   * los calcula.
   */
  snapshotTotals(): QuoteTotals {
    return this.storedTotals ?? this.calculatedTotals();
  }

  private calculatedTotals(): QuoteTotals {
    return this.items.reduce<QuoteTotals>(
      (totals, item) => {
        const amounts = this.itemAmounts(item);
        return {
          subtotal: totals.subtotal.add(amounts.grossAmount),
          discountTotal: totals.discountTotal.add(amounts.discountAmount),
          taxTotal: totals.taxTotal.add(amounts.taxAmount),
          total: totals.total.add(amounts.total),
        };
      },
      { subtotal: Money.zero(), discountTotal: Money.zero(), taxTotal: Money.zero(), total: Money.zero() },
    );
  }

  /**
   * Cambia el contenido de un borrador.
   *
   * @throws {ConflictError} `QUOTE_NOT_EDITABLE` si ya no es un borrador (D-22: se revisa con una versión nueva).
   */
  withContent(content: QuoteContent, now: Date): Quote {
    this.assertEditable();
    // Los importes guardados eran del contenido anterior: se descartan y se recalculan al guardar.
    const itemsWithoutStoredAmounts = content.items.map(
      (item) => new QuoteItem(item.position, { ...item, storedAmounts: undefined }),
    );
    return this.with({ ...content, items: itemsWithoutStoredAmounts, storedTotals: undefined }, now);
  }

  /** @throws {ConflictError} `QUOTE_NOT_EDITABLE` si no es un borrador (D-22: lo enviado se revisa con una versión nueva). */
  assertEditable(): void {
    if (this.status !== QuoteStatus.DRAFT) {
      throw new ConflictError(ErrorCode.QUOTE_NOT_EDITABLE, 'Only draft quotes can be edited; create a new version');
    }
  }

  /**
   * Envía el borrador al cliente.
   *
   * @throws {ConflictError} `QUOTE_INVALID_TRANSITION` si no es un borrador; `QUOTE_EXPIRED` si la vigencia ya pasó.
   * @throws {ValidationError} `QUOTE_ITEMS_REQUIRED` si no tiene ítems.
   */
  markSent(now: Date, today: string): Quote {
    if (this.status !== QuoteStatus.DRAFT) throw invalidTransition('Only draft quotes can be sent');
    if (this.items.length === 0) {
      throw new ValidationError(ErrorCode.QUOTE_ITEMS_REQUIRED, 'A quote needs at least one item to be sent');
    }
    if (this.validUntil < today) {
      throw new ConflictError(ErrorCode.QUOTE_EXPIRED, 'Validity date has already passed; change it before sending');
    }
    return this.with({ status: QuoteStatus.SENT, sentAt: now }, now);
  }

  /**
   * El cliente aceptó. Solo una cotización enviada y vigente.
   *
   * @throws {ConflictError} `QUOTE_INVALID_TRANSITION` o `QUOTE_EXPIRED`.
   */
  accept(now: Date, today: string): Quote {
    if (this.status !== QuoteStatus.SENT) throw invalidTransition('Only sent quotes can be accepted');
    if (this.isExpiredOn(today)) throw new ConflictError(ErrorCode.QUOTE_EXPIRED, 'Quote has expired');
    return this.with({ status: QuoteStatus.ACCEPTED, decidedAt: now }, now);
  }

  /**
   * El cliente rechazó. Vale también para una vencida.
   *
   * @throws {ConflictError} `QUOTE_INVALID_TRANSITION` si no estaba enviada.
   */
  reject(now: Date): Quote {
    if (this.status !== QuoteStatus.SENT) throw invalidTransition('Only sent quotes can be rejected');
    return this.with({ status: QuoteStatus.REJECTED, decidedAt: now }, now);
  }

  /**
   * Revisión (D-22): la versión siguiente en borrador, con el mismo número y el mismo contenido, y esta reemplazada
   * (guarda el estado que tenía, para poder restaurarla si se descarta la revisión, F3-A03).
   *
   * @param nextVersionNumber Número de la versión nueva. Por defecto `version + 1`; quien persiste pasa el siguiente
   * al mayor ya usado en el número (incluidas las versiones borradas, que siguen ocupando la unicidad).
   * @throws {ConflictError} `QUOTE_INVALID_TRANSITION` si es un borrador, ya está reemplazada o fue aceptada.
   */
  revise(
    nextVersionId: string,
    now: Date,
    nextVersionNumber = this.version + 1,
  ): { superseded: Quote; nextVersion: Quote } {
    if (this.status !== QuoteStatus.SENT && this.status !== QuoteStatus.REJECTED) {
      throw invalidTransition('Only sent or rejected quotes can be revised');
    }
    const nextVersion = new Quote({
      ...this.toRecord(),
      id: nextVersionId,
      version: nextVersionNumber,
      status: QuoteStatus.DRAFT,
      previousVersionId: this.id,
      sentAt: undefined,
      decidedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
    return {
      superseded: this.with({ status: QuoteStatus.SUPERSEDED, supersededFromStatus: this.status }, now),
      nextVersion,
    };
  }

  /**
   * Devuelve la cotización al estado que tenía antes de que se creara la revisión que se acaba de descartar.
   *
   * @throws {ConflictError} `QUOTE_INVALID_TRANSITION` si no está reemplazada o no se sabe qué estado tenía.
   */
  restoreAfterDiscardedRevision(now: Date): Quote {
    if (this.status !== QuoteStatus.SUPERSEDED || this.supersededFromStatus === undefined) {
      throw invalidTransition('Only a superseded quote with a known previous status can be restored');
    }
    return this.with({ status: this.supersededFromStatus, supersededFromStatus: undefined }, now);
  }

  /** @throws {ConflictError} `QUOTE_NOT_EDITABLE` si no es un borrador: lo enviado queda como historial. */
  assertDeletable(): void {
    if (this.status !== QuoteStatus.DRAFT) {
      throw new ConflictError(ErrorCode.QUOTE_NOT_EDITABLE, 'Only draft quotes can be deleted');
    }
  }
}
