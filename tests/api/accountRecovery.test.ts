// F2-T04: verificación de correo (D-12) y recuperación de contraseña de extremo a extremo. Los correos quedan
// en `memoryEmailOutbox` (EMAIL_PROVIDER=memory) y de ahí se saca el token del enlace, como haría el usuario.

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { memoryEmailOutbox } from '@/infrastructure/email/LocalEmailServices.js';
import {
  TEST_USER_PASSWORD,
  type TenantWithTeam,
  persistTenantWithTeam,
  testSessionIdFor,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_OK = 200;
const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const NEW_PASSWORD = 'Brand-New-Horse-Battery-7';
const TOKEN_IN_LINK_PATTERN = /#token=([^\s"&]+)/;

const registration = {
  companyName: 'Vidrios del Norte SAS',
  ownerEmail: 'nuevo.dueno@example.com',
  password: TEST_USER_PASSWORD,
  ownerFirstName: 'Lucía',
  ownerLastName: 'Rojas',
};

function tokenSentTo(recipient: string): string {
  const lastEmail = memoryEmailOutbox.sentTo(recipient).at(-1);
  const match = lastEmail ? TOKEN_IN_LINK_PATTERN.exec(lastEmail.text) : null;
  if (!match) throw new Error(`No link was sent to ${recipient}`);
  return decodeURIComponent(match[1]);
}

function login(email: string, password: string) {
  return request(app).post(apiPaths.auth.login).send({ email, password });
}

beforeEach(() => {
  memoryEmailOutbox.clear();
});

describe('Verificación de correo (D-12)', () => {
  // Verificación de extremo a extremo de F2 (sección 10 de PLAN.md): registro → correo → verificación → login.
  it('registro → correo de verificación → verificar → login', async () => {
    await request(app).post(apiPaths.auth.register).send(registration);
    const loginBeforeVerifying = await login(registration.ownerEmail, registration.password);

    const verification = await request(app)
      .post(apiPaths.auth.verifyEmail)
      .send({ token: tokenSentTo(registration.ownerEmail) });
    const loginAfterVerifying = await login(registration.ownerEmail, registration.password);

    expect(loginBeforeVerifying.status).toBe(HTTP_FORBIDDEN);
    expect(loginBeforeVerifying.body.error.code).toBe(ErrorCode.EMAIL_NOT_VERIFIED);
    expect(verification.status).toBe(HTTP_OK);
    expect(loginAfterVerifying.status).toBe(HTTP_OK);
  });

  it('el envío queda en EmailLog sin el token del enlace', async () => {
    await request(app).post(apiPaths.auth.register).send(registration);

    const [emailLog] = await prisma.emailLog.findMany();
    expect(emailLog).toMatchObject({
      template: 'EMAIL_VERIFICATION',
      recipient: registration.ownerEmail,
      status: 'SENT',
    });
    expect(JSON.stringify(emailLog)).not.toContain(tokenSentTo(registration.ownerEmail).split('.')[1]);
  });

  it('el token se guarda solo como hash', async () => {
    await request(app).post(apiPaths.auth.register).send(registration);
    const [, secret] = tokenSentTo(registration.ownerEmail).split('.');

    const [storedToken] = await prisma.accountToken.findMany();
    expect(storedToken.tokenHash).not.toContain(secret);
  });

  it('un token inválido responde 400 INVALID_ACCOUNT_TOKEN', async () => {
    const response = await request(app).post(apiPaths.auth.verifyEmail).send({ token: 'inventado.c2VjcmV0' });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe(ErrorCode.INVALID_ACCOUNT_TOKEN);
  });

  it('reenviar responde igual para un correo inexistente y para uno pendiente, y solo envía al pendiente', async () => {
    await request(app).post(apiPaths.auth.register).send(registration);
    memoryEmailOutbox.clear();
    await prisma.accountToken.updateMany({ data: { createdAt: new Date(0) } });

    const pending = await request(app)
      .post(apiPaths.auth.resendEmailVerification)
      .send({ email: registration.ownerEmail });
    const unknown = await request(app).post(apiPaths.auth.resendEmailVerification).send({ email: 'nadie@example.com' });

    expect([pending.status, pending.body]).toEqual([unknown.status, unknown.body]);
    expect(pending.status).toBe(HTTP_ACCEPTED);
    expect(memoryEmailOutbox.sentTo(registration.ownerEmail)).toHaveLength(1);
  });
});

describe('Recuperación de contraseña', () => {
  let company: TenantWithTeam;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
  });

  it('pedirla responde igual exista o no el correo', async () => {
    const existing = await request(app).post(apiPaths.auth.forgotPassword).send({ email: company.owner.email });
    const unknown = await request(app).post(apiPaths.auth.forgotPassword).send({ email: 'nadie@example.com' });

    expect([existing.status, existing.body]).toEqual([HTTP_ACCEPTED, { status: 'ACCEPTED' }]);
    expect([unknown.status, unknown.body]).toEqual([HTTP_ACCEPTED, { status: 'ACCEPTED' }]);
    expect(memoryEmailOutbox.sentTo(company.owner.email)).toHaveLength(1);
  });

  it('con el enlace elige una contraseña nueva: la nueva entra y la anterior no', async () => {
    await request(app).post(apiPaths.auth.forgotPassword).send({ email: company.owner.email });

    const reset = await request(app)
      .post(apiPaths.auth.resetPassword)
      .send({ token: tokenSentTo(company.owner.email), password: NEW_PASSWORD });

    expect(reset.status).toBe(HTTP_OK);
    expect((await login(company.owner.email, NEW_PASSWORD)).status).toBe(HTTP_OK);
    expect((await login(company.owner.email, TEST_USER_PASSWORD)).status).toBe(HTTP_UNAUTHORIZED);
  });

  it('cambiar la contraseña cierra las sesiones abiertas y avisa por correo', async () => {
    const openSessionCookie = sessionCookieFor(company.owner);
    await request(app).post(apiPaths.auth.forgotPassword).send({ email: company.owner.email });

    await request(app)
      .post(apiPaths.auth.resetPassword)
      .send({ token: tokenSentTo(company.owner.email), password: NEW_PASSWORD });

    const withOldSession = await request(app).get(apiPaths.leads.getAll).set('Cookie', openSessionCookie);
    expect(withOldSession.status).toBe(HTTP_UNAUTHORIZED);
    const session = await prisma.userSession.findUniqueOrThrow({ where: { id: testSessionIdFor(company.owner.id) } });
    expect(session.revokedReason).toBe('PASSWORD_CHANGED');
    expect(memoryEmailOutbox.sentTo(company.owner.email).at(-1)?.subject).toBe('Tu contraseña de QuotesFlow cambió');
  });

  it('la contraseña nueva cumple la política (D-11)', async () => {
    await request(app).post(apiPaths.auth.forgotPassword).send({ email: company.owner.email });

    const response = await request(app)
      .post(apiPaths.auth.resetPassword)
      .send({ token: tokenSentTo(company.owner.email), password: 'corta' });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.details).toEqual([expect.objectContaining({ path: ['password'] })]);
  });

  it('el enlace sirve una sola vez', async () => {
    await request(app).post(apiPaths.auth.forgotPassword).send({ email: company.owner.email });
    const token = tokenSentTo(company.owner.email);
    await request(app).post(apiPaths.auth.resetPassword).send({ token, password: NEW_PASSWORD });

    const secondUse = await request(app)
      .post(apiPaths.auth.resetPassword)
      .send({ token, password: 'Another-New-Horse-Battery-8' });

    expect(secondUse.status).toBe(HTTP_BAD_REQUEST);
    expect(secondUse.body.error.code).toBe(ErrorCode.INVALID_ACCOUNT_TOKEN);
  });

  it('pedir recuperación y cambiarla queda en auditoría', async () => {
    await request(app).post(apiPaths.auth.forgotPassword).send({ email: company.owner.email });
    await request(app)
      .post(apiPaths.auth.resetPassword)
      .send({ token: tokenSentTo(company.owner.email), password: NEW_PASSWORD });

    const actions = (await prisma.auditLog.findMany({ where: { userId: company.owner.id } })).map(
      (entry) => entry.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED']));
  });
});
