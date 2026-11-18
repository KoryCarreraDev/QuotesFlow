import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { QuotePdfData, QuotePdfItem } from '@/application/ports/services/IPdfGenerator.js';
import { PdfLibQuoteGenerator } from '@/infrastructure/services/pdf/PdfLibQuoteGenerator.js';
import {
  formatCalendarDate,
  formatPercentage,
  formatPesos,
  formatQuantity,
  toDrawableLines,
} from '@/infrastructure/services/pdf/pdfFormatting.js';
import { buildJpeg } from '@tests/support/builders/imageFixtures.js';
import { TEST_LOGO_PNG } from '@tests/support/database/persistenceFactories.js';

// F3-T06: PDF de una cotización. El dibujo se comprueba por estructura (páginas, que no falle con texto raro);
// el formato de los números, aparte y con valores exactos.

const MANY_ITEMS = 60;
const LONG_TEXT_REPEATS = 40;
const SIGNATURE_LENGTH = 5;
const LOGO_WIDTH = 100;
const LOGO_HEIGHT = 40;
const ONE_AND_A_HALF_MILLION = 1_500_000;
const SINGLE_DIGIT_QUANTITY = 7;
const FIRST_PRINTABLE_CODE_POINT = 0x20;
const DELETE_CODE_POINT = 0x7f;

function item(position: number, overrides: Partial<QuotePdfItem> = {}): QuotePdfItem {
  return {
    position,
    description: `Producto ${position}`,
    quantity: 2,
    unitPrice: '450000.00',
    discountRate: '0.00',
    taxRate: '19.00',
    total: '1071000.00',
    ...overrides,
  };
}

function quoteData(overrides: Partial<QuotePdfData> = {}): QuotePdfData {
  return {
    companyName: 'Aluminios Andinos SAS',
    reference: 'COT-000123',
    statusLabel: 'ENVIADA',
    issuedOn: '2026-11-18',
    validUntil: '2026-12-18',
    customerLines: ['Constructora El Roble', 'NIT 900123456', 'compras@elroble.example'],
    items: [item(1)],
    discountRate: '0.00',
    subtotal: '900000.00',
    discountTotal: '0.00',
    taxTotal: '171000.00',
    total: '1071000.00',
    conditions: ['Valores en pesos colombianos (COP).'],
    ...overrides,
  };
}

async function pageCountOf(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

const generator = new PdfLibQuoteGenerator();

describe('PdfLibQuoteGenerator', () => {
  it('genera un PDF válido de una página con título y metadatos', async () => {
    const bytes = await generator.generateQuotePdf(quoteData());

    expect(Buffer.from(bytes.subarray(0, SIGNATURE_LENGTH)).toString('ascii')).toBe('%PDF-');
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe('Cotización COT-000123');
    expect(document.getProducer()).toBe('QuotesFlow');
  });

  it('con muchos ítems continúa en más páginas', async () => {
    const items = Array.from({ length: MANY_ITEMS }, (_, index) => item(index + 1));

    const bytes = await generator.generateQuotePdf(quoteData({ items }));

    expect(await pageCountOf(bytes)).toBeGreaterThan(1);
  });

  it('incrusta un logo PNG o JPEG, y un logo ilegible se omite sin fallar', async () => {
    const withPng = await generator.generateQuotePdf(quoteData({ logo: { content: TEST_LOGO_PNG, format: 'png' } }));
    const withJpeg = await generator.generateQuotePdf(
      quoteData({ logo: { content: buildJpeg(LOGO_WIDTH, LOGO_HEIGHT), format: 'jpeg' } }),
    );
    const withBrokenLogo = await generator.generateQuotePdf(
      quoteData({ logo: { content: Buffer.from('no es una imagen'), format: 'png' } }),
    );
    const withoutLogo = await generator.generateQuotePdf(quoteData());

    for (const bytes of [withPng, withJpeg, withBrokenLogo]) expect(await pageCountOf(bytes)).toBe(1);
    expect(withPng.length).toBeGreaterThan(withoutLogo.length);
    expect(withBrokenLogo.length).toBe(withoutLogo.length);
  });

  it('no falla con tildes, ñ, emojis, caracteres de control ni saltos de línea', async () => {
    const hostile = 'Ñandú áéíóú ¿qué? ¡ya! Ω 😀 \u0000\u0007 tab\tfin\nsegunda línea\r\ntercera';

    const bytes = await generator.generateQuotePdf(
      quoteData({
        companyName: hostile,
        customerLines: [hostile],
        notes: hostile,
        conditions: [hostile],
        items: [item(1, { description: hostile })],
      }),
    );

    expect(await pageCountOf(bytes)).toBe(1);
  });

  it('corta una palabra más ancha que su columna y un texto muy largo no se sale de la página', async () => {
    const unbroken = 'x'.repeat(LONG_TEXT_REPEATS * LONG_TEXT_REPEATS);
    const longParagraph = 'Texto de condiciones muy largo. '.repeat(LONG_TEXT_REPEATS * LONG_TEXT_REPEATS);

    const bytes = await generator.generateQuotePdf(
      quoteData({
        items: [item(1, { description: unbroken })],
        notes: longParagraph,
        conditions: [unbroken],
        customerLines: [unbroken],
      }),
    );

    expect(await pageCountOf(bytes)).toBeGreaterThan(1);
  });

  it('con descuentos, cliente y notas vacíos genera igualmente', async () => {
    const withEverything = await generator.generateQuotePdf(
      quoteData({ discountRate: '5.00', discountTotal: '45000.00', notes: 'Entrega en obra' }),
    );
    const withNothing = await generator.generateQuotePdf(
      quoteData({ customerLines: [], conditions: [], notes: undefined }),
    );

    expect(await pageCountOf(withEverything)).toBe(1);
    expect(await pageCountOf(withNothing)).toBe(1);
    expect(withEverything.length).toBeGreaterThan(withNothing.length);
  });
});

describe('formato del PDF', () => {
  it.each([
    ['1234567.5', '$ 1.234.567,50'],
    ['0', '$ 0,00'],
    ['999.99', '$ 999,99'],
    ['1000', '$ 1.000,00'],
    ['98765432109876.54', '$ 98.765.432.109.876,54'],
    ['-45000.00', '-$ 45.000,00'],
  ])('importe %s → %s', (decimalText, expected) => {
    expect(formatPesos(decimalText)).toBe(expected);
  });

  it.each([
    ['19.00', '19 %'],
    ['12.50', '12,5 %'],
    ['0.00', '0 %'],
    ['7.25', '7,25 %'],
    ['100', '100 %'],
  ])('porcentaje %s → %s', (decimalText, expected) => {
    expect(formatPercentage(decimalText)).toBe(expected);
  });

  it('cantidades con separador de miles y fechas como día/mes/año', () => {
    expect(formatQuantity(ONE_AND_A_HALF_MILLION)).toBe('1.500.000');
    expect(formatQuantity(SINGLE_DIGIT_QUANTITY)).toBe('7');
    expect(formatCalendarDate('2026-12-31')).toBe('31/12/2026');
    expect(formatCalendarDate('no-es-fecha')).toBe('no-es-fecha');
  });

  it('cambia por ? lo que la fuente no codifica y separa las líneas', () => {
    const supported = (codePoint: number) => codePoint >= FIRST_PRINTABLE_CODE_POINT && codePoint < DELETE_CODE_POINT;

    expect(toDrawableLines('ab\u0000c\td\r\nñ', supported)).toEqual(['ab?c    d', '?']);
  });
});
