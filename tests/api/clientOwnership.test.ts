import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import {
  type TenantWithTeam,
  persistCompanyContact,
  persistContact,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F1-T17: visibilidad de clientes por responsable (D-18) y documento único (D-19) contra PostgreSQL.

const HTTP_CREATED = 201;
const HTTP_CONFLICT = 409;

function idsOf(records: Array<{ id: string }>): string[] {
  return records.map((record) => record.id).sort();
}

describe('clientes por responsable y documento único', () => {
  let company: TenantWithTeam;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
  });

  it('un comercial lista y filtra solo sus contactos; los que no tienen responsable solo los ve gestión', async () => {
    const ownContact = await persistContact(company.tenant.id, { ownerId: company.salesRep.id });
    const othersContact = await persistContact(company.tenant.id, { ownerId: company.otherSalesRep.id });
    const legacyContact = await persistContact(company.tenant.id);

    const repList = await request(app).get(apiPaths.contacts.getAll).set('Cookie', sessionCookieFor(company.salesRep));
    const repFiltered = await request(app)
      .get(apiPaths.contacts.filtered)
      .query({ filters: JSON.stringify([{ field: 'ownerId', operator: 'equals', value: company.otherSalesRep.id }]) })
      .set('Cookie', sessionCookieFor(company.salesRep));
    const ownerList = await request(app).get(apiPaths.contacts.getAll).set('Cookie', sessionCookieFor(company.owner));

    expect(idsOf(repList.body)).toEqual([ownContact.id]);
    expect(idsOf(repFiltered.body.data)).toEqual([ownContact.id]);
    expect(idsOf(ownerList.body)).toEqual(idsOf([ownContact, othersContact, legacyContact]));
  });

  it('un comercial lista solo sus empresas cliente', async () => {
    const ownCompany = await persistCompanyContact(company.tenant.id, { ownerId: company.salesRep.id });
    await persistCompanyContact(company.tenant.id, { ownerId: company.otherSalesRep.id });

    const response = await request(app)
      .get(apiPaths.companyContacts.getAll)
      .set('Cookie', sessionCookieFor(company.salesRep));

    expect(idsOf(response.body)).toEqual([ownCompany.id]);
  });

  it('lo que crea un comercial queda a su nombre', async () => {
    const response = await request(app)
      .post(apiPaths.contacts.create)
      .set('Cookie', sessionCookieFor(company.salesRep))
      .send({ firstName: 'Laura', lastName: 'Martínez', ownerId: company.otherSalesRep.id });

    expect(response.status).toBe(HTTP_CREATED);
    expect(response.body.ownerId).toBe(company.salesRep.id);
  });

  it('el mismo documento con otro formato responde 409 DOCUMENT_ALREADY_REGISTERED', async () => {
    const ownerCookie = sessionCookieFor(company.owner);
    await request(app)
      .post(apiPaths.contacts.create)
      .set('Cookie', ownerCookie)
      .send({ firstName: 'Laura', lastName: 'Martínez', documentType: 'CC', documentNumber: '1.020.304.050' });

    const duplicate = await request(app)
      .post(apiPaths.contacts.create)
      .set('Cookie', ownerCookie)
      .send({ firstName: 'Otra', lastName: 'Persona', documentType: 'CC', documentNumber: '1020304050' });

    expect(duplicate.status).toBe(HTTP_CONFLICT);
    expect(duplicate.body.error.code).toBe(ErrorCode.DOCUMENT_ALREADY_REGISTERED);
  });

  it('el mismo NIT en otra empresa (tenant) no choca: la unicidad es por empresa', async () => {
    const otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    await request(app)
      .post(apiPaths.companyContacts.create)
      .set('Cookie', sessionCookieFor(company.owner))
      .send({ name: 'Roble SAS', taxNumber: '900123456-7' });

    const response = await request(app)
      .post(apiPaths.companyContacts.create)
      .set('Cookie', sessionCookieFor(otherCompany.owner))
      .send({ name: 'Roble SAS', taxNumber: '900123456-7' });

    expect(response.status).toBe(HTTP_CREATED);
    expect(response.body.documentNumber).toBe('900123456');
  });
});
