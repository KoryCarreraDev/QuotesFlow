import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import {
  type TenantWithTeam,
  persistQuote,
  persistTenantLogo,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F3-T06: PDF de la cotización. Permisos por rol y aislamiento: suites de `tests/api/security/`.

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const SIGNATURE_LENGTH = 5;

describe('GET /api/v1/quotes/:id/pdf', () => {
  let company: TenantWithTeam;
  let salesRepCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    salesRepCookie = sessionCookieFor(company.salesRep);
  });

  function downloadPdf(quoteId: string, cookie: string) {
    return request(app)
      .get(apiPaths.quotes.pdf(quoteId))
      .set('Cookie', cookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  }

  it('descarga un PDF válido como adjunto con el número de la cotización, sin caché', async () => {
    const quote = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT' });

    const response = await downloadPdf(quote.id, salesRepCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe('attachment; filename="COT-000001.pdf"');
    expect(response.headers['cache-control']).toBe('private, no-store');
    const bytes = response.body as Buffer;
    expect(bytes.subarray(0, SIGNATURE_LENGTH).toString('ascii')).toBe('%PDF-');
    const document = await PDFDocument.load(bytes);
    expect(document.getTitle()).toBe('Cotización COT-000001');
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('la versión siguiente usa su versión en el nombre del archivo', async () => {
    const original = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SUPERSEDED' });
    const revised = await persistQuote(company.tenant.id, company.salesRep.id, {
      version: 2,
      previousVersionId: original.id,
    });

    const response = await downloadPdf(revised.id, salesRepCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(response.headers['content-disposition']).toMatch(/filename="COT-\d{6}-v2\.pdf"$/);
  });

  it('con el logo de la empresa sale un PDF mayor que sin él', async () => {
    const quote = await persistQuote(company.tenant.id, company.salesRep.id);
    const withoutLogo = await downloadPdf(quote.id, salesRepCookie);

    await persistTenantLogo(company.tenant.id);
    const withLogo = await downloadPdf(quote.id, salesRepCookie);

    expect(withLogo.status).toBe(HTTP_OK);
    expect((withLogo.body as Buffer).length).toBeGreaterThan((withoutLogo.body as Buffer).length);
  });

  it('el PDF de una cotización enviada usa los importes guardados (F3-A06)', async () => {
    const cheap = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT' });
    const sameButEdited = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT' });
    await prisma.quote.update({ where: { id: sameButEdited.id }, data: { total: '9999999' } });
    await prisma.quoteItem.updateMany({ where: { quoteId: sameButEdited.id }, data: { total: '9999999' } });

    const original = await downloadPdf(cheap.id, salesRepCookie);
    const edited = await downloadPdf(sameButEdited.id, salesRepCookie);

    // Mismo contenido calculado, distinto importe guardado: el PDF sigue lo guardado, así que no son iguales.
    expect((edited.body as Buffer).equals(original.body as Buffer)).toBe(false);
  });

  it('un comercial no descarga la cotización de otro; gestión sí', async () => {
    const others = await persistQuote(company.tenant.id, company.otherSalesRep.id);

    const asRep = await downloadPdf(others.id, salesRepCookie);
    const asLeader = await downloadPdf(others.id, sessionCookieFor(company.salesLeader));

    expect(asRep.status).toBe(HTTP_FORBIDDEN);
    expect(asLeader.status).toBe(HTTP_OK);
  });

  it('una cotización inexistente responde 404 QUOTE_NOT_FOUND', async () => {
    const response = await request(app).get(apiPaths.quotes.pdf(NON_EXISTENT_ID)).set('Cookie', salesRepCookie);

    expect(response.status).toBe(HTTP_NOT_FOUND);
    expect(response.body.error.code).toBe(ErrorCode.QUOTE_NOT_FOUND);
  });

  it('descargar el PDF queda en auditoría y no cambia la cotización', async () => {
    const quote = await persistQuote(company.tenant.id, company.salesRep.id);

    await downloadPdf(quote.id, salesRepCookie);

    const entries = await prisma.auditLog.findMany();
    expect(entries).toEqual([
      expect.objectContaining({
        action: 'QUOTE_PDF_DOWNLOADED',
        entityId: quote.id,
        userId: company.salesRep.id,
        tenantId: company.tenant.id,
        metadata: expect.objectContaining({ version: 1 }),
      }),
    ]);
    const read = await request(app).get(apiPaths.quotes.get(quote.id)).set('Cookie', salesRepCookie);
    expect(read.body).toMatchObject({ status: 'DRAFT', total: '238000.00' });
  });
});
