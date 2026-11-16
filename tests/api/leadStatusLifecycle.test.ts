import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { LeadStatusType } from '@/domain/enums/LeadStatusType.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import {
  type TenantWithTeam,
  persistLead,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F1-T14: tipo de estado (D-51), borrado suave con regla y reordenamiento transaccional.

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

describe('ciclo de vida de los estados de lead', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
  });

  function statusNamed(name: string) {
    const status = company.leadStatuses.find((candidate) => candidate.name === name);
    if (!status) throw new Error(`Missing default status ${name}`);
    return status;
  }

  it('el registro crea Ganado como WON, Perdido como LOST y el resto como OPEN', async () => {
    const registration = await request(app).post(apiPaths.auth.register).send({
      companyName: 'Empresa Nueva SAS',
      ownerEmail: 'new.owner@example.com',
      password: 'Correct-Horse-Battery-9',
      ownerFirstName: 'Ana',
      ownerLastName: 'Gómez',
    });

    const statuses = await prisma.leadStatusConfig.findMany({
      where: { tenantId: registration.body.tenantId },
      orderBy: { order: 'asc' },
    });
    expect(statuses.map((status) => [status.name, status.type])).toEqual([
      ['Nuevo', LeadStatusType.OPEN],
      ['Contactado', LeadStatusType.OPEN],
      ['Calificado', LeadStatusType.OPEN],
      ['Ganado', LeadStatusType.WON],
      ['Perdido', LeadStatusType.LOST],
    ]);
  });

  it('un orden repetido responde 409 LEAD_STATUS_ORDER_TAKEN, no 500', async () => {
    const response = await request(app)
      .post(apiPaths.leadStatusConfigs.create)
      .set('Cookie', ownerCookie)
      .send({ name: 'Duplicado', order: company.defaultLeadStatus.order });

    expect(response.status).toBe(HTTP_CONFLICT);
    expect(response.body.error.code).toBe(ErrorCode.LEAD_STATUS_ORDER_TAKEN);
  });

  it('borrar un estado libera su orden: se puede crear otro con el mismo orden', async () => {
    const contacted = statusNamed('Contactado');

    const deletion = await request(app)
      .post(apiPaths.leadStatusConfigs.delete(contacted.id))
      .set('Cookie', ownerCookie);
    const creation = await request(app)
      .post(apiPaths.leadStatusConfigs.create)
      .set('Cookie', ownerCookie)
      .send({ name: 'Reemplazo', order: contacted.order });

    expect(deletion.status).toBe(HTTP_OK);
    expect(creation.status).toBe(HTTP_CREATED);
  });

  it('un estado con leads no se borra: 409 LEAD_STATUS_IN_USE', async () => {
    const contacted = statusNamed('Contactado');
    await persistLead(company.tenant.id, { statusId: contacted.id });

    const response = await request(app)
      .post(apiPaths.leadStatusConfigs.delete(contacted.id))
      .set('Cookie', ownerCookie);

    expect(response.status).toBe(HTTP_CONFLICT);
    expect(response.body.error.code).toBe(ErrorCode.LEAD_STATUS_IN_USE);
  });

  it('el estado predeterminado no se borra: 409', async () => {
    const response = await request(app)
      .post(apiPaths.leadStatusConfigs.delete(company.defaultLeadStatus.id))
      .set('Cookie', ownerCookie);

    expect(response.status).toBe(HTTP_CONFLICT);
  });

  it('reordenar invierte los órdenes en una sola operación, sin chocar con la restricción única', async () => {
    const reversedIds = [...company.leadStatuses].reverse().map((status) => status.id);

    const response = await request(app)
      .patch(apiPaths.leadStatusConfigs.reorder)
      .set('Cookie', ownerCookie)
      .send({ statusIds: reversedIds });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body.map((status: { id: string }) => status.id)).toEqual(reversedIds);
    expect(response.body.map((status: { order: number }) => status.order)).toEqual(
      reversedIds.map((_statusId, index) => index + 1),
    );
  });

  it('una lista incompleta no cambia ningún orden: 400 LEAD_STATUS_LIST_MISMATCH', async () => {
    const ordersBefore = company.leadStatuses.map((status) => status.order);

    const response = await request(app)
      .patch(apiPaths.leadStatusConfigs.reorder)
      .set('Cookie', ownerCookie)
      .send({ statusIds: company.leadStatuses.slice(1).map((status) => status.id) });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe(ErrorCode.LEAD_STATUS_LIST_MISMATCH);
    const stored = await prisma.leadStatusConfig.findMany({
      where: { tenantId: company.tenant.id },
      orderBy: { order: 'asc' },
    });
    expect(stored.map((status) => status.order)).toEqual(ordersBefore);
  });

  it('un tipo desconocido responde 400', async () => {
    const response = await request(app)
      .post(apiPaths.leadStatusConfigs.create)
      .set('Cookie', ownerCookie)
      .send({ name: 'Raro', order: 9, type: 'ARCHIVED' });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
  });
});
