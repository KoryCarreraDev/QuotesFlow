import { ISessionRepository } from '@/application/ports/repositories/ISessionRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { Action, Actor, can } from '@/application/policies/authorizationPolicy.js';
import { SessionRevocationReason } from '@/domain/entities/UserSession.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';

/**
 * Cierra todas las sesiones del usuario de la sesión, también la actual (F2-T02): por ejemplo, tras perder
 * un portátil. Los tokens de acceso ya emitidos dejan de valer en la siguiente petición.
 *
 * @throws {ForbiddenError} Si el rol no puede cerrar sus sesiones (todos pueden; la política lo confirma).
 */
export class LogoutAllSessionsUseCase {
  constructor(
    private readonly sessionRepository: ISessionRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor & { userId: string }): Promise<void> {
    if (!can(actor, Action.SESSION_REVOKE_OWN)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    await this.transactionManager.runInTransaction(async () => {
      const revokedSessions = await this.sessionRepository.revokeAllForUser(
        actor.userId,
        SessionRevocationReason.LOGOUT_ALL,
      );
      await this.auditLogger.record({
        action: AuditAction.LOGOUT_ALL_SESSIONS,
        entity: AuditEntity.USER,
        entityId: actor.userId,
        metadata: { revokedSessions },
      });
    });
  }
}
