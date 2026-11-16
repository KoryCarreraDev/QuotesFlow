import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '@/app.js';
import { defaultLeadStatuses } from '@/application/constants/defaultLeadStatuses.js';
import prisma from '@/config/database.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { Role } from '@/domain/enums/Role.js';
import { PrismaLeadStatusConfigRepository } from '@/infrastructure/persistence/repositories/PrismaLeadStatusConfig.js';
import {
  TEST_USER_PASSWORD,
  persistTenant,
  persistTenantWithTeam,
  persistUser,
} from '@tests/support/database/persistenceFactories.js';
import { SESSION_COOKIE_NAME } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';
import { itKnownDefect } from '@tests/support/knownDefect.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const STATUS_CREATIONS_BEFORE_FAILURE = 2;
const FIRST_ERROR_STATUS = 400;

const STACK_TRACE_LINE_PATTERN = /\bat .+:\d+:\d+/;

const registration = {
  companyName: 'Aluminios Andinos SAS',
  ownerEmail: 'owner@example.com',
  password: TEST_USER_PASSWORD,
  ownerFirstName: 'Carlos',
  ownerLastName: 'Pérez',
};

function findSessionCookie(setCookieHeader: string | string[] | undefined): string | undefined {
  const cookies = setCookieHeader === undefined ? [] : [setCookieHeader].flat();
  return cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
}

describe('POST /api/auth/register', () => {
  it('crea la empresa y su dueño, y responde 201 con ambos ids', async () => {
    const response = await request(app).post(apiPaths.auth.register).send(registration);

    expect(response.status).toBe(HTTP_CREATED);
    const createdTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: response.body.tenantId } });
    const createdOwner = await prisma.user.findUniqueOrThrow({ where: { id: response.body.ownerId } });
    expect(createdTenant.name).toBe('Aluminios Andinos SAS');
    expect(createdOwner).toMatchObject({
      email: 'owner@example.com',
      firstName: 'Carlos',
      lastName: 'Pérez',
      role: Role.OWNER,
      isActive: true,
      tenantId: createdTenant.id,
    });
  });

  it('guarda la contraseña con hash y no la devuelve en la respuesta', async () => {
    const response = await request(app).post(apiPaths.auth.register).send(registration);

    const createdOwner = await prisma.user.findUniqueOrThrow({ where: { id: response.body.ownerId } });
    expect(createdOwner.passwordHash).not.toBe(TEST_USER_PASSWORD);
    expect(response.text).not.toContain(TEST_USER_PASSWORD);
    expect(response.text).not.toContain(createdOwner.passwordHash);
  });

  it('deja a la empresa nueva con los cinco estados de lead por defecto', async () => {
    const response = await request(app).post(apiPaths.auth.register).send(registration);

    const createdStatuses = await prisma.leadStatusConfig.findMany({
      where: { tenantId: response.body.tenantId },
      orderBy: { order: 'asc' },
    });
    expect(createdStatuses.map((status) => status.name)).toEqual(defaultLeadStatuses.map((status) => status.name));
    expect(createdStatuses.filter((status) => status.isDefault).map((status) => status.name)).toEqual(['Nuevo']);
  });

  it('ignora el rol y el tenant que envíe el cliente: el registro siempre crea un OWNER en una empresa nueva', async () => {
    const existingTenant = await persistTenant();

    const response = await request(app)
      .post(apiPaths.auth.register)
      .send({ ...registration, role: Role.SALES_REP, tenantId: existingTenant.id });

    const createdOwner = await prisma.user.findUniqueOrThrow({ where: { id: response.body.ownerId } });
    expect(createdOwner.role).toBe(Role.OWNER);
    expect(createdOwner.tenantId).not.toBe(existingTenant.id);
  });

  it('responde 400 y no crea nada si el cuerpo es inválido', async () => {
    const response = await request(app)
      .post(apiPaths.auth.register)
      .send({ ...registration, ownerEmail: 'not-an-email' });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.details).toBeInstanceOf(Array);
    await expect(prisma.tenant.count()).resolves.toBe(0);
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('rechaza un correo ya registrado y no crea una segunda empresa', async () => {
    await request(app).post(apiPaths.auth.register).send(registration);

    const response = await request(app)
      .post(apiPaths.auth.register)
      .send({ ...registration, companyName: 'Otra Empresa SAS' });

    expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
    await expect(prisma.tenant.count()).resolves.toBe(1);
    await expect(prisma.user.count()).resolves.toBe(1);
  });
});

describe('POST /api/auth/login', () => {
  it('con credenciales correctas responde 200 y emite la cookie de sesión', async () => {
    const company = await persistTenantWithTeam();

    const response = await request(app)
      .post(apiPaths.auth.login)
      .send({ email: company.owner.email, password: TEST_USER_PASSWORD });

    expect(response.status).toBe(HTTP_OK);
    expect(findSessionCookie(response.headers['set-cookie'])).toBeDefined();
  });

  it('la cookie de sesión es HttpOnly y SameSite=Strict, y el token no viaja en el cuerpo', async () => {
    const company = await persistTenantWithTeam();

    const response = await request(app)
      .post(apiPaths.auth.login)
      .send({ email: company.owner.email, password: TEST_USER_PASSWORD });

    const sessionCookie = findSessionCookie(response.headers['set-cookie']) ?? '';
    const [cookieNameAndValue] = sessionCookie.split(';');
    const sessionToken = cookieNameAndValue.replace(`${SESSION_COOKIE_NAME}=`, '');
    expect(sessionCookie).toMatch(/;\s*HttpOnly/i);
    expect(sessionCookie).toMatch(/;\s*SameSite=Strict/i);
    expect(sessionCookie).toMatch(/;\s*Path=\//i);
    expect(response.text).not.toContain(sessionToken);
  });

  it('la cookie emitida da acceso a las rutas protegidas, dentro de la empresa del usuario', async () => {
    const company = await persistTenantWithTeam();
    const loginResponse = await request(app)
      .post(apiPaths.auth.login)
      .send({ email: company.owner.email, password: TEST_USER_PASSWORD });
    const [sessionCookie] = (findSessionCookie(loginResponse.headers['set-cookie']) ?? '').split(';');

    const response = await request(app).get(apiPaths.leadStatusConfigs.getAll).set('Cookie', sessionCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toHaveLength(company.leadStatuses.length);
  });

  it('con contraseña incorrecta no emite cookie de sesión', async () => {
    const company = await persistTenantWithTeam();

    const response = await request(app)
      .post(apiPaths.auth.login)
      .send({ email: company.owner.email, password: 'Wrong-Password-000' });

    expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
    expect(findSessionCookie(response.headers['set-cookie'])).toBeUndefined();
  });

  it('con un correo desconocido no emite cookie de sesión', async () => {
    const response = await request(app)
      .post(apiPaths.auth.login)
      .send({ email: 'unknown@example.com', password: TEST_USER_PASSWORD });

    expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
    expect(findSessionCookie(response.headers['set-cookie'])).toBeUndefined();
  });

  it('responde 400 si el cuerpo es inválido', async () => {
    const response = await request(app).post(apiPaths.auth.login).send({ email: 'not-an-email' });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
  });

  it('un login fallido responde 401, sin traza de error en el cuerpo', async () => {
    const response = await request(app)
      .post(apiPaths.auth.login)
      .send({ email: 'unknown@example.com', password: TEST_USER_PASSWORD });

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    expect(response.text).not.toMatch(STACK_TRACE_LINE_PATTERN);
  });

  itKnownDefect('H3', 'un usuario desactivado no puede iniciar sesión', async () => {
    const tenant = await persistTenant();
    const inactiveUser = await persistUser(tenant.id, { isActive: false });

    const response = await request(app)
      .post(apiPaths.auth.login)
      .send({ email: inactiveUser.email, password: TEST_USER_PASSWORD });

    expect(findSessionCookie(response.headers['set-cookie'])).toBeUndefined();
  });

  itKnownDefect('H3', 'un usuario borrado no puede iniciar sesión', async () => {
    const tenant = await persistTenant();
    const deletedUser = await persistUser(tenant.id, { deleted: DeletedState.Inactive });

    const response = await request(app)
      .post(apiPaths.auth.login)
      .send({ email: deletedUser.email, password: TEST_USER_PASSWORD });

    expect(findSessionCookie(response.headers['set-cookie'])).toBeUndefined();
  });

  itKnownDefect('H3', 'un usuario de una empresa borrada no puede iniciar sesión', async () => {
    const deletedTenant = await persistTenant({ deleted: DeletedState.Inactive });
    const user = await persistUser(deletedTenant.id);

    const response = await request(app)
      .post(apiPaths.auth.login)
      .send({ email: user.email, password: TEST_USER_PASSWORD });

    expect(findSessionCookie(response.headers['set-cookie'])).toBeUndefined();
  });
});

// Regresión de H8: empresa, dueño y estados se escribían por separado.
describe('POST /api/auth/register es atómico', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('si falla la creación de un estado, no queda ni la empresa, ni el dueño, ni los estados ya creados', async () => {
    const originalCreate = PrismaLeadStatusConfigRepository.prototype.create;
    let statusCreations = 0;
    vi.spyOn(PrismaLeadStatusConfigRepository.prototype, 'create').mockImplementation(async function (
      this: PrismaLeadStatusConfigRepository,
      status,
    ) {
      statusCreations += 1;
      if (statusCreations > STATUS_CREATIONS_BEFORE_FAILURE) throw new Error('simulated database failure');
      return originalCreate.call(this, status);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).post(apiPaths.auth.register).send(registration);

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    await expect(prisma.tenant.count()).resolves.toBe(0);
    await expect(prisma.user.count()).resolves.toBe(0);
    await expect(prisma.leadStatusConfig.count()).resolves.toBe(0);
  });

  it('dos registros simultáneos con el mismo correo crean una sola empresa y el otro recibe 409', async () => {
    const [firstResponse, secondResponse] = await Promise.all([
      request(app).post(apiPaths.auth.register).send(registration),
      request(app)
        .post(apiPaths.auth.register)
        .send({ ...registration, companyName: 'Otra Empresa SAS' }),
    ]);

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([HTTP_CREATED, HTTP_CONFLICT]);
    await expect(prisma.tenant.count()).resolves.toBe(1);
    await expect(prisma.user.count()).resolves.toBe(1);
  });
});
