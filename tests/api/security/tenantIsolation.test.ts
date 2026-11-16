// Matriz de aislamiento por tenant (regla R5 de PLAN.md).
// Una empresa nunca puede leer ni modificar datos de otra, aunque conozca el id del recurso.
// Todo endpoint nuevo debe añadir aquí su caso de lectura y, si modifica datos, su caso de escritura.

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import {
  type TenantWithTeam,
  persistCompanyContact,
  persistContact,
  persistLead,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { serializeFilters, sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const FIRST_ERROR_STATUS = 400;

describe('Aislamiento por tenant', () => {
  let victimCompany: TenantWithTeam;
  let intruderCompany: TenantWithTeam;
  // El intruso es el dueño de otra empresa: el rol con más privilegios dentro de su propio tenant.
  let intruderCookie: string;

  let victimLeadId: string;
  let victimContactId: string;
  let victimCompanyContactId: string;
  let victimLeadStatusId: string;

  beforeEach(async () => {
    victimCompany = await persistTenantWithTeam({ name: 'Empresa Víctima SAS' });
    intruderCompany = await persistTenantWithTeam({ name: 'Empresa Intrusa SAS' });
    intruderCookie = sessionCookieFor(intruderCompany.owner);

    const victimCompanyContact = await persistCompanyContact(victimCompany.tenant.id, { name: 'Cliente Confidencial' });
    victimCompanyContactId = victimCompanyContact.id;
    victimContactId = (
      await persistContact(victimCompany.tenant.id, { lastName: 'Confidencial', companyId: victimCompanyContact.id })
    ).id;
    victimLeadId = (
      await persistLead(victimCompany.tenant.id, {
        contactName: 'Lead Confidencial',
        notes: 'Nota original',
        statusId: victimCompany.defaultLeadStatus.id,
        assignedToId: victimCompany.salesRep.id,
      })
    ).id;
    victimLeadStatusId = victimCompany.defaultLeadStatus.id;
  });

  describe('lectura: los listados solo contienen datos de la empresa del usuario', () => {
    it.each([
      { routeName: 'GET /api/lead/getAll', path: apiPaths.leads.getAll },
      { routeName: 'GET /api/contact/getAll', path: apiPaths.contacts.getAll },
      { routeName: 'GET /api/companyContact/getAll', path: apiPaths.companyContacts.getAll },
    ])('$routeName no devuelve registros de otra empresa', async ({ path }) => {
      const response = await request(app).get(path).set('Cookie', intruderCookie);

      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toEqual([]);
    });

    it.each([
      { routeName: 'GET /api/lead/filtered', path: apiPaths.leads.filtered },
      { routeName: 'GET /api/contact/filtered', path: apiPaths.contacts.filtered },
      { routeName: 'GET /api/companyContact/filtered', path: apiPaths.companyContacts.filtered },
    ])('$routeName no devuelve ni cuenta registros de otra empresa', async ({ path }) => {
      const response = await request(app).get(path).query({ search: 'confidencial' }).set('Cookie', intruderCookie);

      expect(response.status).toBe(HTTP_OK);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('GET /api/lead/filtered no alcanza leads de otra empresa aunque se filtre por su estado o su responsable', async () => {
      const response = await request(app)
        .get(apiPaths.leads.filtered)
        .query({
          filters: serializeFilters([
            { field: 'statusId', operator: 'equals', value: victimLeadStatusId },
            { field: 'assignedToId', operator: 'equals', value: victimCompany.salesRep.id },
          ]),
        })
        .set('Cookie', intruderCookie);

      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('GET /api/leadStatusConfig/getAll solo devuelve los estados de la empresa del usuario', async () => {
      const response = await request(app).get(apiPaths.leadStatusConfigs.getAll).set('Cookie', intruderCookie);

      const returnedStatusIds = response.body.map((status: { id: string }) => status.id).sort();
      expect(returnedStatusIds).toEqual(intruderCompany.leadStatuses.map((status) => status.id).sort());
    });
  });

  describe('escritura: no se puede modificar un recurso de otra empresa conociendo su id', () => {
    it('PATCH /api/lead/update/:id no modifica el lead', async () => {
      const response = await request(app)
        .patch(apiPaths.leads.update(victimLeadId))
        .set('Cookie', intruderCookie)
        .send({ notes: 'Modificado por otra empresa' });

      expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: victimLeadId } });
      expect(storedLead.notes).toBe('Nota original');
    });

    it('POST /api/lead/delete/:id no borra el lead', async () => {
      const response = await request(app).post(apiPaths.leads.delete(victimLeadId)).set('Cookie', intruderCookie);

      expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: victimLeadId } });
      expect(storedLead.deleted).toBe(DeletedState.ACTIVE);
    });

    it('PATCH /api/contact/update/:id no modifica el contacto', async () => {
      const response = await request(app)
        .patch(apiPaths.contacts.update(victimContactId))
        .set('Cookie', intruderCookie)
        .send({ lastName: 'Modificado' });

      expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
      const storedContact = await prisma.contact.findUniqueOrThrow({ where: { id: victimContactId } });
      expect(storedContact.lastName).toBe('Confidencial');
    });

    it('PATCH /api/companyContact/update/:id no modifica la empresa cliente', async () => {
      const response = await request(app)
        .patch(apiPaths.companyContacts.update(victimCompanyContactId))
        .set('Cookie', intruderCookie)
        .send({ name: 'Modificada' });

      expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
      const storedCompanyContact = await prisma.companyContact.findUniqueOrThrow({
        where: { id: victimCompanyContactId },
      });
      expect(storedCompanyContact.name).toBe('Cliente Confidencial');
    });

    it('PATCH /api/leadStatusConfig/update/:id no modifica el estado', async () => {
      const response = await request(app)
        .patch(apiPaths.leadStatusConfigs.update(victimLeadStatusId))
        .set('Cookie', intruderCookie)
        .send({ name: 'Modificado', isDefault: false });

      expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
      const storedStatus = await prisma.leadStatusConfig.findUniqueOrThrow({ where: { id: victimLeadStatusId } });
      expect(storedStatus).toMatchObject({ name: 'Nuevo', isDefault: true });
    });

    it('POST /api/lead/create no acepta un estado de otra empresa', async () => {
      const response = await request(app)
        .post(apiPaths.leads.create)
        .set('Cookie', intruderCookie)
        .send({ contactName: 'Ana Gómez', statusId: victimLeadStatusId });

      expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
      await expect(prisma.lead.count({ where: { tenantId: intruderCompany.tenant.id } })).resolves.toBe(0);
    });

    it('POST /api/lead/create no acepta como responsable a un usuario de otra empresa', async () => {
      const response = await request(app)
        .post(apiPaths.leads.create)
        .set('Cookie', intruderCookie)
        .send({ contactName: 'Ana Gómez', assignedToId: victimCompany.salesRep.id });

      expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
      await expect(prisma.lead.count({ where: { assignedToId: victimCompany.salesRep.id } })).resolves.toBe(1);
    });
  });

  describe('respuesta: un recurso de otra empresa se trata como inexistente (404)', () => {
    it('PATCH /api/lead/update/:id responde 404', async () => {
      const response = await request(app)
        .patch(apiPaths.leads.update(victimLeadId))
        .set('Cookie', intruderCookie)
        .send({ notes: 'Modificado por otra empresa' });

      expect(response.status).toBe(HTTP_NOT_FOUND);
    });

    it('POST /api/lead/delete/:id responde 404', async () => {
      const response = await request(app).post(apiPaths.leads.delete(victimLeadId)).set('Cookie', intruderCookie);

      expect(response.status).toBe(HTTP_NOT_FOUND);
    });

    it('PATCH /api/contact/update/:id responde 404', async () => {
      const response = await request(app)
        .patch(apiPaths.contacts.update(victimContactId))
        .set('Cookie', intruderCookie)
        .send({ lastName: 'Modificado' });

      expect(response.status).toBe(HTTP_NOT_FOUND);
    });

    it('PATCH /api/companyContact/update/:id responde 404', async () => {
      const response = await request(app)
        .patch(apiPaths.companyContacts.update(victimCompanyContactId))
        .set('Cookie', intruderCookie)
        .send({ name: 'Modificada' });

      expect(response.status).toBe(HTTP_NOT_FOUND);
    });

    it('PATCH /api/leadStatusConfig/update/:id responde 404', async () => {
      const response = await request(app)
        .patch(apiPaths.leadStatusConfigs.update(victimLeadStatusId))
        .set('Cookie', intruderCookie)
        .send({ name: 'Modificado' });

      expect(response.status).toBe(HTTP_NOT_FOUND);
    });
  });
});
