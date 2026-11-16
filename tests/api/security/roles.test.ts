// Matriz de permisos por rol (regla R5 de PLAN.md), según las reglas vigentes de la sección 6 de CONTEXT.md.
// Todo endpoint que restrinja por rol debe añadir aquí sus casos permitidos y denegados.

import type { User as UserRecord } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import {
  type TenantWithTeam,
  persistLead,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';
import { itKnownDefect } from '@tests/support/knownDefect.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_FORBIDDEN = 403;
const FIRST_ERROR_STATUS = 400;
const FIRST_FREE_STATUS_ORDER = 6;

type TeamMember = 'owner' | 'partner' | 'salesLeader' | 'salesRep';

// Roles de gestión: ven y administran todo lo de su empresa.
const managementMembers: Array<{ member: TeamMember }> = [
  { member: 'owner' },
  { member: 'partner' },
  { member: 'salesLeader' },
];

describe('Permisos por rol', () => {
  let company: TenantWithTeam;

  function cookieOf(member: TeamMember): string {
    return sessionCookieFor(company[member] as UserRecord);
  }

  beforeEach(async () => {
    company = await persistTenantWithTeam();
  });

  describe('estados de lead', () => {
    it.each(managementMembers)('$member puede crear un estado', async ({ member }) => {
      const response = await request(app)
        .post(apiPaths.leadStatusConfigs.create)
        .set('Cookie', cookieOf(member))
        .send({ name: 'En negociación', order: FIRST_FREE_STATUS_ORDER });

      expect(response.status).toBe(HTTP_CREATED);
    });

    it.each(managementMembers)('$member puede actualizar un estado', async ({ member }) => {
      const [, contactedStatus] = company.leadStatuses;

      const response = await request(app)
        .patch(apiPaths.leadStatusConfigs.update(contactedStatus.id))
        .set('Cookie', cookieOf(member))
        .send({ name: 'Primer contacto' });

      expect(response.status).toBe(HTTP_OK);
    });

    it('salesRep no puede crear un estado', async () => {
      const response = await request(app)
        .post(apiPaths.leadStatusConfigs.create)
        .set('Cookie', cookieOf('salesRep'))
        .send({ name: 'En negociación', order: FIRST_FREE_STATUS_ORDER });

      expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
      await expect(prisma.leadStatusConfig.count({ where: { tenantId: company.tenant.id } })).resolves.toBe(
        company.leadStatuses.length,
      );
    });

    it('salesRep no puede actualizar un estado', async () => {
      const [, contactedStatus] = company.leadStatuses;

      const response = await request(app)
        .patch(apiPaths.leadStatusConfigs.update(contactedStatus.id))
        .set('Cookie', cookieOf('salesRep'))
        .send({ name: 'Primer contacto' });

      expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
      const storedStatus = await prisma.leadStatusConfig.findUniqueOrThrow({ where: { id: contactedStatus.id } });
      expect(storedStatus.name).toBe('Contactado');
    });

    it('salesRep sí puede consultar los estados', async () => {
      const response = await request(app).get(apiPaths.leadStatusConfigs.getAll).set('Cookie', cookieOf('salesRep'));

      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toHaveLength(company.leadStatuses.length);
    });

    it('salesRep recibe 403 al intentar crear un estado', async () => {
      const response = await request(app)
        .post(apiPaths.leadStatusConfigs.create)
        .set('Cookie', cookieOf('salesRep'))
        .send({ name: 'En negociación', order: FIRST_FREE_STATUS_ORDER });

      expect(response.status).toBe(HTTP_FORBIDDEN);
    });
  });

  describe('leads', () => {
    let leadOfSalesRep: string;
    let leadOfOtherSalesRep: string;
    let unassignedLead: string;

    beforeEach(async () => {
      leadOfSalesRep = (await persistLead(company.tenant.id, { assignedToId: company.salesRep.id })).id;
      leadOfOtherSalesRep = (
        await persistLead(company.tenant.id, { assignedToId: company.otherSalesRep.id, notes: 'Nota original' })
      ).id;
      unassignedLead = (await persistLead(company.tenant.id)).id;
    });

    it.each(managementMembers)('$member ve todos los leads de la empresa', async ({ member }) => {
      const listResponse = await request(app).get(apiPaths.leads.getAll).set('Cookie', cookieOf(member));
      const filteredResponse = await request(app).get(apiPaths.leads.filtered).set('Cookie', cookieOf(member));

      const expectedLeadIds = [leadOfSalesRep, leadOfOtherSalesRep, unassignedLead].sort();
      expect(listResponse.body.map((lead: { id: string }) => lead.id).sort()).toEqual(expectedLeadIds);
      expect(filteredResponse.body.total).toBe(expectedLeadIds.length);
    });

    it.each(managementMembers)(
      '$member puede actualizar, reasignar y borrar el lead de un comercial',
      async ({ member }) => {
        const updateResponse = await request(app)
          .patch(apiPaths.leads.update(leadOfOtherSalesRep))
          .set('Cookie', cookieOf(member))
          .send({ assignedToId: company.salesRep.id });
        const deleteResponse = await request(app)
          .post(apiPaths.leads.delete(leadOfOtherSalesRep))
          .set('Cookie', cookieOf(member));

        expect(updateResponse.status).toBe(HTTP_OK);
        expect(updateResponse.body.assignedToId).toBe(company.salesRep.id);
        expect(deleteResponse.status).toBe(HTTP_OK);
      },
    );

    it('salesRep solo ve sus leads, en el listado y en el filtrado', async () => {
      const listResponse = await request(app).get(apiPaths.leads.getAll).set('Cookie', cookieOf('salesRep'));
      const filteredResponse = await request(app).get(apiPaths.leads.filtered).set('Cookie', cookieOf('salesRep'));

      expect(listResponse.body.map((lead: { id: string }) => lead.id)).toEqual([leadOfSalesRep]);
      expect(filteredResponse.body.data.map((lead: { id: string }) => lead.id)).toEqual([leadOfSalesRep]);
    });

    it('salesRep puede actualizar y borrar su propio lead', async () => {
      const updateResponse = await request(app)
        .patch(apiPaths.leads.update(leadOfSalesRep))
        .set('Cookie', cookieOf('salesRep'))
        .send({ notes: 'Cliente interesado' });
      const deleteResponse = await request(app)
        .post(apiPaths.leads.delete(leadOfSalesRep))
        .set('Cookie', cookieOf('salesRep'));

      expect(updateResponse.status).toBe(HTTP_OK);
      expect(deleteResponse.status).toBe(HTTP_OK);
    });

    it('salesRep no puede actualizar ni borrar el lead de otro comercial ni uno sin asignar', async () => {
      for (const foreignLeadId of [leadOfOtherSalesRep, unassignedLead]) {
        const updateResponse = await request(app)
          .patch(apiPaths.leads.update(foreignLeadId))
          .set('Cookie', cookieOf('salesRep'))
          .send({ notes: 'Nota ajena' });
        const deleteResponse = await request(app)
          .post(apiPaths.leads.delete(foreignLeadId))
          .set('Cookie', cookieOf('salesRep'));

        expect(updateResponse.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
        expect(deleteResponse.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
        const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: foreignLeadId } });
        expect(storedLead.notes).not.toBe('Nota ajena');
        expect(storedLead.deleted).toBe(DeletedState.ACTIVE);
      }
    });

    it('salesRep recibe 403 al intentar actualizar el lead de otro comercial', async () => {
      const response = await request(app)
        .patch(apiPaths.leads.update(leadOfOtherSalesRep))
        .set('Cookie', cookieOf('salesRep'))
        .send({ notes: 'Nota ajena' });

      expect(response.status).toBe(HTTP_FORBIDDEN);
    });

    itKnownDefect('H2', 'el rol de un token ya emitido deja de valer cuando al usuario le cambian el rol', async () => {
      const cookieIssuedAsSalesLeader = cookieOf('salesLeader');
      await prisma.user.update({ where: { id: company.salesLeader.id }, data: { role: 'SALES_REP' } });

      const response = await request(app).get(apiPaths.leads.getAll).set('Cookie', cookieIssuedAsSalesLeader);

      expect(response.body).toEqual([]);
    });
  });
});
