import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { memoryEmailOutbox } from '@/infrastructure/email/LocalEmailServices.js';
import {
  type TenantWithTeam,
  persistContact,
  persistQuote,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F3-T08: enviar la cotización por correo con el PDF adjunto (D-57: solo si la empresa activó el correo).

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const CUSTOMER_EMAIL = 'laura.cliente@example.com';
const PDF_SIGNATURE = '%PDF-';

describe('POST /api/v1/quotes/:id/send con el canal de correo', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;
  let salesRepCookie: string;

  beforeEach(async () => {
    memoryEmailOutbox.clear();
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
    salesRepCookie = sessionCookieFor(company.salesRep);
  });

  async function enableEmail() {
    await request(app).patch(apiPaths.tenant.profile).set('Cookie', ownerCookie).send({ emailDeliveryEnabled: true });
  }

  async function draftFor(contactEmail: string) {
    const contact = await persistContact(company.tenant.id, { ownerId: company.salesRep.id, email: contactEmail });
    return persistQuote(company.tenant.id, company.salesRep.id, { contactId: contact.id });
  }

  function send(quoteId: string, body?: Record<string, unknown>) {
    const call = request(app).post(apiPaths.quotes.send(quoteId)).set('Cookie', salesRepCookie);
    return body ? call.send(body) : call;
  }

  it('con el correo desactivado (por defecto) solo cambia el estado y no sale ningún correo', async () => {
    const quote = await draftFor(CUSTOMER_EMAIL);

    const response = await send(quote.id);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toMatchObject({ status: 'SENT', emailed: false });
    expect(memoryEmailOutbox.sentTo(CUSTOMER_EMAIL)).toEqual([]);
  });

  it('con el correo activo envía al cliente el PDF adjunto, deja el estado en SENT y registra el envío', async () => {
    await enableEmail();
    const quote = await draftFor(CUSTOMER_EMAIL);

    const response = await send(quote.id);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toMatchObject({ status: 'SENT', emailed: true });
    const [email] = memoryEmailOutbox.sentTo(CUSTOMER_EMAIL);
    expect(email.subject).toContain('COT-000001');
    expect(email.attachments?.[0]).toMatchObject({ fileName: 'COT-000001.pdf', contentType: 'application/pdf' });
    expect(
      Buffer.from(email.attachments?.[0].content ?? [])
        .subarray(0, PDF_SIGNATURE.length)
        .toString(),
    ).toBe(PDF_SIGNATURE);
    const logs = await prisma.emailLog.findMany({ where: { template: 'QUOTE_SENT' } });
    expect(logs).toEqual([
      expect.objectContaining({
        tenantId: company.tenant.id,
        userId: company.salesRep.id,
        recipient: CUSTOMER_EMAIL,
        status: 'SENT',
      }),
    ]);
    const audit = await prisma.auditLog.findMany({ where: { action: 'QUOTE_SENT' } });
    expect(audit[0].metadata).toMatchObject({ emailed: true });
    expect(JSON.stringify(audit)).not.toContain(CUSTOMER_EMAIL);
  });

  it('recipientEmail manda sobre el correo del cliente; uno inválido responde 400 sin enviar nada', async () => {
    await enableEmail();
    const quote = await draftFor(CUSTOMER_EMAIL);

    const invalid = await send(quote.id, { recipientEmail: 'no-es-un-correo' });
    const valid = await send(quote.id, { recipientEmail: 'compras@example.com' });

    expect(invalid.status).toBe(HTTP_BAD_REQUEST);
    expect(valid.status).toBe(HTTP_OK);
    expect(memoryEmailOutbox.sentTo('compras@example.com')).toHaveLength(1);
    expect(memoryEmailOutbox.sentTo(CUSTOMER_EMAIL)).toEqual([]);
  });

  it('sin correo del cliente ni recipientEmail responde 400 y la cotización sigue en borrador', async () => {
    await enableEmail();
    const quote = await draftFor('');

    const response = await send(quote.id);

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe(ErrorCode.QUOTE_RECIPIENT_REQUIRED);
    await expect(prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).resolves.toMatchObject({
      status: 'DRAFT',
    });
  });
});
