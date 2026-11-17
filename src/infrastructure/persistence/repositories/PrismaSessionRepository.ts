import { DeletedState as StoredDeletedState, type UserSession as UserSessionRecord } from '@prisma/client';
import {
  AuthenticatedSession,
  ISessionRepository,
} from '../../../application/ports/repositories/ISessionRepository.js';
import { SessionRevocationReason, UserSession } from '../../../domain/entities/UserSession.js';
import { Role } from '../../../domain/enums/Role.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

function toDomain(record: UserSessionRecord): UserSession {
  return new UserSession(
    record.id,
    record.tenantId,
    record.userId,
    record.refreshTokenHash,
    record.expiresAt,
    record.revokedAt ?? undefined,
  );
}

/**
 * Adaptador de `ISessionRepository`. Sin filtro del tenant del contexto a propósito: el refresh y el logout
 * no tienen sesión de acceso, y cada sesión ya guarda su tenant, que se comprueba al autenticar.
 */
export class PrismaSessionRepository extends BasePrismaRepository implements ISessionRepository {
  async create(session: UserSession): Promise<void> {
    await this.prisma.userSession.create({
      data: {
        id: session.id,
        tenantId: session.tenantId,
        userId: session.userId,
        refreshTokenHash: session.refreshTokenHash,
        expiresAt: session.expiresAt,
      },
    });
  }

  async findById(sessionId: string): Promise<UserSession | null> {
    const record = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    return record ? toDomain(record) : null;
  }

  async findAuthenticatedSession(
    sessionId: string,
    userId: string,
    tenantId: string,
  ): Promise<AuthenticatedSession | null> {
    const record = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId,
        tenantId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          isActive: true,
          deleted: StoredDeletedState.INUSE,
          tenantId,
          tenant: { deleted: StoredDeletedState.INUSE },
        },
      },
      select: { user: { select: { role: true } } },
    });
    return record ? { sessionId, userId, tenantId, role: record.user.role as Role } : null;
  }

  async rotateRefreshToken(sessionId: string, currentHash: string, newHash: string): Promise<boolean> {
    // Comparar y cambiar en una sola sentencia: de dos renovaciones simultáneas solo una actualiza la fila.
    const { count } = await this.prisma.userSession.updateMany({
      where: { id: sessionId, refreshTokenHash: currentHash, revokedAt: null },
      data: { refreshTokenHash: newHash, lastRefreshedAt: new Date() },
    });
    return count === 1;
  }

  async revoke(sessionId: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: SessionRevocationReason): Promise<number> {
    const { count } = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count;
  }
}
