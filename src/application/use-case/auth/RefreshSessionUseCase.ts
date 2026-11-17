import { ISessionRepository } from '@/application/ports/repositories/ISessionRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import {
  buildCompositeToken,
  generateOpaqueSecret,
  hashesMatch,
  hashOpaqueSecret,
  parseCompositeToken,
} from '@/application/services/opaqueTokens.js';
import { IssuedSession, SessionIssuer } from '@/application/services/SessionIssuer.js';
import { SessionRevocationReason, UserSession } from '@/domain/entities/UserSession.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { UnauthorizedError } from '@/domain/errors/UnauthorizedError.js';

/**
 * Renueva una sesión (F2-T02, D-09): con un refresh token válido emite un token de acceso nuevo y cambia el
 * refresh token (rotación). La caducidad de la sesión no cambia.
 *
 * Reglas:
 * - Un refresh token ya rotado que vuelve a aparecer significa que alguien más lo tiene: se revoca la sesión
 *   entera y queda en auditoría (`SESSION_REUSE_DETECTED`). Pasa también si dos renovaciones simultáneas usan
 *   el mismo token; el frontend debe renovar de una en una.
 * - Una sesión revocada o caducada, o de un usuario desactivado, no se renueva.
 *
 * @throws {UnauthorizedError} `INVALID_SESSION` en cualquiera de esos casos, sin decir cuál.
 */
export class RefreshSessionUseCase {
  constructor(
    private readonly sessionRepository: ISessionRepository,
    private readonly sessionIssuer: SessionIssuer,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(refreshToken: string | undefined): Promise<IssuedSession> {
    const presentedToken = refreshToken ? parseCompositeToken(refreshToken) : null;
    if (!presentedToken) throw invalidSessionError();

    const session = await this.sessionRepository.findById(presentedToken.recordId);
    if (!session?.isUsableAt(new Date())) throw invalidSessionError();

    const presentedHash = hashOpaqueSecret(presentedToken.secret);
    if (!hashesMatch(presentedHash, session.refreshTokenHash)) {
      await this.revokeReusedSession(session);
      throw invalidSessionError();
    }

    const owner = await this.sessionRepository.findAuthenticatedSession(session.id, session.userId, session.tenantId);
    if (!owner) throw invalidSessionError();

    const newSecret = generateOpaqueSecret();
    const rotated = await this.sessionRepository.rotateRefreshToken(
      session.id,
      presentedHash,
      hashOpaqueSecret(newSecret),
    );
    if (!rotated) {
      await this.revokeReusedSession(session);
      throw invalidSessionError();
    }

    return {
      accessToken: this.sessionIssuer.accessTokenFor(session),
      refreshToken: buildCompositeToken(session.id, newSecret),
    };
  }

  private async revokeReusedSession(session: UserSession): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      await this.sessionRepository.revoke(session.id, SessionRevocationReason.REFRESH_TOKEN_REUSED);
      await this.auditLogger.record({
        action: AuditAction.SESSION_REUSE_DETECTED,
        entity: AuditEntity.SESSION,
        entityId: session.id,
        publicActor: { userId: session.userId, tenantId: session.tenantId },
      });
    });
  }
}

function invalidSessionError(): UnauthorizedError {
  return new UnauthorizedError(ErrorCode.INVALID_SESSION, 'Session is invalid or expired');
}
