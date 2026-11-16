import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import {
  type TenantWithTeam,
  persistLead,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F1-T13: PATCH /api/v1/leads/:id/status cambia el estado y lo registra en LeadStatusHistory.

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const MAXIMUM_NOTE_LENGTH = 500;

describe('PATCH /api/v1/leads/:id/status', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
  });

  function contactedStatusId(): string {
    const [, contactedStatus] = company.leadStatuses;
    return contactedStatus.id;
  }

  it('cambia el estado, responde el lead actualizado y deja el cambio en el historial', async () => {
    const lead = await persistLead(company.tenant.id, { statusId: company.defaultLeadStatus.id });

    const response = await request(app)
      .patch(apiPaths.leads.changeStatus(lead.id))
      .set('Cookie', ownerCookie)
      .send({ statusId: contactedStatusId(), note: 'Pidió una cotización' });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body.statusId).toBe(contactedStatusId());
    const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(storedLead.statusId).toBe(contactedStatusId());
    const history = await prisma.leadStatusHistory.findMany({ where: { leadId: lead.id } });
    expect(history).toEqual([
      expect.objectContaining({
        tenantId: company.tenant.id,
        oldStatusId: company.defaultLeadStatus.id,
        newStatusId: contactedStatusId(),
        changedById: company.owner.id,
        note: 'Pidió una cotización',
      }),
    ]);
  });

  it('un comercial no puede cambiar el estado del lead de otro comercial: 403', async () => {
    const lead = await persistLead(company.tenant.id, { assignedToId: company.otherSalesRep.id });

    const response = await request(app)
      .patch(apiPaths.leads.changeStatus(lead.id))
      .set('Cookie', sessionCookieFor(company.salesRep))
      .send({ statusId: contactedStatusId() });

    expect(response.status).toBe(HTTP_FORBIDDEN);
    await expect(prisma.leadStatusHistory.count()).resolves.toBe(0);
  });

  it('un estado de otra empresa responde 400 INVALID_LEAD_STATUS y no cambia nada', async () => {
    const otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    const lead = await persistLead(company.tenant.id, { statusId: company.defaultLeadStatus.id });

    const response = await request(app)
      .patch(apiPaths.leads.changeStatus(lead.id))
      .set('Cookie', ownerCookie)
      .send({ statusId: otherCompany.defaultLeadStatus.id });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe(ErrorCode.INVALID_LEAD_STATUS);
    const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(storedLead.statusId).toBe(company.defaultLeadStatus.id);
  });

  it('un lead que no existe responde 404', async () => {
    const response = await request(app)
      .patch(apiPaths.leads.changeStatus(NON_EXISTENT_ID))
      .set('Cookie', ownerCookie)
      .send({ statusId: contactedStatusId() });

    expect(response.status).toBe(HTTP_NOT_FOUND);
  });

  it.each([
    ['sin statusId', {}],
    ['con un statusId que no es un uuid', { statusId: 'contacted' }],
    ['con una nota de más de 500 caracteres', { statusId: NON_EXISTENT_ID, note: 'x'.repeat(MAXIMUM_NOTE_LENGTH + 1) }],
  ])('responde 400 VALIDATION_FAILED %s', async (_case, body) => {
    const lead = await persistLead(company.tenant.id);

    const response = await request(app)
      .patch(apiPaths.leads.changeStatus(lead.id))
      .set('Cookie', ownerCookie)
      .send(body);

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('PATCH /api/v1/leads/:id ya no acepta statusId: el estado solo cambia por esta ruta, con historial', async () => {
    const lead = await persistLead(company.tenant.id, { statusId: company.defaultLeadStatus.id });

    await request(app)
      .patch(apiPaths.leads.update(lead.id))
      .set('Cookie', ownerCookie)
      .send({ statusId: contactedStatusId(), notes: 'Nota' });

    const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(storedLead.statusId).toBe(company.defaultLeadStatus.id);
    expect(storedLead.notes).toBe('Nota');
  });
});
