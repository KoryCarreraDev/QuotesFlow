import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import {
  type TenantWithTeam,
  persistLead,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { serializeFilters, sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';
import { itKnownDefect } from '@tests/support/knownDefect.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

function idsOf(records: Array<{ id: string }>): string[] {
  return records.map((record) => record.id).sort();
}

describe('API de leads', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;
  let salesRepCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
    salesRepCookie = sessionCookieFor(company.salesRep);
  });

  describe('POST /api/lead/create', () => {
    it('crea el lead en la empresa del usuario con el estado predeterminado y responde 201', async () => {
      const response = await request(app)
        .post(apiPaths.leads.create)
        .set('Cookie', ownerCookie)
        .send({
          contactName: 'Ana Gómez',
          companyName: 'Vidrios del Norte',
          email: 'ana@example.com',
          estimatedValue: 2_500_000,
          expectedCloseDate: '2026-06-30T00:00:00.000Z',
        });

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body).toMatchObject({
        contactName: 'Ana Gómez',
        companyName: 'Vidrios del Norte',
        email: 'ana@example.com',
        estimatedValue: 2_500_000,
        expectedCloseDate: '2026-06-30T00:00:00.000Z',
        statusId: company.defaultLeadStatus.id,
      });
      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(storedLead.tenantId).toBe(company.tenant.id);
      expect(storedLead.deleted).toBe(DeletedState.Active);
    });

    it('la respuesta no expone el tenant', async () => {
      const response = await request(app)
        .post(apiPaths.leads.create)
        .set('Cookie', ownerCookie)
        .send({ contactName: 'Ana Gómez' });

      expect(Object.keys(response.body)).not.toContain('tenantId');
    });

    it('ignora el tenant que envíe el cliente en el cuerpo', async () => {
      const otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });

      const response = await request(app)
        .post(apiPaths.leads.create)
        .set('Cookie', ownerCookie)
        .send({ contactName: 'Ana Gómez', tenantId: otherCompany.tenant.id });

      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(storedLead.tenantId).toBe(company.tenant.id);
    });

    it('un dueño puede asignar el lead a un comercial de su empresa', async () => {
      const response = await request(app)
        .post(apiPaths.leads.create)
        .set('Cookie', ownerCookie)
        .send({ contactName: 'Ana Gómez', assignedToId: company.salesRep.id });

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body.assignedToId).toBe(company.salesRep.id);
    });

    it('un comercial queda como responsable del lead que crea, aunque indique a otro', async () => {
      const response = await request(app)
        .post(apiPaths.leads.create)
        .set('Cookie', salesRepCookie)
        .send({ contactName: 'Ana Gómez', assignedToId: company.otherSalesRep.id });

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body.assignedToId).toBe(company.salesRep.id);
    });

    it('responde 400 y no crea el lead si falta el nombre del contacto', async () => {
      const response = await request(app)
        .post(apiPaths.leads.create)
        .set('Cookie', ownerCookie)
        .send({ companyName: 'Vidrios del Norte' });

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      await expect(prisma.lead.count()).resolves.toBe(0);
    });
  });

  describe('GET /api/lead/getAll', () => {
    it('un dueño ve todos los leads activos de su empresa', async () => {
      const assignedLead = await persistLead(company.tenant.id, { assignedToId: company.salesRep.id });
      const unassignedLead = await persistLead(company.tenant.id);
      await persistLead(company.tenant.id, { deleted: DeletedState.Inactive });

      const response = await request(app).get(apiPaths.leads.getAll).set('Cookie', ownerCookie);

      expect(response.status).toBe(HTTP_OK);
      expect(idsOf(response.body)).toEqual([assignedLead.id, unassignedLead.id].sort());
    });

    it('un comercial solo ve los leads que tiene asignados', async () => {
      const ownLead = await persistLead(company.tenant.id, { assignedToId: company.salesRep.id });
      await persistLead(company.tenant.id, { assignedToId: company.otherSalesRep.id });
      await persistLead(company.tenant.id);

      const response = await request(app).get(apiPaths.leads.getAll).set('Cookie', salesRepCookie);

      expect(idsOf(response.body)).toEqual([ownLead.id]);
    });
  });

  describe('PATCH /api/lead/update/:id', () => {
    it('actualiza los campos enviados y conserva el resto', async () => {
      const lead = await persistLead(company.tenant.id, { contactName: 'Ana Gómez', phone: '3001234567' });

      const response = await request(app)
        .patch(apiPaths.leads.update(lead.id))
        .set('Cookie', ownerCookie)
        .send({ contactName: 'Ana María Gómez', notes: 'Cliente interesado' });

      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toMatchObject({
        id: lead.id,
        contactName: 'Ana María Gómez',
        notes: 'Cliente interesado',
        phone: '3001234567',
      });
      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(storedLead.contactName).toBe('Ana María Gómez');
    });

    it('un comercial no puede modificar el lead de otro comercial', async () => {
      const lead = await persistLead(company.tenant.id, {
        assignedToId: company.otherSalesRep.id,
        notes: 'Nota original',
      });

      const response = await request(app)
        .patch(apiPaths.leads.update(lead.id))
        .set('Cookie', salesRepCookie)
        .send({ notes: 'Nota ajena' });

      expect(response.status).toBeGreaterThanOrEqual(HTTP_BAD_REQUEST);
      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(storedLead.notes).toBe('Nota original');
    });

    it('un comercial no puede reasignar su lead a otro usuario', async () => {
      const lead = await persistLead(company.tenant.id, { assignedToId: company.salesRep.id });

      await request(app)
        .patch(apiPaths.leads.update(lead.id))
        .set('Cookie', salesRepCookie)
        .send({ assignedToId: company.otherSalesRep.id });

      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(storedLead.assignedToId).toBe(company.salesRep.id);
    });

    it('responde 400 si el cuerpo es inválido', async () => {
      const lead = await persistLead(company.tenant.id);

      const response = await request(app)
        .patch(apiPaths.leads.update(lead.id))
        .set('Cookie', ownerCookie)
        .send({ email: 'not-an-email' });

      expect(response.status).toBe(HTTP_BAD_REQUEST);
    });

    itKnownDefect('H5', 'responde 404 si el lead no existe', async () => {
      const response = await request(app)
        .patch(apiPaths.leads.update(NON_EXISTENT_ID))
        .set('Cookie', ownerCookie)
        .send({ notes: 'Nota' });

      expect(response.status).toBe(HTTP_NOT_FOUND);
    });

    itKnownDefect('H9', 'no permite reasignar un lead a un usuario de otra empresa', async () => {
      const otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
      const lead = await persistLead(company.tenant.id, { assignedToId: company.salesRep.id });

      await request(app)
        .patch(apiPaths.leads.update(lead.id))
        .set('Cookie', ownerCookie)
        .send({ assignedToId: otherCompany.salesRep.id });

      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(storedLead.assignedToId).toBe(company.salesRep.id);
    });
  });

  describe('POST /api/lead/delete/:id', () => {
    it('borra de forma suave: responde 200, el lead deja de listarse y la fila se conserva', async () => {
      const lead = await persistLead(company.tenant.id);

      const deleteResponse = await request(app).post(apiPaths.leads.delete(lead.id)).set('Cookie', ownerCookie);
      const listResponse = await request(app).get(apiPaths.leads.getAll).set('Cookie', ownerCookie);

      expect(deleteResponse.status).toBe(HTTP_OK);
      expect(listResponse.body).toEqual([]);
      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(storedLead.deleted).toBe(DeletedState.Inactive);
    });

    it('un comercial no puede borrar el lead de otro comercial', async () => {
      const lead = await persistLead(company.tenant.id, { assignedToId: company.otherSalesRep.id });

      const response = await request(app).post(apiPaths.leads.delete(lead.id)).set('Cookie', salesRepCookie);

      expect(response.status).toBeGreaterThanOrEqual(HTTP_BAD_REQUEST);
      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(storedLead.deleted).toBe(DeletedState.Active);
    });

    it('un lead ya borrado no se puede volver a borrar ni actualizar', async () => {
      const deletedLead = await persistLead(company.tenant.id, {
        deleted: DeletedState.Inactive,
        notes: 'Nota original',
      });

      const deleteResponse = await request(app).post(apiPaths.leads.delete(deletedLead.id)).set('Cookie', ownerCookie);
      const updateResponse = await request(app)
        .patch(apiPaths.leads.update(deletedLead.id))
        .set('Cookie', ownerCookie)
        .send({ notes: 'Nota nueva' });

      expect(deleteResponse.status).toBeGreaterThanOrEqual(HTTP_BAD_REQUEST);
      expect(updateResponse.status).toBeGreaterThanOrEqual(HTTP_BAD_REQUEST);
      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: deletedLead.id } });
      expect(storedLead.notes).toBe('Nota original');
    });
  });

  describe('GET /api/lead/filtered', () => {
    it('responde con datos, total, página y límite', async () => {
      await persistLead(company.tenant.id);
      await persistLead(company.tenant.id);
      await persistLead(company.tenant.id);

      const response = await request(app)
        .get(apiPaths.leads.filtered)
        .query({ page: 2, limit: 2 })
        .set('Cookie', ownerCookie);

      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(response.body.data).toHaveLength(1);
    });

    it('combina búsqueda libre y filtros', async () => {
      const [, contactedStatus] = company.leadStatuses;
      const matchingLead = await persistLead(company.tenant.id, {
        contactName: 'Ana Gómez',
        statusId: contactedStatus.id,
      });
      await persistLead(company.tenant.id, { contactName: 'Ana Ruiz', statusId: company.defaultLeadStatus.id });
      await persistLead(company.tenant.id, {
        contactName: 'Pedro Gil',
        email: 'pedro.gil@example.com',
        statusId: contactedStatus.id,
      });

      const response = await request(app)
        .get(apiPaths.leads.filtered)
        .query({
          search: 'ana',
          filters: serializeFilters([{ field: 'statusId', operator: 'equals', value: contactedStatus.id }]),
        })
        .set('Cookie', ownerCookie);

      expect(idsOf(response.body.data)).toEqual([matchingLead.id]);
      expect(response.body.total).toBe(1);
    });

    it('un comercial solo recibe sus leads, aunque pida los de otro en el filtro', async () => {
      const ownLead = await persistLead(company.tenant.id, { assignedToId: company.salesRep.id });
      await persistLead(company.tenant.id, { assignedToId: company.otherSalesRep.id });

      const response = await request(app)
        .get(apiPaths.leads.filtered)
        .query({
          filters: serializeFilters([
            { field: 'assignedToId', operator: 'equals', value: company.otherSalesRep.id },
          ]),
        })
        .set('Cookie', salesRepCookie);

      expect(idsOf(response.body.data)).toEqual([ownLead.id]);
      expect(response.body.total).toBe(1);
    });

    it('un comercial sin filtros tampoco ve leads de otros', async () => {
      const ownLead = await persistLead(company.tenant.id, { assignedToId: company.salesRep.id });
      await persistLead(company.tenant.id, { assignedToId: company.otherSalesRep.id });
      await persistLead(company.tenant.id);

      const response = await request(app).get(apiPaths.leads.filtered).set('Cookie', salesRepCookie);

      expect(idsOf(response.body.data)).toEqual([ownLead.id]);
    });

    it('responde 400 si los filtros no son JSON válido', async () => {
      const response = await request(app)
        .get(apiPaths.leads.filtered)
        .query({ filters: 'not-json' })
        .set('Cookie', ownerCookie);

      expect(response.status).toBe(HTTP_BAD_REQUEST);
    });

    it('no devuelve datos al filtrar por un campo fuera de la lista blanca', async () => {
      await persistLead(company.tenant.id);

      const response = await request(app)
        .get(apiPaths.leads.filtered)
        .query({ filters: serializeFilters([{ field: 'tenantId', operator: 'equals', value: company.tenant.id }]) })
        .set('Cookie', ownerCookie);

      expect(response.status).toBeGreaterThanOrEqual(HTTP_BAD_REQUEST);
      expect(response.body.data).toBeUndefined();
    });

    itKnownDefect('H11', 'responde 400 al filtrar por un campo fuera de la lista blanca', async () => {
      const response = await request(app)
        .get(apiPaths.leads.filtered)
        .query({ filters: serializeFilters([{ field: 'tenantId', operator: 'equals', value: company.tenant.id }]) })
        .set('Cookie', ownerCookie);

      expect(response.status).toBe(HTTP_BAD_REQUEST);
    });

    itKnownDefect('H11', 'responde 400 si el valor de un filtro no es del tipo del campo', async () => {
      const response = await request(app)
        .get(apiPaths.leads.filtered)
        .query({
          filters: serializeFilters([{ field: 'estimatedValue', operator: 'gte', value: { not: 'a number' } }]),
        })
        .set('Cookie', ownerCookie);

      expect(response.status).toBe(HTTP_BAD_REQUEST);
    });
  });
});
