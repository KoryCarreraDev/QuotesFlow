import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import {
  type TenantWithTeam,
  persistCompanyContact,
  persistContact,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { serializeFilters, sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

function idsOf(records: Array<{ id: string }>): string[] {
  return records.map((record) => record.id).sort();
}

let company: TenantWithTeam;
// Desde F1-T17 (D-18) un comercial solo ve y modifica los clientes de los que es responsable: los
// registros de estas pruebas son del comercial que hace las peticiones.
let salesRepCookie: string;

beforeEach(async () => {
  company = await persistTenantWithTeam();
  // Contactos y empresas cliente no restringen por rol todavía: se prueban con el rol de menor privilegio.
  salesRepCookie = sessionCookieFor(company.salesRep);
});

describe('API de contactos', () => {
  it('POST /create crea el contacto en la empresa del usuario y responde 201', async () => {
    const companyContact = await persistCompanyContact(company.tenant.id, {
      ownerId: company.salesRep.id,
    });

    const response = await request(app).post(apiPaths.contacts.create).set('Cookie', salesRepCookie).send({
      firstName: 'Laura',
      lastName: 'Martínez',
      email: 'laura@example.com',
      phone: '3109876543',
      companyId: companyContact.id,
    });

    expect(response.status).toBe(HTTP_CREATED);
    expect(response.body).toMatchObject({
      firstName: 'Laura',
      lastName: 'Martínez',
      email: 'laura@example.com',
      phone: '3109876543',
      companyId: companyContact.id,
    });
    expect(Object.keys(response.body)).not.toContain('tenantId');
    const storedContact = await prisma.contact.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(storedContact.tenantId).toBe(company.tenant.id);
  });

  it('POST /create responde 400 y no crea nada si el correo es inválido', async () => {
    const response = await request(app)
      .post(apiPaths.contacts.create)
      .set('Cookie', salesRepCookie)
      .send({ firstName: 'Laura', lastName: 'Martínez', email: 'not-an-email' });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    await expect(prisma.contact.count()).resolves.toBe(0);
  });

  it('GET /getAll devuelve los contactos activos de la empresa', async () => {
    const firstContact = await persistContact(company.tenant.id, {
      ownerId: company.salesRep.id,
    });
    const secondContact = await persistContact(company.tenant.id, {
      ownerId: company.salesRep.id,
    });
    await persistContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      deleted: DeletedState.Inactive,
    });

    const response = await request(app).get(apiPaths.contacts.getAll).set('Cookie', salesRepCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(idsOf(response.body)).toEqual([firstContact.id, secondContact.id].sort());
  });

  it('PATCH /update/:id actualiza los campos enviados y conserva el resto', async () => {
    const contact = await persistContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      firstName: 'Laura',
      lastName: 'Martínez',
    });

    const response = await request(app)
      .patch(apiPaths.contacts.update(contact.id))
      .set('Cookie', salesRepCookie)
      .send({ lastName: 'Martínez Ruiz' });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toMatchObject({ id: contact.id, firstName: 'Laura', lastName: 'Martínez Ruiz' });
    const storedContact = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(storedContact.lastName).toBe('Martínez Ruiz');
  });

  it('GET /filtered busca, filtra y pagina dentro de la empresa', async () => {
    const companyContact = await persistCompanyContact(company.tenant.id, {
      ownerId: company.salesRep.id,
    });
    const matchingContact = await persistContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      firstName: 'Laura',
      companyId: companyContact.id,
    });
    await persistContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      firstName: 'Laura',
    });
    await persistContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      firstName: 'Pedro',
      email: 'pedro.gil@example.com',
      companyId: companyContact.id,
    });

    const response = await request(app)
      .get(apiPaths.contacts.filtered)
      .query({
        search: 'laura',
        filters: serializeFilters([{ field: 'companyId', operator: 'equals', value: companyContact.id }]),
      })
      .set('Cookie', salesRepCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(idsOf(response.body.data)).toEqual([matchingContact.id]);
    expect(response.body).toMatchObject({ total: 1, page: 1, limit: 20 });
  });

  it('GET /filtered responde 400 si los filtros no son JSON válido', async () => {
    const response = await request(app)
      .get(apiPaths.contacts.filtered)
      .query({ filters: '{broken' })
      .set('Cookie', salesRepCookie);

    expect(response.status).toBe(HTTP_BAD_REQUEST);
  });

  it('PATCH /update/:id responde 404 si el contacto no existe', async () => {
    const response = await request(app)
      .patch(apiPaths.contacts.update(NON_EXISTENT_ID))
      .set('Cookie', salesRepCookie)
      .send({ lastName: 'Ruiz' });

    expect(response.status).toBe(HTTP_NOT_FOUND);
  });

  it('POST /create no permite vincular el contacto a una empresa cliente de otro tenant', async () => {
    const otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    const foreignCompanyContact = await persistCompanyContact(otherCompany.tenant.id);

    await request(app)
      .post(apiPaths.contacts.create)
      .set('Cookie', salesRepCookie)
      .send({ firstName: 'Laura', lastName: 'Martínez', companyId: foreignCompanyContact.id });

    await expect(prisma.contact.count({ where: { companyId: foreignCompanyContact.id } })).resolves.toBe(0);
  });

  it('PATCH /update/:id no modifica un contacto borrado', async () => {
    const deletedContact = await persistContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      lastName: 'Martínez',
      deleted: DeletedState.Inactive,
    });

    await request(app)
      .patch(apiPaths.contacts.update(deletedContact.id))
      .set('Cookie', salesRepCookie)
      .send({ lastName: 'Ruiz' });

    const storedContact = await prisma.contact.findUniqueOrThrow({ where: { id: deletedContact.id } });
    expect(storedContact.lastName).toBe('Martínez');
  });
});

describe('API de empresas cliente', () => {
  it('POST /create crea la empresa cliente en el tenant del usuario y responde 201', async () => {
    const response = await request(app).post(apiPaths.companyContacts.create).set('Cookie', salesRepCookie).send({
      name: 'Constructora El Roble',
      industry: 'Construcción',
      taxNumber: '900123456',
      city: 'Bogotá',
      country: 'Colombia',
    });

    expect(response.status).toBe(HTTP_CREATED);
    expect(response.body).toMatchObject({
      name: 'Constructora El Roble',
      industry: 'Construcción',
      taxNumber: '900123456',
      city: 'Bogotá',
      country: 'Colombia',
    });
    expect(Object.keys(response.body)).not.toContain('tenantId');
    const storedCompanyContact = await prisma.companyContact.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(storedCompanyContact.tenantId).toBe(company.tenant.id);
  });

  it('POST /create responde 400 y no crea nada si falta el nombre', async () => {
    const response = await request(app)
      .post(apiPaths.companyContacts.create)
      .set('Cookie', salesRepCookie)
      .send({ city: 'Bogotá' });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    await expect(prisma.companyContact.count()).resolves.toBe(0);
  });

  it('GET /getAll devuelve las empresas cliente activas del tenant', async () => {
    const firstCompanyContact = await persistCompanyContact(company.tenant.id, {
      ownerId: company.salesRep.id,
    });
    const secondCompanyContact = await persistCompanyContact(company.tenant.id, {
      ownerId: company.salesRep.id,
    });
    await persistCompanyContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      deleted: DeletedState.Inactive,
    });

    const response = await request(app).get(apiPaths.companyContacts.getAll).set('Cookie', salesRepCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(idsOf(response.body)).toEqual([firstCompanyContact.id, secondCompanyContact.id].sort());
  });

  it('PATCH /update/:id actualiza los campos enviados y conserva el resto', async () => {
    const companyContact = await persistCompanyContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      name: 'Constructora El Roble',
      city: 'Bogotá',
    });

    const response = await request(app)
      .patch(apiPaths.companyContacts.update(companyContact.id))
      .set('Cookie', salesRepCookie)
      .send({ city: 'Medellín' });

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toMatchObject({ id: companyContact.id, name: 'Constructora El Roble', city: 'Medellín' });
    const storedCompanyContact = await prisma.companyContact.findUniqueOrThrow({ where: { id: companyContact.id } });
    expect(storedCompanyContact.city).toBe('Medellín');
  });

  it('GET /filtered busca y pagina dentro del tenant', async () => {
    await persistCompanyContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      name: 'Roble Uno',
    });
    await persistCompanyContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      name: 'Roble Dos',
    });
    await persistCompanyContact(company.tenant.id, {
      ownerId: company.salesRep.id,
      name: 'Pino Tres',
    });

    const response = await request(app)
      .get(apiPaths.companyContacts.filtered)
      .query({ search: 'roble', limit: 1 })
      .set('Cookie', salesRepCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toMatchObject({ total: 2, page: 1, limit: 1 });
    expect(response.body.data).toHaveLength(1);
  });

  it('GET /filtered responde 400 si los filtros no son JSON válido', async () => {
    const response = await request(app)
      .get(apiPaths.companyContacts.filtered)
      .query({ filters: '{broken' })
      .set('Cookie', salesRepCookie);

    expect(response.status).toBe(HTTP_BAD_REQUEST);
  });

  it('PATCH /update/:id responde 404 si la empresa cliente no existe', async () => {
    const response = await request(app)
      .patch(apiPaths.companyContacts.update(NON_EXISTENT_ID))
      .set('Cookie', salesRepCookie)
      .send({ city: 'Medellín' });

    expect(response.status).toBe(HTTP_NOT_FOUND);
  });
});
