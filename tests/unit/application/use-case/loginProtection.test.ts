import { describe, expect, it } from 'vitest';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import { PasswordPolicy } from '@/application/services/PasswordPolicy.js';
import { SessionIssuer } from '@/application/services/SessionIssuer.js';
import { LoginUseCase } from '@/application/use-case/auth/LoginUseCase.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { FAILED_LOGINS_BEFORE_LOCK, lockDurationAfterFailedLogins } from '@/domain/value-objects/loginLockout.js';
import { DEFAULT_TEST_TENANT_ID, buildUser } from '@tests/support/builders/entityBuilders.js';
import { FakeAuthTokenService } from '@tests/support/doubles/FakeAuthTokenService.js';
import { FakeBreachedPasswordChecker } from '@tests/support/doubles/FakeBreachedPasswordChecker.js';
import { FakeHashService } from '@tests/support/doubles/FakeHashService.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemorySessionRepository } from '@tests/support/doubles/InMemorySessionRepository.js';
import { InMemoryUserRepository } from '@tests/support/doubles/InMemoryUserRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

// F2-T03: política de contraseñas (D-11, H7), bloqueo progresivo por cuenta y respuestas iguales (H22).

const PLAIN_PASSWORD = 'Correct-Horse-Battery-9';
const WRONG_PASSWORD = 'Wrong-Horse-Battery-0';
const OWNER_EMAIL = 'owner@example.com';
const SESSION_LIFETIME_MS = 604_800_000;
const ONE_MINUTE_MS = 60_000;
const FIFTEEN_MINUTES_MS = 900_000;
const ATTEMPTS_THAT_LOCK = FAILED_LOGINS_BEFORE_LOCK + 1;
const MANY_ATTEMPTS = 40;
const SEVENTH_FAILED_ATTEMPT = 7;
const EIGHTH_FAILED_ATTEMPT = 8;
const NINTH_FAILED_ATTEMPT = 9;
const TWO_MINUTES_MS = 120_000;
const FOUR_MINUTES_MS = 240_000;
const EIGHT_MINUTES_MS = 480_000;
// La ñ ocupa 2 bytes: 37 eñes son 74 bytes.
const TWO_BYTE_CHARACTERS_OVER_LIMIT = 37;

async function setupLogin() {
  const hashService = new FakeHashService();
  const userRepository = new InMemoryUserRepository(new FixedTenantContext(DEFAULT_TEST_TENANT_ID));
  const user = buildUser({ email: OWNER_EMAIL, passwordHash: await hashService.hash(PLAIN_PASSWORD) });
  userRepository.seed(user);
  const auditLogger = new RecordingAuditLogger();
  const sessionRepository = new InMemorySessionRepository();
  const loginUseCase = new LoginUseCase(
    userRepository,
    hashService,
    new SessionIssuer(sessionRepository, new FakeAuthTokenService(), { refreshTokenLifetimeMs: SESSION_LIFETIME_MS }),
    new RecordingTransactionManager(),
    auditLogger,
  );
  const storedUser = () => userRepository.listStored()[0];
  return { loginUseCase, hashService, auditLogger, user, storedUser };
}

async function failLogins(loginUseCase: LoginUseCase, times: number) {
  for (let attempt = 0; attempt < times; attempt += 1) {
    await loginUseCase.execute({ email: OWNER_EMAIL, password: WRONG_PASSWORD }).catch(() => undefined);
  }
}

describe('lockDurationAfterFailedLogins', () => {
  it.each([
    [FAILED_LOGINS_BEFORE_LOCK, undefined],
    [ATTEMPTS_THAT_LOCK, ONE_MINUTE_MS],
    [ATTEMPTS_THAT_LOCK + 1, TWO_MINUTES_MS],
    [SEVENTH_FAILED_ATTEMPT, FOUR_MINUTES_MS],
    [EIGHTH_FAILED_ATTEMPT, EIGHT_MINUTES_MS],
    [NINTH_FAILED_ATTEMPT, FIFTEEN_MINUTES_MS],
    [MANY_ATTEMPTS, FIFTEEN_MINUTES_MS],
  ])('tras %i fallos seguidos bloquea %s ms', (failedAttempts, expectedLock) => {
    expect(lockDurationAfterFailedLogins(failedAttempts)).toBe(expectedLock);
  });
});

describe('LoginUseCase: bloqueo por cuenta', () => {
  it('los primeros fallos solo cuentan; el quinto bloquea la cuenta y queda en auditoría', async () => {
    const { loginUseCase, auditLogger, storedUser } = await setupLogin();

    await failLogins(loginUseCase, ATTEMPTS_THAT_LOCK);

    expect(storedUser().failedLoginAttempts).toBe(ATTEMPTS_THAT_LOCK);
    expect(storedUser().isLoginLockedAt(new Date())).toBe(true);
    expect(auditLogger.entries.filter((entry) => entry.action === AuditAction.ACCOUNT_LOCKED)).toHaveLength(1);
  });

  it('con la cuenta bloqueada, ni la contraseña correcta entra, y responde igual que un fallo', async () => {
    const { loginUseCase } = await setupLogin();
    await failLogins(loginUseCase, ATTEMPTS_THAT_LOCK);

    await expect(loginUseCase.execute({ email: OWNER_EMAIL, password: PLAIN_PASSWORD })).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
      message: 'Invalid Credentials',
    });
  });

  it('con la cuenta bloqueada no se compara la contraseña real, pero se gasta el mismo trabajo (H22)', async () => {
    const { loginUseCase, hashService, auditLogger } = await setupLogin();
    await failLogins(loginUseCase, ATTEMPTS_THAT_LOCK);

    await loginUseCase.execute({ email: OWNER_EMAIL, password: PLAIN_PASSWORD }).catch(() => undefined);

    expect(hashService.comparisonsWithoutHash).toBe(1);
    expect(auditLogger.entries.at(-1)?.action).toBe(AuditAction.LOGIN_REJECTED_ACCOUNT_LOCKED);
  });

  it('un acierto pone el contador a cero', async () => {
    const { loginUseCase, storedUser } = await setupLogin();
    await failLogins(loginUseCase, FAILED_LOGINS_BEFORE_LOCK);

    await loginUseCase.execute({ email: OWNER_EMAIL, password: PLAIN_PASSWORD });

    expect(storedUser().failedLoginAttempts).toBe(0);
    expect(storedUser().loginLockedUntil).toBeUndefined();
  });

  it('el fallo queda auditado con el número de fallos seguidos, nunca con la contraseña', async () => {
    const { loginUseCase, auditLogger } = await setupLogin();

    await failLogins(loginUseCase, 1);

    expect(auditLogger.entries).toEqual([
      expect.objectContaining({ action: AuditAction.LOGIN_FAILED, metadata: { failedAttempts: 1 } }),
    ]);
    expect(JSON.stringify(auditLogger.entries)).not.toContain(WRONG_PASSWORD);
  });
});

describe('LoginUseCase: tiempo constante (H22)', () => {
  it('con un correo que no existe gasta una comparación de bcrypt como si existiera', async () => {
    const { loginUseCase, hashService } = await setupLogin();

    await expect(loginUseCase.execute({ email: 'nobody@example.com', password: PLAIN_PASSWORD })).rejects.toMatchObject(
      { code: ErrorCode.INVALID_CREDENTIALS },
    );
    expect(hashService.comparisonsWithoutHash).toBe(1);
  });

  it('con la contraseña incorrecta de una cuenta existente compara contra su hash real', async () => {
    const { loginUseCase, hashService } = await setupLogin();

    await failLogins(loginUseCase, 1);

    expect(hashService.comparisonsWithoutHash).toBe(0);
  });
});

describe('PasswordPolicy (D-11)', () => {
  const BREACHED_PASSWORD = 'Summer2024!Summer';
  const policy = new PasswordPolicy(new FakeBreachedPasswordChecker(BREACHED_PASSWORD));
  const owner = { email: 'ana.gomez@example.com' };

  it('acepta una contraseña larga, no filtrada y distinta del correo', async () => {
    await expect(policy.assertAcceptable(PLAIN_PASSWORD, owner)).resolves.toBeUndefined();
  });

  it('rechaza menos de 12 caracteres con PASSWORD_TOO_WEAK', async () => {
    await expect(policy.assertAcceptable('Abcdefgh-12', owner)).rejects.toMatchObject({
      code: ErrorCode.PASSWORD_TOO_WEAK,
    });
  });

  it('cuenta caracteres, no bytes: 12 letras con tilde valen', async () => {
    await expect(policy.assertAcceptable('áéíóúñáéíóúñ', owner)).resolves.toBeUndefined();
  });

  it('rechaza más de 72 bytes, que bcrypt truncaría', async () => {
    await expect(policy.assertAcceptable('ñ'.repeat(TWO_BYTE_CHARACTERS_OVER_LIMIT), owner)).rejects.toMatchObject({
      code: ErrorCode.PASSWORD_TOO_WEAK,
    });
  });

  it('rechaza el propio correo como contraseña, sin importar mayúsculas', async () => {
    await expect(policy.assertAcceptable('ANA.GOMEZ@example.com', owner)).rejects.toMatchObject({
      code: ErrorCode.PASSWORD_TOO_WEAK,
    });
  });

  it('rechaza una contraseña filtrada con PASSWORD_BREACHED, señalando el campo', async () => {
    await expect(policy.assertAcceptable(BREACHED_PASSWORD, owner)).rejects.toMatchObject({
      code: ErrorCode.PASSWORD_BREACHED,
      details: [{ path: ['password'], message: 'breached' }],
    });
  });
});
