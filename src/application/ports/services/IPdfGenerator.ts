/** Logo de la empresa listo para incrustar en el PDF (F3-T06). Solo los formatos que el PDF admite. */
export interface PdfLogo {
  content: Uint8Array;
  format: 'png' | 'jpeg';
}

/** Una fila de la tabla de ítems. Los importes y porcentajes llegan como texto decimal (F3-T01), ya exactos. */
export interface QuotePdfItem {
  position: number;
  description: string;
  quantity: number;
  /** Precio unitario antes de IVA y descuentos, `"150000.00"`. */
  unitPrice: string;
  /** Descuento del ítem, `"5.00"`. */
  discountRate: string;
  /** IVA del ítem, `"19.00"`. */
  taxRate: string;
  /** Importe del ítem con descuentos e IVA. */
  total: string;
}

/**
 * Todo lo que lleva el PDF de una cotización. Son datos ya resueltos, sin lógica de negocio: el generador solo
 * los dibuja. Los importes son pesos colombianos (D-21).
 */
export interface QuotePdfData {
  companyName: string;
  logo?: PdfLogo;
  /** `COT-000123` o `COT-000123 v2`. */
  reference: string;
  /** Texto que se muestra junto al número: `BORRADOR`, `ENVIADA`, `VENCIDA`… */
  statusLabel: string;
  /** Fecha de emisión (`AAAA-MM-DD`, en la zona horaria de la empresa). */
  issuedOn: string;
  /** Último día de vigencia (`AAAA-MM-DD`). */
  validUntil: string;
  /** Líneas del bloque "Cliente": nombre, documento, correo, teléfono… */
  customerLines: string[];
  items: QuotePdfItem[];
  /** Descuento global de la cotización, `"5.00"`. */
  discountRate: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  notes?: string;
  /** Condiciones comerciales, una por línea. */
  conditions: string[];
}

/**
 * Generador de PDF (F3-T06). El adaptador usa `pdf-lib`; el caso de uso solo conoce este puerto.
 */
export interface IPdfGenerator {
  /** El PDF de una cotización, como bytes. */
  generateQuotePdf(data: QuotePdfData): Promise<Uint8Array>;
}
