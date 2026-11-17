import { AuthenticatedSession, ISessionRepository } from '@/application/ports/repositories/ISessionRepository.js';
import { SessionRevocationReason, UserSession } from '@/domain/entities/UserSession.js';
import { Role } from '@/domain/enums/Role.js';

/** Usuario detrás de una sesión, para que el doble sepa si sigue activo y su rol. */
export interface SessionUserState {
  role: Role;
  isActive: boolean;
}

/**
 * Doble en memoria de `ISessionRepository`. El estado del usuario (activo, rol) se fija con `setUserState`;
 * por defecto, activo y SALES_REP.
 */
export class InMemorySessionRepository implements ISessionRepository {
  private readonly sessionsById = new Map<string, UserSession>();
  private readonly revocationReasons = new Map<string, SessionRevocationReason>();
  private readonly userStates = new Map<string, SessionUserState>();

  seed(...sessions: UserSession[]): void {
    for (const session of sessions) this.sessionsById.set(session.id, session);
  }

  setUserState(userId: string, state: SessionUserState): void {
    this.userStates.set(userId, state);
  }

  /** La sesión guardada, sin filtros. */
  findStoredById(sessionId: string): UserSession | undefined {
    return this.sessionsById.get(sessionId);
  }

  revocationReasonOf(sessionId: string): SessionRevocationReason | undefined {
    return this.revocationReasons.get(sessionId);
  }

  async create(session: UserSession): Promise<void> {
    this.sessionsById.set(session.id, session);
  }

  async findById(sessionId: string): Promise<UserSession | null> {
    return this.sessionsById.get(sessionId) ?? null;
  }

  async findAuthenticatedSession(
    sessionId: string,
    userId: string,
    tenantId: string,
  ): Promise<AuthenticatedSession | null> {
    const session = this.sessionsById.get(sessionId);
    const userState = this.userStates.get(userId) ?? { role: Role.SALES_REP, isActive: true };
    const matches = session?.userId === userId && session.tenantId === tenantId;
    if (!session || !matches || !session.isUsableAt(new Date()) || !userState.isActive) return null;
    return { sessionId, userId, tenantId, role: userState.role };
  }

  async rotateRefreshToken(sessionId: string, currentHash: string, newHash: string): Promise<boolean> {
    const session = this.sessionsById.get(sessionId);
    if (!session || session.revokedAt || session.refreshTokenHash !== currentHash) return false;
    this.sessionsById.set(
      sessionId,
      new UserSession(session.id, session.tenantId, session.userId, newHash, session.expiresAt),
    );
    return true;
  }

  async revoke(sessionId: string, reason: SessionRevocationReason): Promise<void> {
    const session = this.sessionsById.get(sessionId);
    if (!session || session.revokedAt) return;
    this.sessionsById.set(sessionId, this.revoked(session));
    this.revocationReasons.set(sessionId, reason);
  }

  async revokeAllForUser(userId: string, reason: SessionRevocationReason): Promise<number> {
    const openSessions = [...this.sessionsById.values()].filter(
      (session) => session.userId === userId && !session.revokedAt,
    );
    for (const session of openSessions) await this.revoke(session.id, reason);
    return openSessions.length;
  }

  private revoked(session: UserSession): UserSession {
    return new UserSession(
      session.id,
      session.tenantId,
      session.userId,
      session.refreshTokenHash,
      session.expiresAt,
      new Date(),
    );
  }
}
