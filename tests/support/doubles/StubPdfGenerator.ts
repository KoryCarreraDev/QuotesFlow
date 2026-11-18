import { IPdfGenerator, QuotePdfData } from '@/application/ports/services/IPdfGenerator.js';

/** Doble de `IPdfGenerator`: devuelve unos bytes fijos y guarda los datos que recibió. */
export class StubPdfGenerator implements IPdfGenerator {
  received: QuotePdfData | undefined;

  async generateQuotePdf(data: QuotePdfData): Promise<Uint8Array> {
    this.received = data;
    return Buffer.from(`%PDF-stub ${data.reference} ${data.statusLabel}`);
  }
}
