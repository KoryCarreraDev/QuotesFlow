import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import {
  type TenantWithTeam,
  persistCompanyContact,
  persistContact,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F1-T16: borrado suave de contactos y empresas cliente.

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

describe('borrado de contactos y empresas cliente', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
  });

  it('POST /api/contact/delete/:id borra de forma suave: deja de listarse y la fila se conserva', async () => {
    const contact = await persistContact(company.tenant.id);

    const response = await request(app).post(apiPaths.contacts.delete(contact.id)).set('Cookie', ownerCookie);
    const listResponse = await request(app).get(apiPaths.contacts.getAll).set('Cookie', ownerCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(listResponse.body.map((listed: { id: string }) => listed.id)).not.toContain(contact.id);
    const stored = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(stored.deleted).toBe(DeletedState.INACTIVE);
  });

  it('borrar dos veces el mismo contacto responde 404 la segunda vez', async () => {
    const contact = await persistContact(company.tenant.id);
    await request(app).post(apiPaths.contacts.delete(contact.id)).set('Cookie', ownerCookie);

    const response = await request(app).post(apiPaths.contacts.delete(contact.id)).set('Cookie', ownerCookie);

    expect(response.status).toBe(HTTP_NOT_FOUND);
  });

  it('un comercial no puede borrar contactos: 403', async () => {
    const contact = await persistContact(company.tenant.id);

    const response = await request(app)
      .post(apiPaths.contacts.delete(contact.id))
      .set('Cookie', sessionCookieFor(company.salesRep));

    expect(response.status).toBe(HTTP_FORBIDDEN);
  });

  it('POST /api/companyContact/delete/:id borra una empresa cliente sin contactos', async () => {
    const companyContact = await persistCompanyContact(company.tenant.id);

    const response = await request(app)
      .post(apiPaths.companyContacts.delete(companyContact.id))
      .set('Cookie', ownerCookie);

    expect(response.status).toBe(HTTP_OK);
    const stored = await prisma.companyContact.findUniqueOrThrow({ where: { id: companyContact.id } });
    expect(stored.deleted).toBe(DeletedState.INACTIVE);
  });

  it('una empresa cliente con contactos activos no se borra: 409 COMPANY_CONTACT_HAS_CONTACTS', async () => {
    const companyContact = await persistCompanyContact(company.tenant.id);
    await persistContact(company.tenant.id, { companyId: companyContact.id });

    const response = await request(app)
      .post(apiPaths.companyContacts.delete(companyContact.id))
      .set('Cookie', ownerCookie);

    expect(response.status).toBe(HTTP_CONFLICT);
    expect(response.body.error.code).toBe(ErrorCode.COMPANY_CONTACT_HAS_CONTACTS);
  });

  it('un contacto no se puede vincular a una empresa cliente borrada: 400 INVALID_COMPANY_CONTACT', async () => {
    const deletedCompanyContact = await persistCompanyContact(company.tenant.id, { deleted: DeletedState.INACTIVE });

    const response = await request(app)
      .post(apiPaths.contacts.create)
      .set('Cookie', ownerCookie)
      .send({ firstName: 'Laura', lastName: 'Martínez', companyId: deletedCompanyContact.id });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe(ErrorCode.INVALID_COMPANY_CONTACT);
  });
});
