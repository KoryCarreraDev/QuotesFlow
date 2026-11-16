// Formato único de error (F1-T02, H5): `{ error: { code, message, details? } }`, con el código HTTP
// que corresponde a cada tipo de error y sin trazas. Los códigos son estables y en inglés (Q-003).

import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import {
  TEST_USER_PASSWORD,
  type TenantWithTeam,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { buildSessionCookie, serializeFilters, sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const STACK_TRACE_LINE_PATTERN = /\n\s+at /;
const UNUSED_STATUS_ORDER = 9;

function expectErrorResponse(response: request.Response, status: number, code: ErrorCode): void {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(response.body).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) });
  expect(response.text).not.toMatch(STACK_TRACE_LINE_PATTERN);
}

describe('respuestas de error', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
  });

  describe('autenticación', () => {
    it('credenciales incorrectas responden 401 INVALID_CREDENTIALS', async () => {
      const response = await request(app)
        .post(apiPaths.auth.login)
        .send({ email: company.owner.email, password: `${TEST_USER_PASSWORD}-wrong` });

      expectErrorResponse(response, HTTP_UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS);
    });

    it('una ruta protegida sin cookie responde 401 SESSION_REQUIRED', async () => {
      const response = await request(app).get(apiPaths.leads.getAll);

      expectErrorResponse(response, HTTP_UNAUTHORIZED, ErrorCode.SESSION_REQUIRED);
    });

    it('un token firmado con otro secreto responde 401 INVALID_SESSION', async () => {
      const forgedToken = jwt.sign(
        { sub: company.owner.id, tenantId: company.tenant.id, role: Role.OWNER },
        'secret-that-is-not-the-server-secret',
      );

      const response = await request(app).get(apiPaths.leads.getAll).set('Cookie', buildSessionCookie(forgedToken));

      expectErrorResponse(response, HTTP_UNAUTHORIZED, ErrorCode.INVALID_SESSION);
    });

    it('registrar un correo que ya existe responde 409 EMAIL_ALREADY_IN_USE', async () => {
      const response = await request(app).post(apiPaths.auth.register).send({
        companyName: 'Otra Empresa SAS',
        ownerEmail: company.owner.email,
        password: TEST_USER_PASSWORD,
        ownerFirstName: 'Ana',
        ownerLastName: 'Gómez',
      });

      expectErrorResponse(response, HTTP_CONFLICT, ErrorCode.EMAIL_ALREADY_IN_USE);
    });
  });

  describe('recursos y permisos', () => {
    it('un lead que no existe responde 404 LEAD_NOT_FOUND', async () => {
      const response = await request(app).delete(apiPaths.leads.delete(NON_EXISTENT_ID)).set('Cookie', ownerCookie);

      expectErrorResponse(response, HTTP_NOT_FOUND, ErrorCode.LEAD_NOT_FOUND);
    });

    it('un comercial que intenta crear un estado responde 403 INSUFFICIENT_PERMISSIONS', async () => {
      const response = await request(app)
        .post(apiPaths.leadStatusConfigs.create)
        .set('Cookie', sessionCookieFor(company.salesRep))
        .send({ name: 'Negociación', order: UNUSED_STATUS_ORDER });

      expectErrorResponse(response, HTTP_FORBIDDEN, ErrorCode.INSUFFICIENT_PERMISSIONS);
    });

    it('crear un lead con un estado que no es de la empresa responde 400 INVALID_LEAD_STATUS', async () => {
      const response = await request(app)
        .post(apiPaths.leads.create)
        .set('Cookie', ownerCookie)
        .send({ contactName: 'Ana Gómez', statusId: NON_EXISTENT_ID });

      expectErrorResponse(response, HTTP_BAD_REQUEST, ErrorCode.INVALID_LEAD_STATUS);
    });

    it('asignar un lead a un usuario que no es de la empresa responde 400 ASSIGNED_USER_NOT_FOUND', async () => {
      const response = await request(app)
        .post(apiPaths.leads.create)
        .set('Cookie', ownerCookie)
        .send({ contactName: 'Ana Gómez', assignedToId: NON_EXISTENT_ID });

      expectErrorResponse(response, HTTP_BAD_REQUEST, ErrorCode.ASSIGNED_USER_NOT_FOUND);
    });
  });

  describe('entrada inválida', () => {
    it('un cuerpo que no cumple el esquema responde 400 VALIDATION_FAILED con el detalle por campo', async () => {
      const response = await request(app).post(apiPaths.leads.create).set('Cookie', ownerCookie).send({});

      expectErrorResponse(response, HTTP_BAD_REQUEST, ErrorCode.VALIDATION_FAILED);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['contactName'] })]),
      );
    });

    it('un JSON mal formado responde 400 MALFORMED_JSON', async () => {
      const response = await request(app)
        .post(apiPaths.auth.login)
        .set('Content-Type', 'application/json')
        .send('{"email": "owner@example.com",');

      expectErrorResponse(response, HTTP_BAD_REQUEST, ErrorCode.MALFORMED_JSON);
    });

    it('un parámetro filters que no es JSON responde 400 INVALID_FILTERS_FORMAT', async () => {
      const response = await request(app)
        .get(apiPaths.leads.filtered)
        .query({ filters: 'not-json' })
        .set('Cookie', ownerCookie);

      expectErrorResponse(response, HTTP_BAD_REQUEST, ErrorCode.INVALID_FILTERS_FORMAT);
    });

    it('filtrar por un campo fuera de la lista blanca responde 400 FILTER_FIELD_NOT_ALLOWED', async () => {
      const response = await request(app)
        .get(apiPaths.contacts.filtered)
        .query({ filters: serializeFilters([{ field: 'tenantId', operator: 'equals', value: company.tenant.id }]) })
        .set('Cookie', ownerCookie);

      expectErrorResponse(response, HTTP_BAD_REQUEST, ErrorCode.FILTER_FIELD_NOT_ALLOWED);
    });

    it('un operador no permitido para el campo responde 400 FILTER_OPERATOR_NOT_ALLOWED', async () => {
      const response = await request(app)
        .get(apiPaths.companyContacts.filtered)
        .query({ filters: serializeFilters([{ field: 'name', operator: 'gt', value: 'A' }]) })
        .set('Cookie', ownerCookie);

      expectErrorResponse(response, HTTP_BAD_REQUEST, ErrorCode.FILTER_OPERATOR_NOT_ALLOWED);
    });
  });

  it('una ruta que no existe responde 404 ROUTE_NOT_FOUND en JSON', async () => {
    const response = await request(app).get('/api/route-that-does-not-exist');

    expectErrorResponse(response, HTTP_NOT_FOUND, ErrorCode.ROUTE_NOT_FOUND);
  });
});
