import { ISessionRepository } from '@/application/ports/repositories/ISessionRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { hashesMatch, hashOpaqueSecret, parseCompositeToken } from '@/application/services/opaqueTokens.js';
import { SessionRevocationReason, UserSession } from '@/domain/entities/UserSession.js';

/**
 * Cierra la sesión del navegador (F2-T02). Idempotente: sin sesión, con un token desconocido o con una
 * sesión ya cerrada no hace nada y no falla, para que el frontend pueda limpiar siempre sus cookies.
 *
 * Solo revoca con el refresh token completo (id y secreto): conocer el id de una sesión no basta para
 * cerrársela a otro.
 */
export class LogoutUseCase {
  constructor(
    private readonly sessionRepository: ISessionRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(refreshToken: string | undefined): Promise<void> {
    const session = await this.findSessionOwnedBy(refreshToken);
    if (!session?.isUsableAt(new Date())) return;

    await this.transactionManager.runInTransaction(async () => {
      await this.sessionRepository.revoke(session.id, SessionRevocationReason.LOGOUT);
      await this.auditLogger.record({
        action: AuditAction.LOGOUT,
        entity: AuditEntity.SESSION,
        entityId: session.id,
        publicActor: { userId: session.userId, tenantId: session.tenantId },
      });
    });
  }

  private async findSessionOwnedBy(refreshToken: string | undefined): Promise<UserSession | null> {
    const presentedToken = refreshToken ? parseCompositeToken(refreshToken) : null;
    if (!presentedToken) return null;
    const session = await this.sessionRepository.findById(presentedToken.recordId);
    if (!session || !hashesMatch(hashOpaqueSecret(presentedToken.secret), session.refreshTokenHash)) return null;
    return session;
  }
}
