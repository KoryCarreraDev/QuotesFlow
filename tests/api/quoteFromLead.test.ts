import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import {
  type TenantWithTeam,
  persistLead,
  persistQuote,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F3-T09: cotización desde un lead y lead ganado al aceptar. Permisos por rol y aislamiento de la ruta:
// suites de `tests/api/security/`.

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

const quoteBody = {
  items: [{ description: 'Instalación', quantity: 2, unitPrice: '100000', taxRate: '19' }],
};

describe('Cotización desde un lead', () => {
  let company: TenantWithTeam;
  let salesRepCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    salesRepCookie = sessionCookieFor(company.salesRep);
  });

  function createFromLead(leadId: string, cookie: string, body: Record<string, unknown> = quoteBody) {
    return request(app).post(apiPaths.leads.createQuote(leadId)).set('Cookie', cookie).send(body);
  }

  async function leadOf(userId: string | undefined) {
    return persistLead(company.tenant.id, { statusId: company.defaultLeadStatus.id, assignedToId: userId });
  }

  describe('POST /api/v1/leads/:id/quotes', () => {
    it('crea el borrador con el lead como cliente, a nombre de quien lo crea', async () => {
      const lead = await leadOf(company.salesRep.id);

      const response = await createFromLead(lead.id, salesRepCookie);

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body).toMatchObject({
        leadId: lead.id,
        status: 'DRAFT',
        reference: 'COT-000001',
        createdById: company.salesRep.id,
        total: '238000.00',
      });
      const stored = await prisma.quote.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(stored).toMatchObject({ leadId: lead.id, tenantId: company.tenant.id });
    });

    it('el lead de la ruta manda sobre un leadId del cuerpo', async () => {
      const lead = await leadOf(company.salesRep.id);
      const otherLead = await leadOf(company.salesRep.id);

      const response = await createFromLead(lead.id, salesRepCookie, { ...quoteBody, leadId: otherLead.id });

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body.leadId).toBe(lead.id);
    });

    it('un comercial no cotiza el lead de otro ni uno sin responsable; gestión sí', async () => {
      const othersLead = await leadOf(company.otherSalesRep.id);
      const unassignedLead = await leadOf(undefined);

      const others = await createFromLead(othersLead.id, salesRepCookie);
      const unassigned = await createFromLead(unassignedLead.id, salesRepCookie);
      const asLeader = await createFromLead(othersLead.id, sessionCookieFor(company.salesLeader));

      expect([others.status, unassigned.status, asLeader.status]).toEqual([
        HTTP_FORBIDDEN,
        HTTP_FORBIDDEN,
        HTTP_CREATED,
      ]);
      await expect(prisma.quote.count()).resolves.toBe(1);
    });

    it('un lead inexistente es 404 LEAD_NOT_FOUND; un cuerpo inválido es 400', async () => {
      const lead = await leadOf(company.salesRep.id);

      const missing = await createFromLead(NON_EXISTENT_ID, salesRepCookie);
      const invalid = await createFromLead(lead.id, salesRepCookie, { items: [] });

      expect(missing.status).toBe(HTTP_NOT_FOUND);
      expect(missing.body.error.code).toBe(ErrorCode.LEAD_NOT_FOUND);
      expect(invalid.status).toBe(HTTP_BAD_REQUEST);
    });
  });

  describe('POST /api/v1/quotes/:id/accept con markLeadAsWon', () => {
    const wonStatus = () => company.leadStatuses.find((status) => status.type === 'WON')!;

    function accept(quoteId: string, cookie: string, body?: Record<string, unknown>) {
      const call = request(app).post(apiPaths.quotes.accept(quoteId)).set('Cookie', cookie);
      return body ? call.send(body) : call;
    }

    it('por defecto acepta y el lead no cambia', async () => {
      const lead = await leadOf(company.salesRep.id);
      const quote = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT', leadId: lead.id });

      const response = await accept(quote.id, salesRepCookie);

      expect(response.body).toMatchObject({ status: 'ACCEPTED', leadMarkedAsWon: false });
      await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({
        statusId: company.defaultLeadStatus.id,
      });
    });

    it('con markLeadAsWon pasa el lead a ganado y deja el cambio en su historial y en la auditoría', async () => {
      const lead = await leadOf(company.salesRep.id);
      const quote = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT', leadId: lead.id });

      const response = await accept(quote.id, salesRepCookie, { markLeadAsWon: true });

      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toMatchObject({ status: 'ACCEPTED', leadMarkedAsWon: true });
      await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({
        statusId: wonStatus().id,
      });
      const history = await prisma.leadStatusHistory.findMany({ where: { leadId: lead.id } });
      expect(history).toEqual([
        expect.objectContaining({
          oldStatusId: company.defaultLeadStatus.id,
          newStatusId: wonStatus().id,
          changedById: company.salesRep.id,
          note: 'Cotización COT-000001 aceptada',
        }),
      ]);
      const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((entry) => entry.action);
      expect(actions).toEqual(['QUOTE_ACCEPTED', 'LEAD_STATUS_CHANGED']);
    });

    it('si el comercial ya no puede modificar el lead, no se acepta nada (reversión real)', async () => {
      const lead = await leadOf(company.otherSalesRep.id);
      const quote = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT', leadId: lead.id });

      const response = await accept(quote.id, salesRepCookie, { markLeadAsWon: true });

      expect(response.status).toBe(HTTP_FORBIDDEN);
      await expect(prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).resolves.toMatchObject({
        status: 'SENT',
        decidedAt: null,
      });
      await expect(prisma.auditLog.count()).resolves.toBe(0);
    });

    it('un valor que no es booleano responde 400 sin aceptar', async () => {
      const quote = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT' });

      const response = await accept(quote.id, salesRepCookie, { markLeadAsWon: 'yes' });

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      await expect(prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).resolves.toMatchObject({
        status: 'SENT',
      });
    });
  });
});
