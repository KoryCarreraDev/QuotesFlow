// F2-T05: usuarios de la empresa e invitaciones contra la API real (D-16, D-17).

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { memoryEmailOutbox } from '@/infrastructure/email/LocalEmailServices.js';
import {
  type TenantWithTeam,
  persistTenantWithTeam,
  persistUserInvitation,
  testInvitationTokenFor,
} from '@tests/support/database/persistenceFactories.js';
import { SESSION_COOKIE_NAME, sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const INVITEE_PASSWORD = 'Invited-Horse-Battery-5';
const TOKEN_IN_LINK_PATTERN = /#token=([^\s"&]+)/;

function tokenSentTo(recipient: string): string {
  const match = TOKEN_IN_LINK_PATTERN.exec(memoryEmailOutbox.sentTo(recipient).at(-1)?.text ?? '');
  return decodeURIComponent(match?.[1] ?? '');
}

describe('Usuarios de la empresa (F2-T05)', () => {
  let company: TenantWithTeam;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    memoryEmailOutbox.clear();
  });

  it('invitar → correo → aceptar → la persona entra con el rol invitado', async () => {
    const inviteeEmail = 'ana.ruiz@example.com';
    const invitation = await request(app)
      .post(apiPaths.users.invite)
      .set('Cookie', sessionCookieFor(company.salesLeader))
      .send({ email: inviteeEmail, role: Role.SALES_REP });

    const acceptance = await request(app)
      .post(apiPaths.auth.acceptInvitation)
      .send({ token: tokenSentTo(inviteeEmail), password: INVITEE_PASSWORD, firstName: 'Ana', lastName: 'Ruiz' });

    expect(invitation.status).toBe(HTTP_CREATED);
    expect(acceptance.status).toBe(HTTP_CREATED);
    expect(String(acceptance.headers['set-cookie'])).toContain(`${SESSION_COOKIE_NAME}=`);
    const createdUser = await prisma.user.findUniqueOrThrow({ where: { email: inviteeEmail } });
    expect(createdUser).toMatchObject({ role: Role.SALES_REP, tenantId: company.tenant.id });
    expect(createdUser.emailVerifiedAt).not.toBeNull();
  });

  it('el líder comercial no invita socios (D-17)', async () => {
    const response = await request(app)
      .post(apiPaths.users.invite)
      .set('Cookie', sessionCookieFor(company.salesLeader))
      .send({ email: 'socia@example.com', role: Role.PARTNER });

    expect(response.status).toBe(HTTP_FORBIDDEN);
    await expect(prisma.userInvitation.count()).resolves.toBe(0);
  });

  it('el rol OWNER no se puede invitar: lo rechaza la validación', async () => {
    const response = await request(app)
      .post(apiPaths.users.invite)
      .set('Cookie', sessionCookieFor(company.owner))
      .send({ email: 'otro.dueno@example.com', role: Role.OWNER });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
  });

  it('invitar un correo que ya tiene cuenta responde 409', async () => {
    const response = await request(app)
      .post(apiPaths.users.invite)
      .set('Cookie', sessionCookieFor(company.owner))
      .send({ email: company.salesRep.email, role: Role.SALES_REP });

    expect(response.status).toBe(HTTP_CONFLICT);
    expect(response.body.error.code).toBe(ErrorCode.EMAIL_ALREADY_IN_USE);
  });

  it('desactivar a un comercial le quita el acceso en la siguiente petición', async () => {
    const repCookie = sessionCookieFor(company.salesRep);

    const response = await request(app)
      .patch(apiPaths.users.update(company.salesRep.id))
      .set('Cookie', sessionCookieFor(company.salesLeader))
      .send({ isActive: false });
    const afterDeactivation = await request(app).get(apiPaths.leads.getAll).set('Cookie', repCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toMatchObject({ id: company.salesRep.id, isActive: false });
    expect(afterDeactivation.status).toBe(HTTP_UNAUTHORIZED);
  });

  it('el líder comercial no desactiva al socio', async () => {
    const response = await request(app)
      .patch(apiPaths.users.update(company.partner.id))
      .set('Cookie', sessionCookieFor(company.salesLeader))
      .send({ isActive: false });

    expect(response.status).toBe(HTTP_FORBIDDEN);
  });

  it('nadie se desactiva a sí mismo', async () => {
    const response = await request(app)
      .patch(apiPaths.users.update(company.owner.id))
      .set('Cookie', sessionCookieFor(company.owner))
      .send({ isActive: false });

    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(response.body.error.code).toBe(ErrorCode.CANNOT_MANAGE_OWN_ACCOUNT);
  });

  it('un cambio sin rol ni estado responde 400', async () => {
    const response = await request(app)
      .patch(apiPaths.users.update(company.salesRep.id))
      .set('Cookie', sessionCookieFor(company.owner))
      .send({});

    expect(response.status).toBe(HTTP_BAD_REQUEST);
  });

  it('el listado de usuarios no lleva hashes ni datos del bloqueo', async () => {
    const response = await request(app).get(apiPaths.users.getAll).set('Cookie', sessionCookieFor(company.owner));

    expect(response.status).toBe(HTTP_OK);
    expect(response.body[0]).not.toHaveProperty('passwordHash');
    expect(response.body[0]).not.toHaveProperty('failedLoginAttempts');
  });

  it('una invitación revocada no se acepta', async () => {
    const invitation = await persistUserInvitation(company.tenant.id, company.owner.id);
    await request(app)
      .delete(apiPaths.users.revokeInvitation(invitation.id))
      .set('Cookie', sessionCookieFor(company.owner));

    const acceptance = await request(app)
      .post(apiPaths.auth.acceptInvitation)
      .send({
        token: testInvitationTokenFor(invitation.id),
        password: INVITEE_PASSWORD,
        firstName: 'A',
        lastName: 'B',
      });

    expect(acceptance.status).toBe(HTTP_BAD_REQUEST);
    expect(acceptance.body.error.code).toBe(ErrorCode.INVALID_ACCOUNT_TOKEN);
  });

  it('una invitación de otra empresa no se puede revocar: 404', async () => {
    const otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    const foreignInvitation = await persistUserInvitation(otherCompany.tenant.id, otherCompany.owner.id);

    const response = await request(app)
      .delete(apiPaths.users.revokeInvitation(foreignInvitation.id))
      .set('Cookie', sessionCookieFor(company.owner));

    expect(response.status).toBe(HTTP_NOT_FOUND);
    const storedInvitation = await prisma.userInvitation.findUniqueOrThrow({ where: { id: foreignInvitation.id } });
    expect(storedInvitation.revokedAt).toBeNull();
  });
});
