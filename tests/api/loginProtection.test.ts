// F2-T03: bloqueo progresivo por cuenta, respuestas genéricas y política de contraseñas, contra la API real.

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { FAILED_LOGINS_BEFORE_LOCK } from '@/domain/value-objects/loginLockout.js';
import {
  TEST_USER_PASSWORD,
  type TenantWithTeam,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { SESSION_COOKIE_NAME } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const WRONG_PASSWORD = 'Wrong-Horse-Battery-0';
const ATTEMPTS_THAT_LOCK = FAILED_LOGINS_BEFORE_LOCK + 1;

function login(email: string, password: string) {
  return request(app).post(apiPaths.auth.login).send({ email, password });
}

async function failLogins(email: string, times: number) {
  for (let attempt = 0; attempt < times; attempt += 1) await login(email, WRONG_PASSWORD);
}

describe('Protección del login (F2-T03)', () => {
  let company: TenantWithTeam;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
  });

  it('tras 5 fallos seguidos ni la contraseña correcta entra, y no se emite cookie', async () => {
    await failLogins(company.owner.email, ATTEMPTS_THAT_LOCK);

    const response = await login(company.owner.email, TEST_USER_PASSWORD);

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    expect(String(response.headers['set-cookie'] ?? '')).not.toContain(`${SESSION_COOKIE_NAME}=`);
    const lockedUser = await prisma.user.findUniqueOrThrow({ where: { id: company.owner.id } });
    expect(lockedUser.loginLockedUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it('cuenta bloqueada, correo inexistente y contraseña incorrecta responden exactamente igual', async () => {
    await failLogins(company.owner.email, ATTEMPTS_THAT_LOCK);

    const lockedAccount = await login(company.owner.email, TEST_USER_PASSWORD);
    const unknownEmail = await login('nobody@example.com', TEST_USER_PASSWORD);
    const wrongPassword = await login(company.partner.email, WRONG_PASSWORD);

    const responses = [lockedAccount, unknownEmail, wrongPassword].map((response) => ({
      status: response.status,
      body: response.body,
    }));
    expect(responses).toEqual([
      {
        status: HTTP_UNAUTHORIZED,
        body: { error: { code: ErrorCode.INVALID_CREDENTIALS, message: 'Invalid Credentials' } },
      },
      {
        status: HTTP_UNAUTHORIZED,
        body: { error: { code: ErrorCode.INVALID_CREDENTIALS, message: 'Invalid Credentials' } },
      },
      {
        status: HTTP_UNAUTHORIZED,
        body: { error: { code: ErrorCode.INVALID_CREDENTIALS, message: 'Invalid Credentials' } },
      },
    ]);
  });

  it('el bloqueo es por cuenta: otro usuario de la misma IP sigue entrando', async () => {
    await failLogins(company.owner.email, ATTEMPTS_THAT_LOCK);

    const response = await login(company.partner.email, TEST_USER_PASSWORD);

    expect(response.status).toBe(HTTP_OK);
  });

  it('el bloqueo y los intentos rechazados quedan en auditoría', async () => {
    await failLogins(company.owner.email, ATTEMPTS_THAT_LOCK);
    await login(company.owner.email, TEST_USER_PASSWORD);

    const actions = (await prisma.auditLog.findMany({ where: { userId: company.owner.id } })).map(
      (entry) => entry.action,
    );
    expect(actions).toContain('ACCOUNT_LOCKED');
    expect(actions).toContain('LOGIN_REJECTED_ACCOUNT_LOCKED');
  });

  it('un acierto antes del bloqueo pone el contador a cero', async () => {
    await failLogins(company.owner.email, FAILED_LOGINS_BEFORE_LOCK);

    await login(company.owner.email, TEST_USER_PASSWORD);

    const storedUser = await prisma.user.findUniqueOrThrow({ where: { id: company.owner.id } });
    expect(storedUser.failedLoginAttempts).toBe(0);
  });
});

describe('Política de contraseñas en el registro (D-11, H7)', () => {
  it('una contraseña de menos de 12 caracteres responde 400 en el campo password y no crea nada', async () => {
    const response = await request(app).post(apiPaths.auth.register).send({
      companyName: 'Aluminios Andinos SAS',
      ownerEmail: 'owner@example.com',
      password: 'Corta-11abc',
      ownerFirstName: 'Carlos',
      ownerLastName: 'Pérez',
    });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.details).toEqual([expect.objectContaining({ path: ['password'] })]);
    await expect(prisma.tenant.count()).resolves.toBe(0);
  });

  it('el correo como contraseña responde 400 PASSWORD_TOO_WEAK', async () => {
    const ownerEmail = 'owner.largo@example.com';

    const response = await request(app).post(apiPaths.auth.register).send({
      companyName: 'Aluminios Andinos SAS',
      ownerEmail,
      password: ownerEmail,
      ownerFirstName: 'Carlos',
      ownerLastName: 'Pérez',
    });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe(ErrorCode.PASSWORD_TOO_WEAK);
  });
});
