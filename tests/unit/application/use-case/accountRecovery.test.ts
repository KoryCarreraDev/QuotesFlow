import { describe, expect, it } from 'vitest';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import { PasswordPolicy } from '@/application/services/PasswordPolicy.js';
import { SessionIssuer } from '@/application/services/SessionIssuer.js';
import {
  ResendEmailVerificationUseCase,
  VerifyEmailUseCase,
} from '@/application/use-case/auth/EmailVerificationUseCases.js';
import { LoginUseCase } from '@/application/use-case/auth/LoginUseCase.js';
import {
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from '@/application/use-case/auth/PasswordResetUseCases.js';
import { AccountToken, AccountTokenPurpose } from '@/domain/entities/AccountToken.js';
import { SessionRevocationReason } from '@/domain/entities/UserSession.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { hashOpaqueSecret } from '@/application/services/opaqueTokens.js';
import { DEFAULT_TEST_TENANT_ID, buildUser } from '@tests/support/builders/entityBuilders.js';
import { createAccountMailing } from '@tests/support/doubles/accountMailing.js';
import { FakeAuthTokenService } from '@tests/support/doubles/FakeAuthTokenService.js';
import { FakeBreachedPasswordChecker } from '@tests/support/doubles/FakeBreachedPasswordChecker.js';
import { FakeHashService } from '@tests/support/doubles/FakeHashService.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemorySessionRepository } from '@tests/support/doubles/InMemorySessionRepository.js';
import { InMemoryUserRepository } from '@tests/support/doubles/InMemoryUserRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

// F2-T04: verificación de correo (D-12) y recuperación de contraseña con tokens de un solo uso.

const EMAIL = 'ana.gomez@example.com';
const OLD_PASSWORD = 'Old-Horse-Battery-1';
const NEW_PASSWORD = 'New-Horse-Battery-2';
const BREACHED_PASSWORD = 'password12345';
const SESSION_LIFETIME_MS = 604_800_000;
const ONE_SECOND_MS = 1_000;
const ONE_HOUR_MS = 3_600_000;

async function setupAccount(options: { verified: boolean }) {
  const hashService = new FakeHashService();
  const userRepository = new InMemoryUserRepository(new FixedTenantContext(DEFAULT_TEST_TENANT_ID));
  const user = buildUser({
    email: EMAIL,
    firstName: 'Ana',
    passwordHash: await hashService.hash(OLD_PASSWORD),
    emailVerifiedAt: options.verified ? new Date() : undefined,
  });
  userRepository.seed(user);
  const mailing = createAccountMailing();
  const auditLogger = new RecordingAuditLogger();
  const transactionManager = new RecordingTransactionManager();
  const sessionRepository = new InMemorySessionRepository();
  const resetDependencies = {
    userRepository,
    accountTokenRepository: mailing.accountTokenRepository,
    accountTokenIssuer: mailing.accountTokenIssuer,
    emailSender: mailing.emailSender,
    accountLinks: mailing.accountLinks,
    transactionManager,
    auditLogger,
  };
  return {
    user,
    userRepository,
    mailing,
    auditLogger,
    sessionRepository,
    hashService,
    verifyEmail: new VerifyEmailUseCase(mailing.accountTokenIssuer, userRepository, transactionManager, auditLogger),
    resendVerification: new ResendEmailVerificationUseCase(
      userRepository,
      mailing.accountTokenRepository,
      mailing.accountTokenIssuer,
      mailing.emailSender,
      mailing.accountLinks,
    ),
    requestReset: new RequestPasswordResetUseCase(resetDependencies),
    resetPassword: new ResetPasswordUseCase(
      resetDependencies,
      sessionRepository,
      hashService,
      new PasswordPolicy(new FakeBreachedPasswordChecker(BREACHED_PASSWORD)),
    ),
    login: new LoginUseCase(
      userRepository,
      hashService,
      new SessionIssuer(sessionRepository, new FakeAuthTokenService(), { refreshTokenLifetimeMs: SESSION_LIFETIME_MS }),
      transactionManager,
      auditLogger,
    ),
  };
}

describe('Verificación de correo (D-12)', () => {
  it('sin verificar, la contraseña correcta responde EMAIL_NOT_VERIFIED y no abre sesión', async () => {
    const { login, auditLogger } = await setupAccount({ verified: false });

    await expect(login.execute({ email: EMAIL, password: OLD_PASSWORD })).rejects.toMatchObject({
      code: ErrorCode.EMAIL_NOT_VERIFIED,
    });
    expect(auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.LOGIN_REJECTED_EMAIL_NOT_VERIFIED]);
  });

  it('sin verificar, una contraseña incorrecta sigue respondiendo INVALID_CREDENTIALS: no revela la cuenta', async () => {
    const { login } = await setupAccount({ verified: false });

    await expect(login.execute({ email: EMAIL, password: NEW_PASSWORD })).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
  });

  it('el enlace verifica el correo, lo audita y después se puede iniciar sesión', async () => {
    const { resendVerification, verifyEmail, login, mailing, auditLogger } = await setupAccount({ verified: false });
    await resendVerification.execute(EMAIL);

    await verifyEmail.execute(mailing.tokenSentTo(EMAIL) ?? '');

    expect(auditLogger.entries.map((entry) => entry.action)).toContain(AuditAction.EMAIL_VERIFIED);
    await expect(login.execute({ email: EMAIL, password: OLD_PASSWORD })).resolves.toBeDefined();
  });

  it('el enlace sirve una sola vez', async () => {
    const { resendVerification, verifyEmail, mailing } = await setupAccount({ verified: false });
    await resendVerification.execute(EMAIL);
    const token = mailing.tokenSentTo(EMAIL) ?? '';
    await verifyEmail.execute(token);

    await expect(verifyEmail.execute(token)).rejects.toMatchObject({ code: ErrorCode.INVALID_ACCOUNT_TOKEN });
  });

  it('un enlace caducado no verifica', async () => {
    const { verifyEmail, mailing, user, userRepository } = await setupAccount({ verified: false });
    const secret = 'c2VjcmV0LWNhZHVjYWRv';
    mailing.accountTokenRepository.seed(
      new AccountToken(
        'token-caducado',
        DEFAULT_TEST_TENANT_ID,
        user.id,
        AccountTokenPurpose.EMAIL_VERIFICATION,
        hashOpaqueSecret(secret),
        new Date(Date.now() - ONE_SECOND_MS),
        new Date(Date.now() - ONE_HOUR_MS),
      ),
    );

    await expect(verifyEmail.execute(`token-caducado.${secret}`)).rejects.toMatchObject({
      code: ErrorCode.INVALID_ACCOUNT_TOKEN,
    });
    expect(userRepository.findStoredById(user.id)?.isEmailVerified).toBe(false);
  });

  it('un enlace de recuperación no sirve para verificar el correo', async () => {
    const { requestReset, verifyEmail, mailing } = await setupAccount({ verified: false });
    await requestReset.execute(EMAIL);

    await expect(verifyEmail.execute(mailing.tokenSentTo(EMAIL) ?? '')).rejects.toMatchObject({
      code: ErrorCode.INVALID_ACCOUNT_TOKEN,
    });
  });

  it('reenviar anula el enlace anterior: solo vale el último', async () => {
    const { resendVerification, verifyEmail, mailing } = await setupAccount({ verified: false });
    await resendVerification.execute(EMAIL);
    const firstToken = mailing.tokenSentTo(EMAIL) ?? '';
    // Saltarse la espera de un minuto entre envíos: se envejece el primer token.
    const [firstStoredToken] = mailing.accountTokenRepository.listStored();
    mailing.accountTokenRepository.seed(
      new AccountToken(
        firstStoredToken.id,
        firstStoredToken.tenantId,
        firstStoredToken.userId,
        firstStoredToken.purpose,
        firstStoredToken.tokenHash,
        firstStoredToken.expiresAt,
        new Date(Date.now() - ONE_HOUR_MS),
      ),
    );
    await resendVerification.execute(EMAIL);

    await expect(verifyEmail.execute(firstToken)).rejects.toMatchObject({ code: ErrorCode.INVALID_ACCOUNT_TOKEN });
    await expect(verifyEmail.execute(mailing.tokenSentTo(EMAIL) ?? '')).resolves.toBeUndefined();
  });

  it('no reenvía otro enlace antes de un minuto', async () => {
    const { resendVerification, mailing } = await setupAccount({ verified: false });

    await resendVerification.execute(EMAIL);
    await resendVerification.execute(EMAIL);

    expect(mailing.outbox.sentTo(EMAIL)).toHaveLength(1);
  });

  it('no envía nada a un correo inexistente ni a uno ya verificado, y no falla', async () => {
    const { resendVerification, mailing } = await setupAccount({ verified: true });

    await resendVerification.execute('nobody@example.com');
    await resendVerification.execute(EMAIL);

    expect(mailing.outbox.sentTo(EMAIL)).toEqual([]);
    expect(mailing.outbox.sentTo('nobody@example.com')).toEqual([]);
  });
});

describe('Recuperación de contraseña', () => {
  it('pedirla envía un enlace de 30 minutos y lo audita', async () => {
    const { requestReset, mailing, auditLogger } = await setupAccount({ verified: true });

    await requestReset.execute(EMAIL);

    const [resetEmail] = mailing.outbox.sentTo(EMAIL);
    expect(resetEmail.text).toContain('30 minutos');
    expect(resetEmail.text).toContain('https://app.quotesflow.test/reset-password#token=');
    expect(auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.PASSWORD_RESET_REQUESTED]);
  });

  it('con un correo inexistente no envía nada ni falla', async () => {
    const { requestReset, mailing } = await setupAccount({ verified: true });

    await expect(requestReset.execute('nobody@example.com')).resolves.toBeUndefined();
    expect(mailing.outbox.sentTo('nobody@example.com')).toEqual([]);
  });

  it('con el enlace cambia la contraseña: la nueva entra y la anterior no', async () => {
    const { requestReset, resetPassword, login, mailing } = await setupAccount({ verified: true });
    await requestReset.execute(EMAIL);

    await resetPassword.execute(mailing.tokenSentTo(EMAIL) ?? '', NEW_PASSWORD);

    await expect(login.execute({ email: EMAIL, password: NEW_PASSWORD })).resolves.toBeDefined();
    await expect(login.execute({ email: EMAIL, password: OLD_PASSWORD })).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    });
  });

  it('cambiarla cierra todas las sesiones, quita el bloqueo, verifica el correo y avisa por correo', async () => {
    const { requestReset, resetPassword, mailing, sessionRepository, userRepository, user } = await setupAccount({
      verified: false,
    });
    const openSession = await new SessionIssuer(sessionRepository, new FakeAuthTokenService(), {
      refreshTokenLifetimeMs: SESSION_LIFETIME_MS,
    }).open(user);
    await userRepository.lockLogin(user.id, new Date(Date.now() + ONE_HOUR_MS));
    await requestReset.execute(EMAIL);

    await resetPassword.execute(mailing.tokenSentTo(EMAIL) ?? '', NEW_PASSWORD);

    const sessionId = openSession.refreshToken.split('.')[0];
    expect(sessionRepository.revocationReasonOf(sessionId)).toBe(SessionRevocationReason.PASSWORD_CHANGED);
    const storedUser = userRepository.findStoredById(user.id);
    expect(storedUser?.loginLockedUntil).toBeUndefined();
    expect(storedUser?.isEmailVerified).toBe(true);
    expect(mailing.outbox.sentTo(EMAIL).at(-1)?.subject).toBe('Tu contraseña de QuotesFlow cambió');
  });

  it('una contraseña filtrada se rechaza y el enlace sigue sirviendo para otro intento', async () => {
    const { requestReset, resetPassword, mailing } = await setupAccount({ verified: true });
    await requestReset.execute(EMAIL);
    const token = mailing.tokenSentTo(EMAIL) ?? '';

    await expect(resetPassword.execute(token, BREACHED_PASSWORD)).rejects.toMatchObject({
      code: ErrorCode.PASSWORD_BREACHED,
    });
    await expect(resetPassword.execute(token, NEW_PASSWORD)).resolves.toBeUndefined();
  });

  it('el enlace sirve una sola vez', async () => {
    const { requestReset, resetPassword, mailing } = await setupAccount({ verified: true });
    await requestReset.execute(EMAIL);
    const token = mailing.tokenSentTo(EMAIL) ?? '';
    await resetPassword.execute(token, NEW_PASSWORD);

    await expect(resetPassword.execute(token, 'Another-Horse-Battery-3')).rejects.toMatchObject({
      code: ErrorCode.INVALID_ACCOUNT_TOKEN,
    });
  });

  it('un token inventado se rechaza sin decir por qué', async () => {
    const { resetPassword } = await setupAccount({ verified: true });

    await expect(resetPassword.execute('inventado.c2VjcmV0', NEW_PASSWORD)).rejects.toMatchObject({
      code: ErrorCode.INVALID_ACCOUNT_TOKEN,
      message: 'Token is invalid, expired or already used',
    });
  });
});
