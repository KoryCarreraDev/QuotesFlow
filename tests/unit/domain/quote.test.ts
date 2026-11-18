import { describe, expect, it } from 'vitest';
import {
  MAXIMUM_ITEM_QUANTITY,
  MAXIMUM_QUOTE_ITEMS,
  Quote,
  QuoteContent,
  QuoteItem,
  QuoteItemData,
  QuoteStatus,
} from '@/domain/entities/Quote.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { calendarDateIn, calendarDateOfStoredDate, isCalendarDate } from '@/domain/value-objects/calendarDate.js';
import { Money, Percentage } from '@/domain/value-objects/money.js';

// F3-T05: cotización. Importes exactos, estados, versiones (D-22) y vigencia (D-23, Q-016).

const NOW = new Date('2026-11-17T15:00:00.000Z');
const TODAY = '2026-11-17';
const YESTERDAY = '2026-11-16';
const TOMORROW = '2026-11-18';
const SECOND_POSITION = 2;
const NON_INTEGER_QUANTITY = 1.5;
const rate = (text: string) => Percentage.fromDecimalString(text);
const money = (text: string) => Money.fromDecimalString(text);

function itemData(overrides: Partial<QuoteItemData> = {}): QuoteItemData {
  return {
    description: 'Ventana corrediza',
    quantity: 2,
    unitPrice: money('450000'),
    discountRate: rate('0'),
    taxRate: rate('19'),
    ...overrides,
  };
}

function content(overrides: Partial<QuoteContent> = {}): QuoteContent {
  return {
    customer: { leadId: 'lead-id' },
    validUntil: TOMORROW,
    discountRate: rate('0'),
    items: [new QuoteItem(1, itemData())],
    ...overrides,
  };
}

function draftQuote(overrides: Partial<QuoteContent> = {}): Quote {
  return Quote.createDraft({
    id: 'quote-id',
    tenantId: 'tenant-id',
    number: 12,
    createdById: 'user-id',
    content: content(overrides),
    now: NOW,
  });
}

describe('QuoteItem', () => {
  it('calcula descuento, base e IVA con centavos exactos', () => {
    const item = new QuoteItem(1, itemData({ unitPrice: money('333.33'), quantity: 3, discountRate: rate('10') }));

    const amounts = item.amounts(rate('0'));

    expect(amounts.grossAmount.toDecimalString()).toBe('999.99');
    expect(amounts.discountAmount.toDecimalString()).toBe('100.00');
    expect(amounts.netAmount.toDecimalString()).toBe('899.99');
    expect(amounts.taxAmount.toDecimalString()).toBe('171.00');
    expect(amounts.total.toDecimalString()).toBe('1070.99');
  });

  it('el descuento global se aplica después del descuento del ítem, y el IVA sobre la base final', () => {
    const item = new QuoteItem(1, itemData({ unitPrice: money('1000'), quantity: 1, discountRate: rate('10') }));

    const amounts = item.amounts(rate('10'));

    expect(amounts.discountAmount.toDecimalString()).toBe('190.00');
    expect(amounts.netAmount.toDecimalString()).toBe('810.00');
    expect(amounts.taxAmount.toDecimalString()).toBe('153.90');
  });

  it.each([0, -1, NON_INTEGER_QUANTITY, MAXIMUM_ITEM_QUANTITY + 1])('rechaza la cantidad %s', (quantity) => {
    expect(() => new QuoteItem(1, itemData({ quantity }))).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_QUANTITY }),
    );
  });

  it('rechaza un precio negativo', () => {
    expect(() => new QuoteItem(1, itemData({ unitPrice: money('-1') }))).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_MONEY_AMOUNT }),
    );
  });

  it('un precio distinto del calculado exige motivo (D-24)', () => {
    const changedPrice = itemData({ calculatedUnitPrice: money('450000'), unitPrice: money('400000') });

    expect(() => new QuoteItem(1, changedPrice)).toThrow(
      expect.objectContaining({ code: ErrorCode.PRICE_OVERRIDE_REASON_REQUIRED }),
    );
    expect(() => new QuoteItem(1, { ...changedPrice, priceOverrideReason: '   ' })).toThrow(
      expect.objectContaining({ code: ErrorCode.PRICE_OVERRIDE_REASON_REQUIRED }),
    );
  });

  it('con motivo, el precio manual se acepta, se marca y guarda el calculado', () => {
    const item = new QuoteItem(
      1,
      itemData({
        calculatedUnitPrice: money('450000'),
        unitPrice: money('400000'),
        priceOverrideReason: ' Cliente frecuente ',
      }),
    );

    expect(item.isPriceOverridden).toBe(true);
    expect(item.priceOverrideReason).toBe('Cliente frecuente');
    expect(item.calculatedUnitPrice?.toDecimalString()).toBe('450000.00');
  });

  it('si el precio coincide con el calculado no es un cambio y el motivo se descarta', () => {
    const item = new QuoteItem(
      1,
      itemData({ calculatedUnitPrice: money('450000'), unitPrice: money('450000'), priceOverrideReason: 'sobra' }),
    );

    expect(item.isPriceOverridden).toBe(false);
    expect(item.priceOverrideReason).toBeUndefined();
  });
});

describe('Quote: contenido', () => {
  it('los totales son la suma exacta de los ítems', () => {
    const quote = draftQuote({
      items: [
        new QuoteItem(1, itemData({ unitPrice: money('0.10'), quantity: 1 })),
        new QuoteItem(SECOND_POSITION, itemData({ unitPrice: money('0.20'), quantity: 1 })),
      ],
    });

    const totals = quote.totals();

    expect(totals.subtotal.toDecimalString()).toBe('0.30');
    expect(totals.taxTotal.toDecimalString()).toBe('0.06');
    expect(totals.total.toDecimalString()).toBe('0.36');
  });

  it('una cotización sin ítems suma cero', () => {
    expect(draftQuote({ items: [] }).totals().total.isZero()).toBe(true);
  });

  it('necesita un lead, un contacto o una empresa cliente', () => {
    expect(() => draftQuote({ customer: {} })).toThrow(
      expect.objectContaining({ code: ErrorCode.QUOTE_CUSTOMER_REQUIRED }),
    );
  });

  it.each(['2026-02-30', '17/11/2026', '2026-11-17T00:00:00Z', ''])('rechaza la vigencia "%s"', (validUntil) => {
    expect(() => draftQuote({ validUntil })).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_VALIDITY_DATE }),
    );
  });

  it(`rechaza más de ${MAXIMUM_QUOTE_ITEMS} ítems`, () => {
    const manyItems = Array.from(
      { length: MAXIMUM_QUOTE_ITEMS + 1 },
      (_, index) => new QuoteItem(index + 1, itemData()),
    );

    expect(() => draftQuote({ items: manyItems })).toThrow(
      expect.objectContaining({ code: ErrorCode.QUOTE_ITEMS_REQUIRED }),
    );
  });

  it('un borrador se edita y conserva número, versión y autor', () => {
    const edited = draftQuote().withContent(content({ notes: 'Instalación incluida' }), NOW);

    expect(edited).toMatchObject({ number: 12, version: 1, createdById: 'user-id', notes: 'Instalación incluida' });
  });

  it('lo enviado no se edita (D-22)', () => {
    const sent = draftQuote().markSent(NOW, TODAY);

    expect(() => sent.withContent(content(), NOW)).toThrow(
      expect.objectContaining({ code: ErrorCode.QUOTE_NOT_EDITABLE }),
    );
  });
});

describe('Quote: estados', () => {
  it('envía un borrador con ítems y vigencia hoy o futura', () => {
    expect(draftQuote({ validUntil: TODAY }).markSent(NOW, TODAY)).toMatchObject({
      status: QuoteStatus.SENT,
      sentAt: NOW,
    });
  });

  it('no envía una cotización sin ítems', () => {
    expect(() => draftQuote({ items: [] }).markSent(NOW, TODAY)).toThrow(
      expect.objectContaining({ code: ErrorCode.QUOTE_ITEMS_REQUIRED }),
    );
  });

  it('no envía una cotización con la vigencia pasada', () => {
    expect(() => draftQuote({ validUntil: YESTERDAY }).markSent(NOW, TODAY)).toThrow(
      expect.objectContaining({ code: ErrorCode.QUOTE_EXPIRED }),
    );
  });

  it('solo un borrador se envía', () => {
    const sent = draftQuote().markSent(NOW, TODAY);

    expect(() => sent.markSent(NOW, TODAY)).toThrow(
      expect.objectContaining({ code: ErrorCode.QUOTE_INVALID_TRANSITION }),
    );
  });

  it('acepta una enviada y vigente y guarda cuándo', () => {
    const accepted = draftQuote().markSent(NOW, TODAY).accept(NOW, TODAY);

    expect(accepted).toMatchObject({ status: QuoteStatus.ACCEPTED, decidedAt: NOW });
  });

  it('el último día de vigencia todavía se puede aceptar', () => {
    const sent = draftQuote({ validUntil: TODAY }).markSent(NOW, TODAY);

    expect(sent.accept(NOW, TODAY).status).toBe(QuoteStatus.ACCEPTED);
  });

  it('una vencida se muestra como EXPIRED, no se acepta y sí se rechaza (Q-016)', () => {
    const sent = draftQuote({ validUntil: TODAY }).markSent(NOW, TODAY);

    expect(sent.displayStatusOn(TOMORROW)).toBe('EXPIRED');
    expect(sent.displayStatusOn(TODAY)).toBe(QuoteStatus.SENT);
    expect(() => sent.accept(NOW, TOMORROW)).toThrow(expect.objectContaining({ code: ErrorCode.QUOTE_EXPIRED }));
    expect(sent.reject(NOW).status).toBe(QuoteStatus.REJECTED);
  });

  it('un borrador vencido no se muestra como EXPIRED: aún no se envió', () => {
    expect(draftQuote({ validUntil: YESTERDAY }).displayStatusOn(TODAY)).toBe(QuoteStatus.DRAFT);
  });

  it.each(['accept', 'reject'] as const)('%s exige una cotización enviada', (operation) => {
    const draft = draftQuote();

    expect(() => (operation === 'accept' ? draft.accept(NOW, TODAY) : draft.reject(NOW))).toThrow(
      expect.objectContaining({ code: ErrorCode.QUOTE_INVALID_TRANSITION }),
    );
  });

  it('una aceptada es definitiva: no se rechaza ni se revisa', () => {
    const accepted = draftQuote().markSent(NOW, TODAY).accept(NOW, TODAY);

    expect(() => accepted.reject(NOW)).toThrow(expect.objectContaining({ code: ErrorCode.QUOTE_INVALID_TRANSITION }));
    expect(() => accepted.revise('next-id', NOW)).toThrow(
      expect.objectContaining({ code: ErrorCode.QUOTE_INVALID_TRANSITION }),
    );
  });
});

describe('Quote: versiones (D-22, Q-018)', () => {
  it('revisar una enviada crea la versión siguiente en borrador con el mismo número y deja la anterior reemplazada', () => {
    const sent = draftQuote().markSent(NOW, TODAY);

    const { superseded, nextVersion } = sent.revise('next-id', NOW);

    expect(superseded.status).toBe(QuoteStatus.SUPERSEDED);
    expect(nextVersion).toMatchObject({
      id: 'next-id',
      number: 12,
      version: 2,
      status: QuoteStatus.DRAFT,
      previousVersionId: 'quote-id',
      sentAt: undefined,
    });
    expect(nextVersion.items).toHaveLength(1);
    expect(nextVersion.totals().total.toDecimalString()).toBe(sent.totals().total.toDecimalString());
  });

  it('también se revisa una rechazada', () => {
    const rejected = draftQuote().markSent(NOW, TODAY).reject(NOW);

    expect(rejected.revise('next-id', NOW).nextVersion.version).toBe(SECOND_POSITION);
  });

  it.each([
    ['un borrador (se edita)', () => draftQuote()],
    ['una ya reemplazada', () => draftQuote().markSent(NOW, TODAY).revise('a', NOW).superseded],
  ])('no se revisa %s', (_case, build) => {
    expect(() => build().revise('next-id', NOW)).toThrow(
      expect.objectContaining({ code: ErrorCode.QUOTE_INVALID_TRANSITION }),
    );
  });

  it('solo un borrador se borra', () => {
    expect(() => draftQuote().assertDeletable()).not.toThrow();
    expect(() => draftQuote().markSent(NOW, TODAY).assertDeletable()).toThrow(
      expect.objectContaining({ code: ErrorCode.QUOTE_NOT_EDITABLE }),
    );
  });
});

describe('fechas de calendario', () => {
  it.each([
    ['2026-11-17', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['26-11-17', false],
  ])('"%s" es una fecha válida: %s', (text, expected) => {
    expect(isCalendarDate(text)).toBe(expected);
  });

  it('hoy depende de la zona horaria de la empresa', () => {
    const instant = new Date('2026-11-18T03:00:00.000Z');

    expect(calendarDateIn('America/Bogota', instant)).toBe('2026-11-17');
    expect(calendarDateIn('UTC', instant)).toBe('2026-11-18');
    expect(calendarDateIn('Asia/Tokyo', instant)).toBe('2026-11-18');
  });

  it('lee la fecha guardada sin hora', () => {
    expect(calendarDateOfStoredDate(new Date('2026-12-15T00:00:00.000Z'))).toBe('2026-12-15');
  });
});
