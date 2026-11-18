import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  IPdfGenerator,
  PdfLogo,
  QuotePdfData,
  QuotePdfItem,
} from '../../../application/ports/services/IPdfGenerator.js';
import {
  formatCalendarDate,
  formatPercentage,
  formatPesos,
  formatQuantity,
} from '../../../application/formatting/colombianFormat.js';
import { toDrawableLines } from './pdfFormatting.js';

// F3-T06: PDF de una cotización con `pdf-lib`. Tamaño A4, fuente estándar Helvetica (sin archivos de fuentes), tabla
// de ítems que continúa en páginas nuevas y totales al final. Todo lo que se dibuja ya viene resuelto en `QuotePdfData`.

// Colores como hexadecimal `rrggbb`: pdf-lib los pide como proporción de 0 a 1.
const HEX_CHANNEL_PATTERN = /[0-9a-f]{2}/g;
const HEX_RADIX = 16;
const COLOR_CHANNEL_MAXIMUM = 255;

function colorFromHex(hex: string): ReturnType<typeof rgb> {
  const [red, green, blue] = (hex.match(HEX_CHANNEL_PATTERN) ?? []).map(
    (channel) => Number.parseInt(channel, HEX_RADIX) / COLOR_CHANNEL_MAXIMUM,
  );
  return rgb(red, green, blue);
}

const TEXT_COLOR = colorFromHex('1a1a1f');
const MUTED_COLOR = colorFromHex('666673');
const RULE_COLOR = colorFromHex('bfbfc7');
const HEADER_BACKGROUND = colorFromHex('ebedf2');

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;
const SIDE_MARGINS = MARGIN + MARGIN;
const CONTENT_WIDTH = A4_WIDTH - SIDE_MARGINS;
const FOOTER_HEIGHT = 34;
const BOTTOM_LIMIT = MARGIN + FOOTER_HEIGHT;

const BODY_SIZE = 9.5;
const SMALL_SIZE = 8;
const LABEL_SIZE = 8.5;
const COMPANY_SIZE = 15;
const TITLE_SIZE = 18;
const TOTAL_SIZE = 12;
const LINE_SPACING = 1.3;

const LOGO_MAXIMUM_WIDTH = 150;
const LOGO_MAXIMUM_HEIGHT = 60;
const HEADER_GAP = 14;
const SECTION_GAP = 14;
const LABEL_GAP = 4;
const LOGO_CAPTION_GAP = LABEL_GAP + LABEL_GAP;
const ROW_PADDING = 4;
const ROW_PADDING_TOTAL = ROW_PADDING + ROW_PADDING;
const CELL_PADDING = 4;
const CELL_PADDING_TOTAL = CELL_PADDING + CELL_PADDING;
const RULE_THICKNESS = 0.6;
const HEADER_COLUMN_WIDTH = 220;
const LABEL_LINES_KEPT_TOGETHER = 2;
const HALF_DIVISOR = 2;
const MINIMUM_WORD_PIECE = 1;

type TextAlignment = 'left' | 'right';

interface TableColumn {
  title: string;
  width: number;
  align: TextAlignment;
}

// Columnas de la tabla de ítems; la descripción absorbe el ancho que dejan las demás.
const POSITION_COLUMN: TableColumn = { title: '#', width: 22, align: 'left' };
const QUANTITY_COLUMN: TableColumn = { title: 'Cant.', width: 46, align: 'right' };
const UNIT_PRICE_COLUMN: TableColumn = { title: 'Precio unit.', width: 82, align: 'right' };
const DISCOUNT_COLUMN: TableColumn = { title: 'Desc.', width: 44, align: 'right' };
const TAX_COLUMN: TableColumn = { title: 'IVA', width: 40, align: 'right' };
const TOTAL_COLUMN: TableColumn = { title: 'Total', width: 92, align: 'right' };
const DESCRIPTION_COLUMN: TableColumn = {
  title: 'Descripción',
  align: 'left',
  width:
    CONTENT_WIDTH -
    POSITION_COLUMN.width -
    QUANTITY_COLUMN.width -
    UNIT_PRICE_COLUMN.width -
    DISCOUNT_COLUMN.width -
    TAX_COLUMN.width -
    TOTAL_COLUMN.width,
};
const TABLE_COLUMNS: readonly TableColumn[] = [
  POSITION_COLUMN,
  DESCRIPTION_COLUMN,
  QUANTITY_COLUMN,
  UNIT_PRICE_COLUMN,
  DISCOUNT_COLUMN,
  TAX_COLUMN,
  TOTAL_COLUMN,
];

const TOTALS_WIDTH = 230;
const ZERO_AMOUNT = '0.00';

interface DrawTextOptions {
  font: PDFFont;
  size: number;
  color?: ReturnType<typeof rgb>;
  align?: TextAlignment;
}

/** Cursor de dibujo: la página actual y la altura (y) donde se escribe a continuación. */
class QuotePdfLayout {
  private page: PDFPage;
  y: number;
  private readonly supportedCodePoints: ReadonlySet<number>;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.supportedCodePoints = new Set(regular.getCharacterSet());
    this.page = this.pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - MARGIN;
  }

  get currentPage(): PDFPage {
    return this.page;
  }

  get boldFont(): PDFFont {
    return this.bold;
  }

  get regularFont(): PDFFont {
    return this.regular;
  }

  lines(text: string): string[] {
    return toDrawableLines(text, (codePoint) => this.supportedCodePoints.has(codePoint));
  }

  private addPage(): void {
    this.page = this.pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - MARGIN;
  }

  /** Pasa a una página nueva si no cabe `height` más; devuelve si cambió de página. */
  ensureSpace(height: number): boolean {
    if (this.y - height >= BOTTOM_LIMIT) return false;
    this.addPage();
    return true;
  }

  private widthOf(text: string, font: PDFFont, size: number): number {
    return font.widthOfTextAtSize(text, size);
  }

  /** Cuántos caracteres de `word` caben en `maximumWidth` (al menos uno, para avanzar siempre). Búsqueda binaria. */
  private fittingLength(word: string, font: PDFFont, size: number, maximumWidth: number): number {
    let low = MINIMUM_WORD_PIECE;
    let high = word.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / HALF_DIVISOR);
      if (this.widthOf(word.slice(0, middle), font, size) <= maximumWidth) low = middle;
      else high = middle - MINIMUM_WORD_PIECE;
    }
    return low;
  }

  /** Corta una palabra más ancha que `maximumWidth` en trozos que sí caben. */
  private breakWord(word: string, font: PDFFont, size: number, maximumWidth: number): string[] {
    const pieces: string[] = [];
    let remainder = word;
    while (this.widthOf(remainder, font, size) > maximumWidth && remainder.length > MINIMUM_WORD_PIECE) {
      const cut = this.fittingLength(remainder, font, size, maximumWidth);
      pieces.push(remainder.slice(0, cut));
      remainder = remainder.slice(cut);
    }
    pieces.push(remainder);
    return pieces;
  }

  /** Parte una línea en renglones que caben en `maximumWidth`. */
  private wrap(line: string, font: PDFFont, size: number, maximumWidth: number): string[] {
    const rows: string[] = [];
    let current = '';
    for (const word of line.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (this.widthOf(candidate, font, size) <= maximumWidth) {
        current = candidate;
        continue;
      }
      if (current) rows.push(current);
      const pieces = this.breakWord(word, font, size, maximumWidth);
      current = pieces.pop() ?? '';
      rows.push(...pieces);
    }
    rows.push(current);
    return rows;
  }

  /** Renglones de un texto envuelto al ancho dado, respetando sus saltos de línea. */
  wrappedRows(text: string, font: PDFFont, size: number, maximumWidth: number): string[] {
    return this.lines(text).flatMap((line) => this.wrap(line, font, size, maximumWidth));
  }

  drawText(text: string, x: number, y: number, options: DrawTextOptions, width = 0): void {
    const { font, size, color = TEXT_COLOR, align = 'left' } = options;
    const left = align === 'right' ? x + width - this.widthOf(text, font, size) : x;
    this.page.drawText(text, { x: left, y, font, size, color });
  }

  rule(y: number, x = MARGIN, width = CONTENT_WIDTH): void {
    this.page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: RULE_THICKNESS, color: RULE_COLOR });
  }

  /** Párrafo que puede continuar en páginas nuevas; deja `y` bajo su última línea. */
  paragraph(text: string, options: DrawTextOptions, x = MARGIN, maximumWidth = CONTENT_WIDTH): void {
    const lineHeight = options.size * LINE_SPACING;
    for (const row of this.wrappedRows(text, options.font, options.size, maximumWidth)) {
      this.ensureSpace(lineHeight);
      this.y -= options.size;
      this.drawText(row, x, this.y, options);
      this.y -= lineHeight - options.size;
    }
  }

  /** Título de sección en mayúsculas; se mantiene junto a lo que le sigue. */
  label(text: string): void {
    this.ensureSpace(LABEL_SIZE * LINE_SPACING * LABEL_LINES_KEPT_TOGETHER);
    this.paragraph(text.toUpperCase(), { font: this.bold, size: LABEL_SIZE, color: MUTED_COLOR });
    this.y -= LABEL_GAP;
  }
}

async function embedLogo(pdf: PDFDocument, logo: PdfLogo | undefined): Promise<PDFImage | undefined> {
  if (!logo) return undefined;
  try {
    return logo.format === 'png' ? await pdf.embedPng(logo.content) : await pdf.embedJpg(logo.content);
  } catch {
    // Un logo que el PDF no pueda leer no debe impedir enviar la cotización: se omite.
    return undefined;
  }
}

function drawHeader(layout: QuotePdfLayout, data: QuotePdfData, logo: PDFImage | undefined): void {
  const top = layout.y;
  const leftWidth = CONTENT_WIDTH - HEADER_COLUMN_WIDTH - HEADER_GAP;

  if (logo) {
    const scale = Math.min(LOGO_MAXIMUM_WIDTH / logo.width, LOGO_MAXIMUM_HEIGHT / logo.height, 1);
    const { width, height } = logo.scale(scale);
    layout.currentPage.drawImage(logo, { x: MARGIN, y: top - height, width, height });
    layout.y = top - height - LOGO_CAPTION_GAP;
  }
  layout.paragraph(data.companyName, { font: layout.boldFont, size: COMPANY_SIZE }, MARGIN, leftWidth);
  const leftEnd = layout.y;

  const rightX = A4_WIDTH - MARGIN - HEADER_COLUMN_WIDTH;
  const rightLines: Array<{ text: string; options: DrawTextOptions }> = [
    { text: 'COTIZACIÓN', options: { font: layout.boldFont, size: TITLE_SIZE, align: 'right' } },
    { text: data.reference, options: { font: layout.boldFont, size: TOTAL_SIZE, align: 'right' } },
    { text: data.statusLabel, options: { font: layout.boldFont, size: BODY_SIZE, color: MUTED_COLOR, align: 'right' } },
    {
      text: `Emitida: ${formatCalendarDate(data.issuedOn)}`,
      options: { font: layout.regularFont, size: BODY_SIZE, align: 'right' },
    },
    {
      text: `Válida hasta: ${formatCalendarDate(data.validUntil)}`,
      options: { font: layout.regularFont, size: BODY_SIZE, align: 'right' },
    },
  ];
  let rightY = top;
  for (const { text, options } of rightLines) {
    rightY -= options.size;
    layout.lines(text).forEach((drawable) => layout.drawText(drawable, rightX, rightY, options, HEADER_COLUMN_WIDTH));
    rightY -= options.size * (LINE_SPACING - 1) + LABEL_GAP;
  }

  layout.y = Math.min(leftEnd, rightY) - SECTION_GAP;
  layout.rule(layout.y);
  layout.y -= SECTION_GAP;
}

function drawCustomer(layout: QuotePdfLayout, customerLines: readonly string[]): void {
  if (customerLines.length === 0) return;
  layout.label('Cliente');
  customerLines.forEach((line, index) => {
    layout.paragraph(line, { font: index === 0 ? layout.boldFont : layout.regularFont, size: BODY_SIZE });
  });
  layout.y -= SECTION_GAP;
}

function drawTableHeader(layout: QuotePdfLayout): void {
  const height = LABEL_SIZE * LINE_SPACING + ROW_PADDING_TOTAL;
  layout.ensureSpace(height);
  layout.currentPage.drawRectangle({
    x: MARGIN,
    y: layout.y - height,
    width: CONTENT_WIDTH,
    height,
    color: HEADER_BACKGROUND,
  });
  let x = MARGIN;
  for (const column of TABLE_COLUMNS) {
    layout.drawText(
      column.title,
      x + CELL_PADDING,
      layout.y - ROW_PADDING - LABEL_SIZE,
      { font: layout.boldFont, size: LABEL_SIZE, align: column.align },
      column.width - CELL_PADDING_TOTAL,
    );
    x += column.width;
  }
  layout.y -= height;
}

/** Cada celda de la fila con su columna. */
function itemCells(item: QuotePdfItem): Array<{ column: TableColumn; text: string }> {
  return [
    { column: POSITION_COLUMN, text: String(item.position) },
    { column: DESCRIPTION_COLUMN, text: item.description },
    { column: QUANTITY_COLUMN, text: formatQuantity(item.quantity) },
    { column: UNIT_PRICE_COLUMN, text: formatPesos(item.unitPrice) },
    { column: DISCOUNT_COLUMN, text: item.discountRate === ZERO_AMOUNT ? '-' : formatPercentage(item.discountRate) },
    { column: TAX_COLUMN, text: formatPercentage(item.taxRate) },
    { column: TOTAL_COLUMN, text: formatPesos(item.total) },
  ];
}

function drawItemRow(layout: QuotePdfLayout, item: QuotePdfItem): void {
  const cells = itemCells(item).map(({ column, text }) => ({
    column,
    rows: layout.wrappedRows(text, layout.regularFont, BODY_SIZE, column.width - CELL_PADDING_TOTAL),
  }));
  const lineHeight = BODY_SIZE * LINE_SPACING;
  const height = Math.max(...cells.map(({ rows }) => rows.length)) * lineHeight + ROW_PADDING_TOTAL;

  // La fila nunca se parte entre páginas; la cabecera de la tabla se repite en la nueva.
  if (layout.ensureSpace(height)) drawTableHeader(layout);

  let x = MARGIN;
  for (const { column, rows } of cells) {
    rows.forEach((row, rowIndex) => {
      layout.drawText(
        row,
        x + CELL_PADDING,
        layout.y - ROW_PADDING - BODY_SIZE - rowIndex * lineHeight,
        { font: layout.regularFont, size: BODY_SIZE, align: column.align },
        column.width - CELL_PADDING_TOTAL,
      );
    });
    x += column.width;
  }
  layout.y -= height;
  layout.rule(layout.y);
}

function drawTotals(layout: QuotePdfLayout, data: QuotePdfData): void {
  const discountLabel =
    data.discountRate === ZERO_AMOUNT ? 'Descuentos' : `Descuentos (global ${formatPercentage(data.discountRate)})`;
  const rows: Array<{ label: string; value: string; isTotal: boolean }> = [
    { label: 'Subtotal', value: formatPesos(data.subtotal), isTotal: false },
    ...(data.discountTotal === ZERO_AMOUNT
      ? []
      : [{ label: discountLabel, value: `-${formatPesos(data.discountTotal)}`, isTotal: false }]),
    { label: 'IVA', value: formatPesos(data.taxTotal), isTotal: false },
    { label: 'TOTAL (COP)', value: formatPesos(data.total), isTotal: true },
  ];
  const lineHeight = TOTAL_SIZE * LINE_SPACING + ROW_PADDING;
  layout.y -= SECTION_GAP;
  // El bloque de totales va junto: si no cabe, pasa entero a la página siguiente.
  layout.ensureSpace(rows.length * lineHeight + SECTION_GAP);

  const x = A4_WIDTH - MARGIN - TOTALS_WIDTH;
  for (const row of rows) {
    const font = row.isTotal ? layout.boldFont : layout.regularFont;
    const size = row.isTotal ? TOTAL_SIZE : BODY_SIZE;
    if (row.isTotal) layout.rule(layout.y, x, TOTALS_WIDTH);
    layout.y -= lineHeight;
    layout.lines(row.label).forEach((label) => layout.drawText(label, x, layout.y + ROW_PADDING, { font, size }));
    layout.drawText(row.value, x, layout.y + ROW_PADDING, { font, size, align: 'right' }, TOTALS_WIDTH);
  }
  layout.y -= SECTION_GAP;
}

function drawTextSection(layout: QuotePdfLayout, title: string, paragraphs: readonly string[]): void {
  if (paragraphs.length === 0) return;
  layout.label(title);
  for (const paragraph of paragraphs) layout.paragraph(paragraph, { font: layout.regularFont, size: BODY_SIZE });
  layout.y -= SECTION_GAP;
}

function drawFooters(pdf: PDFDocument, data: QuotePdfData, regular: PDFFont, layout: QuotePdfLayout): void {
  const pages = pdf.getPages();
  const company = layout.lines(`${data.companyName} · ${data.reference}`).join(' ');
  pages.forEach((page, index) => {
    const y = MARGIN - SMALL_SIZE;
    page.drawLine({
      start: { x: MARGIN, y: y + SMALL_SIZE + LABEL_GAP },
      end: { x: A4_WIDTH - MARGIN, y: y + SMALL_SIZE + LABEL_GAP },
      thickness: RULE_THICKNESS,
      color: RULE_COLOR,
    });
    page.drawText(company, { x: MARGIN, y, font: regular, size: SMALL_SIZE, color: MUTED_COLOR });
    const pageText = `Página ${index + 1} de ${pages.length}`;
    const pageTextWidth = regular.widthOfTextAtSize(pageText, SMALL_SIZE);
    page.drawText(pageText, {
      x: A4_WIDTH - MARGIN - pageTextWidth,
      y,
      font: regular,
      size: SMALL_SIZE,
      color: MUTED_COLOR,
    });
  });
}

/** Adaptador de `IPdfGenerator` sobre `pdf-lib` (F3-T06). */
export class PdfLibQuoteGenerator implements IPdfGenerator {
  async generateQuotePdf(data: QuotePdfData): Promise<Uint8Array> {
    // Sin `updateMetadata`, pdf-lib pisaría el productor y la fecha que se fijan aquí al guardar.
    const pdf = await PDFDocument.create({ updateMetadata: false });
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const layout = new QuotePdfLayout(pdf, regular, bold);

    pdf.setTitle(`Cotización ${data.reference}`);
    pdf.setCreator('QuotesFlow');
    pdf.setProducer('QuotesFlow');
    pdf.setCreationDate(new Date());
    pdf.setModificationDate(new Date());

    const logo = await embedLogo(pdf, data.logo);
    drawHeader(layout, data, logo);
    drawCustomer(layout, data.customerLines);
    drawTableHeader(layout);
    for (const item of data.items) drawItemRow(layout, item);
    drawTotals(layout, data);
    drawTextSection(layout, 'Notas', data.notes ? [data.notes] : []);
    drawTextSection(layout, 'Condiciones', data.conditions);
    drawFooters(pdf, data, regular, layout);

    return pdf.save();
  }
}
