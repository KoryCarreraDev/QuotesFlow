import { describe, expect, it, vi } from 'vitest';
import { defaultLeadStatuses } from '@/application/constants/defaultLeadStatuses.js';
import { RegisterCompanyDTO } from '@/application/dtos/RegisterCompanyDTO.js';
import { LoginUseCase } from '@/application/use-case/auth/LoginUseCase.js';
import { hashOpaqueSecret } from '@/application/services/opaqueTokens.js';
import { SessionIssuer } from '@/application/services/SessionIssuer.js';
import { PasswordPolicy } from '@/application/services/PasswordPolicy.js';
import { FakeBreachedPasswordChecker } from '@tests/support/doubles/FakeBreachedPasswordChecker.js';
import { createAccountMailing } from '@tests/support/doubles/accountMailing.js';
import { InMemorySessionRepository } from '@tests/support/doubles/InMemorySessionRepository.js';
import { RegisterCompanyAndOwnerUseCase } from '@/application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { DEFAULT_TEST_TENANT_ID, buildUser } from '@tests/support/builders/entityBuilders.js';
import { FakeAuthTokenService } from '@tests/support/doubles/FakeAuthTokenService.js';
import { FakeHashService } from '@tests/support/doubles/FakeHashService.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryLeadStatusConfigRepository } from '@tests/support/doubles/InMemoryLeadStatusConfigRepository.js';
import { InMemoryTenantRepository } from '@tests/support/doubles/InMemoryTenantRepository.js';
import { InMemoryUserRepository } from '@tests/support/doubles/InMemoryUserRepository.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';

const PLAIN_PASSWORD = 'Correct-Horse-Battery-9';
const SESSION_LIFETIME_MS = 604_800_000;
const BREACHED_PASSWORD = 'password1234';

describe('LoginUseCase', () => {
  async function setupLogin() {
    const hashService = new FakeHashService();
    const authTokenService = new FakeAuthTokenService();
    const userRepository = new InMemoryUserRepository(new FixedTenantContext(DEFAULT_TEST_TENANT_ID));
    const registeredUser = buildUser({
      email: 'owner@example.com',
      passwordHash: await hashService.hash(PLAIN_PASSWORD),
      role: Role.OWNER,
    });
    userRepository.seed(registeredUser);

    const sessionRepository = new InMemorySessionRepository();
    const loginUseCase = new LoginUseCase(
      userRepository,
      hashService,
      new SessionIssuer(sessionRepository, authTokenService, { refreshTokenLifetimeMs: SESSION_LIFETIME_MS }),
      new RecordingTransactionManager(),
      new RecordingAuditLogger(),
    );
    return { loginUseCase, authTokenService, registeredUser, sessionRepository };
  }

  // F2-T02 (D-09): el login abre una sesión con refresh token rotatorio; el rol ya no viaja en el token (H2).
  it('abre una sesión y emite un token de acceso con el usuario, su tenant y la sesión, sin el rol', async () => {
    const { loginUseCase, authTokenService, registeredUser, sessionRepository } = await setupLogin();

    const result = await loginUseCase.execute({ email: 'owner@example.com', password: PLAIN_PASSWORD });

    const claims = authTokenService.verifyToken(result.accessToken);
    expect(claims).toEqual({ sub: registeredUser.id, tenantId: registeredUser.tenantId, sid: expect.any(String) });
    expect(sessionRepository.findStoredById(claims.sid)).toMatchObject({
      userId: registeredUser.id,
      tenantId: registeredUser.tenantId,
    });
  });

  it('el refresh token es <sesión>.<secreto> y la sesión guarda solo el hash del secreto', async () => {
    const { loginUseCase, sessionRepository } = await setupLogin();

    const result = await loginUseCase.execute({ email: 'owner@example.com', password: PLAIN_PASSWORD });

    const [sessionId, secret] = result.refreshToken.split('.');
    const storedSession = sessionRepository.findStoredById(sessionId);
    expect(storedSession?.refreshTokenHash).toBe(hashOpaqueSecret(secret));
    expect(storedSession?.refreshTokenHash).not.toContain(secret);
  });

  it('la sesión caduca según la política, sin depender del token de acceso', async () => {
    const { loginUseCase, sessionRepository } = await setupLogin();
    const before = Date.now();

    const result = await loginUseCase.execute({ email: 'owner@example.com', password: PLAIN_PASSWORD });

    const [sessionId] = result.refreshToken.split('.');
    const expiresAt = sessionRepository.findStoredById(sessionId)?.expiresAt.getTime() ?? 0;
    expect(expiresAt).toBeGreaterThanOrEqual(before + SESSION_LIFETIME_MS);
  });

  it('rechaza una contraseña incorrecta y no emite token', async () => {
    const { loginUseCase, authTokenService } = await setupLogin();

    await expect(loginUseCase.execute({ email: 'owner@example.com', password: 'wrong-password' })).rejects.toThrow(
      'Invalid Credentials',
    );
    expect(authTokenService.issuedPayloads).toHaveLength(0);
  });

  it('rechaza un correo desconocido con el mismo mensaje que una contraseña incorrecta', async () => {
    const { loginUseCase, authTokenService } = await setupLogin();

    // Mismo mensaje en ambos casos: el login no debe revelar si un correo está registrado.
    await expect(loginUseCase.execute({ email: 'unknown@example.com', password: PLAIN_PASSWORD })).rejects.toThrow(
      'Invalid Credentials',
    );
    expect(authTokenService.issuedPayloads).toHaveLength(0);
  });
});

// Regresión de H3: el login no comprobaba si la cuenta seguía activa.
describe('LoginUseCase con cuentas que no pueden iniciar sesión (H3)', () => {
  it('un usuario desactivado recibe INVALID_CREDENTIALS, igual que una contraseña incorrecta', async () => {
    const hashService = new FakeHashService();
    const userRepository = new InMemoryUserRepository(new FixedTenantContext(DEFAULT_TEST_TENANT_ID));
    userRepository.seed(
      buildUser({
        email: 'inactive@example.com',
        passwordHash: await hashService.hash(PLAIN_PASSWORD),
        isActive: false,
      }),
    );
    const authTokenService = new FakeAuthTokenService();
    const loginUseCase = new LoginUseCase(
      userRepository,
      hashService,
      new SessionIssuer(new InMemorySessionRepository(), authTokenService, {
        refreshTokenLifetimeMs: SESSION_LIFETIME_MS,
      }),
      new RecordingTransactionManager(),
      new RecordingAuditLogger(),
    );

    await expect(
      loginUseCase.execute({ email: 'inactive@example.com', password: PLAIN_PASSWORD }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
    expect(authTokenService.issuedPayloads).toHaveLength(0);
  });
});

describe('RegisterCompanyAndOwnerUseCase', () => {
  const registration: RegisterCompanyDTO = {
    companyName: 'Aluminios Andinos SAS',
    ownerEmail: 'owner@example.com',
    password: PLAIN_PASSWORD,
    ownerFirstName: 'Carlos',
    ownerLastName: 'Pérez',
  };

  function setupRegistration() {
    const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
    const tenantRepository = new InMemoryTenantRepository();
    const userRepository = new InMemoryUserRepository(tenantContext);
    const leadStatusRepository = new InMemoryLeadStatusConfigRepository(tenantContext);
    const hashService = new FakeHashService();
    const transactionManager = new RecordingTransactionManager();
    const mailing = createAccountMailing();

    const registerUseCase = new RegisterCompanyAndOwnerUseCase(
      tenantRepository,
      userRepository,
      hashService,
      leadStatusRepository,
      transactionManager,
      new RecordingAuditLogger(),
      new PasswordPolicy(new FakeBreachedPasswordChecker(BREACHED_PASSWORD)),
      mailing,
    );
    return {
      registerUseCase,
      tenantRepository,
      userRepository,
      leadStatusRepository,
      hashService,
      transactionManager,
      mailing,
    };
  }

  // H8: el registro escribía empresa, dueño y estados por separado; un fallo a medias dejaba datos huérfanos.
  it('crea la empresa, el dueño y los estados dentro de una sola transacción', async () => {
    const { registerUseCase, tenantRepository, userRepository, leadStatusRepository, transactionManager } =
      setupRegistration();
    const writesOutsideTransaction: string[] = [];
    const recordWrite = (writeName: string) => () => {
      if (!transactionManager.isInsideTransaction) writesOutsideTransaction.push(writeName);
    };
    const originalTenantCreate = tenantRepository.create.bind(tenantRepository);
    vi.spyOn(tenantRepository, 'create').mockImplementation(async (tenant) => {
      recordWrite('tenant')();
      await originalTenantCreate(tenant);
    });
    const originalUserCreate = userRepository.create.bind(userRepository);
    vi.spyOn(userRepository, 'create').mockImplementation(async (user) => {
      recordWrite('owner')();
      await originalUserCreate(user);
    });
    const originalStatusCreate = leadStatusRepository.create.bind(leadStatusRepository);
    vi.spyOn(leadStatusRepository, 'create').mockImplementation(async (status) => {
      recordWrite('lead status')();
      return originalStatusCreate(status);
    });

    await registerUseCase.execute(registration);

    expect(writesOutsideTransaction).toEqual([]);
    expect(transactionManager.completedTransactionCount).toBe(1);
  });

  it('cifra la contraseña antes de abrir la transacción, para no retenerla durante bcrypt', async () => {
    const { registerUseCase, hashService, transactionManager } = setupRegistration();
    let hashedInsideTransaction: boolean | undefined;
    const originalHash = hashService.hash.bind(hashService);
    vi.spyOn(hashService, 'hash').mockImplementation(async (plainText) => {
      hashedInsideTransaction = transactionManager.isInsideTransaction;
      return originalHash(plainText);
    });

    await registerUseCase.execute(registration);

    expect(hashedInsideTransaction).toBe(false);
  });

  it('si una escritura falla, el error sale de la transacción para que se revierta', async () => {
    const { registerUseCase, leadStatusRepository, transactionManager } = setupRegistration();
    const storageFailure = new Error('database unavailable');
    vi.spyOn(leadStatusRepository, 'create').mockRejectedValueOnce(storageFailure);

    await expect(registerUseCase.execute(registration)).rejects.toBe(storageFailure);

    expect(transactionManager.failedTransactionCount).toBe(1);
  });

  // F2-T04 (H8): la respuesta ya no lleva ids: es la misma exista o no el correo.
  it('crea la empresa y responde que queda pendiente de verificar el correo', async () => {
    const { registerUseCase, tenantRepository } = setupRegistration();

    const result = await registerUseCase.execute(registration);

    const [createdTenant] = tenantRepository.listStored();
    expect(createdTenant.name).toBe('Aluminios Andinos SAS');
    expect(result).toEqual({ status: 'PENDING_EMAIL_VERIFICATION' });
  });

  it('crea al dueño con rol OWNER, activo, sin verificar y dentro de la empresa nueva', async () => {
    const { registerUseCase, userRepository, tenantRepository } = setupRegistration();

    await registerUseCase.execute(registration);

    const [createdOwner] = userRepository.listStored();
    expect(createdOwner).toMatchObject({
      email: 'owner@example.com',
      firstName: 'Carlos',
      lastName: 'Pérez',
      role: Role.OWNER,
      isActive: true,
      tenantId: tenantRepository.listStored()[0].id,
    });
    expect(createdOwner.isEmailVerified).toBe(false);
  });

  it('envía al dueño el enlace de verificación (D-12), con el token en el fragmento de la URL', async () => {
    const { registerUseCase, mailing } = setupRegistration();

    await registerUseCase.execute(registration);

    const [verificationEmail] = mailing.outbox.sentTo('owner@example.com');
    expect(verificationEmail.subject).toBe('Confirma tu correo en QuotesFlow');
    expect(verificationEmail.text).toContain('https://app.quotesflow.test/verify-email#token=');
    expect(mailing.tokenSentTo('owner@example.com')).toBeDefined();
  });

  it('guarda la contraseña con hash, nunca en texto plano', async () => {
    const { registerUseCase, userRepository, hashService } = setupRegistration();

    await registerUseCase.execute(registration);

    const [createdOwner] = userRepository.listStored();
    expect(createdOwner.passwordHash).not.toBe(PLAIN_PASSWORD);
    await expect(hashService.compare(PLAIN_PASSWORD, createdOwner.passwordHash)).resolves.toBe(true);
  });

  it('crea los cinco estados de lead por defecto en la empresa nueva, con Nuevo como predeterminado', async () => {
    const { registerUseCase, leadStatusRepository, tenantRepository } = setupRegistration();

    await registerUseCase.execute(registration);

    const tenantId = tenantRepository.listStored()[0].id;
    const createdStatuses = await leadStatusRepository.findAllByTenant(tenantId);
    expect(createdStatuses.map((status) => status.name)).toEqual(defaultLeadStatuses.map((status) => status.name));
    expect(createdStatuses.filter((status) => status.isDefault).map((status) => status.name)).toEqual(['Nuevo']);
    expect(createdStatuses.every((status) => status.tenantId === tenantId)).toBe(true);
  });

  // F2-T04 (H8): antes respondía 409 EMAIL_ALREADY_IN_USE y revelaba que el correo existía.
  it('con un correo ya registrado responde igual, no crea nada y avisa al dueño del correo', async () => {
    const { registerUseCase, tenantRepository, userRepository, leadStatusRepository, mailing } = setupRegistration();
    userRepository.seed(buildUser({ email: 'owner@example.com' }));

    const result = await registerUseCase.execute(registration);

    expect(result).toEqual({ status: 'PENDING_EMAIL_VERIFICATION' });
    expect(tenantRepository.listStored()).toHaveLength(0);
    expect(userRepository.listStored()).toHaveLength(1);
    expect(leadStatusRepository.listStored()).toHaveLength(0);
    expect(mailing.outbox.sentTo('owner@example.com').map((email) => email.subject)).toEqual([
      'Ya tienes una cuenta en QuotesFlow',
    ]);
  });

  it('con un correo ya registrado gasta el mismo bcrypt que un registro nuevo (H8)', async () => {
    const { registerUseCase, userRepository, hashService } = setupRegistration();
    userRepository.seed(buildUser({ email: 'owner@example.com' }));
    const hashSpy = vi.spyOn(hashService, 'hash');

    await registerUseCase.execute(registration);

    expect(hashSpy).toHaveBeenCalledOnce();
  });

  it('a una cuenta desactivada no se le envía el aviso con enlaces de acceso', async () => {
    const { registerUseCase, userRepository, mailing } = setupRegistration();
    userRepository.seed(buildUser({ email: 'owner@example.com', isActive: false }));

    await registerUseCase.execute(registration);

    expect(mailing.outbox.sentTo('owner@example.com')).toEqual([]);
  });
});

// F2-T03 (D-11): la contraseña del dueño cumple la política antes de escribir nada.
describe('RegisterCompanyAndOwnerUseCase con la política de contraseñas', () => {
  function registrationUseCase() {
    const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
    const tenantRepository = new InMemoryTenantRepository();
    const userRepository = new InMemoryUserRepository(tenantContext);
    const useCase = new RegisterCompanyAndOwnerUseCase(
      tenantRepository,
      userRepository,
      new FakeHashService(),
      new InMemoryLeadStatusConfigRepository(tenantContext),
      new RecordingTransactionManager(),
      new RecordingAuditLogger(),
      new PasswordPolicy(new FakeBreachedPasswordChecker(BREACHED_PASSWORD)),
      createAccountMailing(),
    );
    return { useCase, userRepository };
  }

  it('rechaza una contraseña filtrada y no crea la empresa ni el dueño', async () => {
    const { useCase, userRepository } = registrationUseCase();

    await expect(
      useCase.execute({
        companyName: 'Aluminios Andinos SAS',
        ownerEmail: 'owner@example.com',
        password: BREACHED_PASSWORD,
        ownerFirstName: 'Carlos',
        ownerLastName: 'Pérez',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PASSWORD_BREACHED });
    expect(userRepository.listStored()).toEqual([]);
  });
});
