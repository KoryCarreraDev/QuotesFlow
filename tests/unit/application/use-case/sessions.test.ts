import { describe, expect, it } from 'vitest';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import {
  buildCompositeToken,
  hashesMatch,
  hashOpaqueSecret,
  parseCompositeToken,
} from '@/application/services/opaqueTokens.js';
import { SessionIssuer } from '@/application/services/SessionIssuer.js';
import { AuthenticateSessionUseCase } from '@/application/use-case/auth/AuthenticateSessionUseCase.js';
import { LogoutAllSessionsUseCase } from '@/application/use-case/auth/LogoutAllSessionsUseCase.js';
import { LogoutUseCase } from '@/application/use-case/auth/LogoutUseCase.js';
import { RefreshSessionUseCase } from '@/application/use-case/auth/RefreshSessionUseCase.js';
import { SessionRevocationReason, UserSession } from '@/domain/entities/UserSession.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { DEFAULT_TEST_TENANT_ID } from '@tests/support/builders/entityBuilders.js';
import { FakeAuthTokenService } from '@tests/support/doubles/FakeAuthTokenService.js';
import { InMemorySessionRepository } from '@tests/support/doubles/InMemorySessionRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

// F2-T02 (D-09, H2): sesiones con token de acceso corto y refresh token rotatorio guardado con hash.

const USER_ID = 'user-ana';
const OTHER_USER_ID = 'user-carlos';
const SESSION_LIFETIME_MS = 604_800_000;
const ONE_SECOND_MS = 1_000;

function setupSessions() {
  const sessionRepository = new InMemorySessionRepository();
  const tokenService = new FakeAuthTokenService();
  const auditLogger = new RecordingAuditLogger();
  const transactionManager = new RecordingTransactionManager();
  const sessionIssuer = new SessionIssuer(sessionRepository, tokenService, {
    refreshTokenLifetimeMs: SESSION_LIFETIME_MS,
  });
  return {
    sessionRepository,
    tokenService,
    auditLogger,
    sessionIssuer,
    refresh: new RefreshSessionUseCase(sessionRepository, sessionIssuer, transactionManager, auditLogger),
    logout: new LogoutUseCase(sessionRepository, transactionManager, auditLogger),
    logoutAll: new LogoutAllSessionsUseCase(sessionRepository, transactionManager, auditLogger),
    authenticate: new AuthenticateSessionUseCase(tokenService, sessionRepository),
  };
}

async function openSessionFor(sessionIssuer: SessionIssuer, userId = USER_ID) {
  return sessionIssuer.open({ id: userId, tenantId: DEFAULT_TEST_TENANT_ID });
}

function sessionIdOf(refreshToken: string): string {
  return refreshToken.split('.')[0];
}

describe('tokens opacos', () => {
  it('un token compuesto se separa en id y secreto', () => {
    expect(parseCompositeToken(buildCompositeToken('session-1', 'c2VjcmV0'))).toEqual({
      recordId: 'session-1',
      secret: 'c2VjcmV0',
    });
  });

  it.each(['', 'sin-separador', '.solo-secreto', 'id.secreto con espacios'])(
    'rechaza un token mal formado: "%s"',
    (malformedToken) => {
      expect(parseCompositeToken(malformedToken)).toBeNull();
    },
  );

  it('compara hashes en tiempo constante y distingue los distintos', () => {
    expect(hashesMatch(hashOpaqueSecret('a'), hashOpaqueSecret('a'))).toBe(true);
    expect(hashesMatch(hashOpaqueSecret('a'), hashOpaqueSecret('b'))).toBe(false);
    expect(hashesMatch(hashOpaqueSecret('a'), 'corto')).toBe(false);
  });
});

describe('UserSession', () => {
  it('no sirve revocada ni caducada', () => {
    const future = new Date(Date.now() + SESSION_LIFETIME_MS);
    const past = new Date(Date.now() - ONE_SECOND_MS);

    expect(new UserSession('s', DEFAULT_TEST_TENANT_ID, USER_ID, 'h', future).isUsableAt(new Date())).toBe(true);
    expect(new UserSession('s', DEFAULT_TEST_TENANT_ID, USER_ID, 'h', past).isUsableAt(new Date())).toBe(false);
    expect(new UserSession('s', DEFAULT_TEST_TENANT_ID, USER_ID, 'h', future, new Date()).isUsableAt(new Date())).toBe(
      false,
    );
  });
});

describe('RefreshSessionUseCase', () => {
  it('con un refresh token válido emite un token de acceso de la misma sesión y rota el refresh token', async () => {
    const { sessionIssuer, refresh, tokenService } = setupSessions();
    const openedSession = await openSessionFor(sessionIssuer);

    const renewedSession = await refresh.execute(openedSession.refreshToken);

    expect(renewedSession.refreshToken).not.toBe(openedSession.refreshToken);
    expect(sessionIdOf(renewedSession.refreshToken)).toBe(sessionIdOf(openedSession.refreshToken));
    expect(tokenService.verifyToken(renewedSession.accessToken).sid).toBe(sessionIdOf(openedSession.refreshToken));
  });

  it('el refresh token rotado sigue sirviendo para la siguiente renovación', async () => {
    const { sessionIssuer, refresh } = setupSessions();
    const openedSession = await openSessionFor(sessionIssuer);
    const firstRenewal = await refresh.execute(openedSession.refreshToken);

    await expect(refresh.execute(firstRenewal.refreshToken)).resolves.toBeDefined();
  });

  it('reutilizar un refresh token ya rotado revoca la sesión entera y lo audita', async () => {
    const { sessionIssuer, refresh, sessionRepository, auditLogger } = setupSessions();
    const openedSession = await openSessionFor(sessionIssuer);
    const legitimateRenewal = await refresh.execute(openedSession.refreshToken);

    await expect(refresh.execute(openedSession.refreshToken)).rejects.toMatchObject({
      code: ErrorCode.INVALID_SESSION,
    });

    const sessionId = sessionIdOf(openedSession.refreshToken);
    expect(sessionRepository.revocationReasonOf(sessionId)).toBe(SessionRevocationReason.REFRESH_TOKEN_REUSED);
    expect(auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.SESSION_REUSE_DETECTED]);
    // El ladrón y el usuario legítimo pierden la sesión: el legítimo vuelve a iniciar sesión.
    await expect(refresh.execute(legitimateRenewal.refreshToken)).rejects.toMatchObject({
      code: ErrorCode.INVALID_SESSION,
    });
  });

  it.each([
    ['sin refresh token', undefined],
    ['con un token mal formado', 'no-es-un-token'],
    ['con una sesión que no existe', buildCompositeToken('session-inexistente', 'c2VjcmV0')],
  ])('responde INVALID_SESSION %s', async (_case, refreshToken) => {
    const { refresh } = setupSessions();

    await expect(refresh.execute(refreshToken)).rejects.toMatchObject({ code: ErrorCode.INVALID_SESSION });
  });

  it('no renueva una sesión cerrada', async () => {
    const { sessionIssuer, refresh, logout } = setupSessions();
    const openedSession = await openSessionFor(sessionIssuer);
    await logout.execute(openedSession.refreshToken);

    await expect(refresh.execute(openedSession.refreshToken)).rejects.toMatchObject({
      code: ErrorCode.INVALID_SESSION,
    });
  });

  it('no renueva la sesión de un usuario desactivado', async () => {
    const { sessionIssuer, refresh, sessionRepository } = setupSessions();
    const openedSession = await openSessionFor(sessionIssuer);
    sessionRepository.setUserState(USER_ID, { role: Role.SALES_REP, isActive: false });

    await expect(refresh.execute(openedSession.refreshToken)).rejects.toMatchObject({
      code: ErrorCode.INVALID_SESSION,
    });
  });

  it('no renueva una sesión caducada', async () => {
    const { refresh, sessionRepository } = setupSessions();
    const secret = 'c2VjcmV0';
    sessionRepository.seed(
      new UserSession(
        'session-caducada',
        DEFAULT_TEST_TENANT_ID,
        USER_ID,
        hashOpaqueSecret(secret),
        new Date(Date.now() - ONE_SECOND_MS),
      ),
    );

    await expect(refresh.execute(buildCompositeToken('session-caducada', secret))).rejects.toMatchObject({
      code: ErrorCode.INVALID_SESSION,
    });
  });
});

describe('LogoutUseCase', () => {
  it('revoca la sesión del refresh token y lo audita', async () => {
    const { sessionIssuer, logout, sessionRepository, auditLogger } = setupSessions();
    const openedSession = await openSessionFor(sessionIssuer);

    await logout.execute(openedSession.refreshToken);

    expect(sessionRepository.revocationReasonOf(sessionIdOf(openedSession.refreshToken))).toBe(
      SessionRevocationReason.LOGOUT,
    );
    expect(auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.LOGOUT]);
  });

  it('es idempotente: sin token, con uno desconocido o con la sesión ya cerrada no falla ni audita', async () => {
    const { sessionIssuer, logout, auditLogger } = setupSessions();
    const openedSession = await openSessionFor(sessionIssuer);
    await logout.execute(openedSession.refreshToken);

    await logout.execute(undefined);
    await logout.execute('no-es-un-token');
    await logout.execute(openedSession.refreshToken);

    expect(auditLogger.entries).toHaveLength(1);
  });

  it('conocer solo el id de la sesión no basta para cerrarla', async () => {
    const { sessionIssuer, logout, sessionRepository } = setupSessions();
    const openedSession = await openSessionFor(sessionIssuer);
    const sessionId = sessionIdOf(openedSession.refreshToken);

    await logout.execute(buildCompositeToken(sessionId, 'c2VjcmV0LWZhbHNv'));

    expect(sessionRepository.findStoredById(sessionId)?.revokedAt).toBeUndefined();
  });
});

describe('LogoutAllSessionsUseCase', () => {
  it('revoca todas las sesiones del usuario y ninguna de otro', async () => {
    const { sessionIssuer, logoutAll, sessionRepository, auditLogger } = setupSessions();
    const laptopSession = await openSessionFor(sessionIssuer);
    const phoneSession = await openSessionFor(sessionIssuer);
    const otherUserSession = await openSessionFor(sessionIssuer, OTHER_USER_ID);

    await logoutAll.execute({ role: Role.SALES_REP, userId: USER_ID });

    expect(sessionRepository.revocationReasonOf(sessionIdOf(laptopSession.refreshToken))).toBe(
      SessionRevocationReason.LOGOUT_ALL,
    );
    expect(sessionRepository.revocationReasonOf(sessionIdOf(phoneSession.refreshToken))).toBe(
      SessionRevocationReason.LOGOUT_ALL,
    );
    expect(sessionRepository.findStoredById(sessionIdOf(otherUserSession.refreshToken))?.revokedAt).toBeUndefined();
    expect(auditLogger.entries).toEqual([
      expect.objectContaining({ action: AuditAction.LOGOUT_ALL_SESSIONS, metadata: { revokedSessions: 2 } }),
    ]);
  });

  it('un rol fuera de la matriz no puede (la política deniega por defecto)', async () => {
    const { logoutAll } = setupSessions();

    await expect(logoutAll.execute({ role: 'UNKNOWN_ROLE' as Role, userId: USER_ID })).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
  });
});

describe('AuthenticateSessionUseCase', () => {
  it('devuelve la sesión con el rol actual del usuario', async () => {
    const { sessionIssuer, authenticate, sessionRepository } = setupSessions();
    const openedSession = await openSessionFor(sessionIssuer);
    sessionRepository.setUserState(USER_ID, { role: Role.SALES_LEADER, isActive: true });

    const authenticatedSession = await authenticate.execute(openedSession.accessToken);

    expect(authenticatedSession).toEqual({
      sessionId: sessionIdOf(openedSession.refreshToken),
      userId: USER_ID,
      tenantId: DEFAULT_TEST_TENANT_ID,
      role: Role.SALES_LEADER,
    });
  });

  it('un token de acceso de una sesión revocada por logout global deja de valer', async () => {
    const { sessionIssuer, authenticate, logoutAll } = setupSessions();
    const openedSession = await openSessionFor(sessionIssuer);
    await logoutAll.execute({ role: Role.SALES_REP, userId: USER_ID });

    await expect(authenticate.execute(openedSession.accessToken)).rejects.toMatchObject({
      code: ErrorCode.INVALID_SESSION,
    });
  });

  it('un token que apunta a la sesión de otro usuario no vale', async () => {
    const { sessionIssuer, authenticate, tokenService } = setupSessions();
    const otherUserSession = await openSessionFor(sessionIssuer, OTHER_USER_ID);
    const forgedClaims = {
      sub: USER_ID,
      tenantId: DEFAULT_TEST_TENANT_ID,
      sid: sessionIdOf(otherUserSession.refreshToken),
    };

    await expect(authenticate.execute(tokenService.generateToken(forgedClaims))).rejects.toMatchObject({
      code: ErrorCode.INVALID_SESSION,
    });
  });
});
