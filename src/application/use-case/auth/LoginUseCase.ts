import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { IssuedSession, SessionIssuer } from '@/application/services/SessionIssuer.js';
import { User } from '@/domain/entities/User.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { UnauthorizedError } from '@/domain/errors/UnauthorizedError.js';
import { lockDurationAfterFailedLogins } from '@/domain/value-objects/loginLockout.js';
import { IUserRepository } from '../../ports/repositories/IUserRepository.js';
import { IHashService } from '../../ports/services/IHashService.js';
import { LoginDTO } from '../../dtos/LoginDTO.js';

/**
 * Inicio de sesión. Con la contraseña correcta abre una sesión (F2-T02): token de acceso corto y refresh token
 * rotatorio.
 *
 * Reglas:
 * - Solo cuentas activas de empresas activas (H3).
 * - Tras 5 fallos seguidos la cuenta se bloquea, cada vez más tiempo, hasta 15 minutos (F2-T03); mientras
 *   tanto ni se comprueba la contraseña. Un acierto pone el contador a cero.
 * - Cualquier fallo (correo inexistente, contraseña incorrecta, cuenta bloqueada o desactivada) responde
 *   igual, `INVALID_CREDENTIALS`, y tarda lo mismo (H22): ni la respuesta ni el tiempo revelan si la cuenta
 *   existe.
 * - Se auditan el acierto, el fallo, el bloqueo y el intento con la cuenta bloqueada.
 *
 * @throws {UnauthorizedError} `INVALID_CREDENTIALS`.
 */
export class LoginUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly hashService: IHashService,
    private readonly sessionIssuer: SessionIssuer,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(dto: LoginDTO): Promise<IssuedSession> {
    const user = await this.userRepository.findActiveByEmail(dto.email);

    if (!user) {
      // Un correo que no existe no se audita: no hay usuario ni empresa a la que asociarlo.
      await this.hashService.compareWithoutHash(dto.password);
      throw invalidCredentialsError();
    }

    const now = new Date();
    if (user.isLoginLockedAt(now)) {
      await this.hashService.compareWithoutHash(dto.password);
      await this.record(AuditAction.LOGIN_REJECTED_ACCOUNT_LOCKED, user);
      throw invalidCredentialsError();
    }

    if (!(await this.hashService.compare(dto.password, user.passwordHash))) {
      await this.registerFailedAttempt(user, now);
      throw invalidCredentialsError();
    }

    return this.transactionManager.runInTransaction(async () => {
      if (user.failedLoginAttempts > 0 || user.loginLockedUntil) await this.userRepository.clearFailedLogins(user.id);
      const issuedSession = await this.sessionIssuer.open(user);
      await this.record(AuditAction.LOGIN_SUCCEEDED, user);
      return issuedSession;
    });
  }

  private async registerFailedAttempt(user: User, now: Date): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      const failedAttempts = await this.userRepository.recordFailedLogin(user.id);
      await this.record(AuditAction.LOGIN_FAILED, user, { failedAttempts });

      const lockDuration = lockDurationAfterFailedLogins(failedAttempts);
      if (lockDuration === undefined) return;
      const lockedUntil = new Date(now.getTime() + lockDuration);
      await this.userRepository.lockLogin(user.id, lockedUntil);
      await this.record(AuditAction.ACCOUNT_LOCKED, user, { failedAttempts, lockedUntil: lockedUntil.toISOString() });
    });
  }

  private async record(action: AuditAction, user: User, metadata?: Record<string, unknown>): Promise<void> {
    await this.auditLogger.record({
      action,
      entity: AuditEntity.USER,
      entityId: user.id,
      metadata,
      publicActor: { userId: user.id, tenantId: user.tenantId },
    });
  }
}

function invalidCredentialsError(): UnauthorizedError {
  return new UnauthorizedError(ErrorCode.INVALID_CREDENTIALS, 'Invalid Credentials');
}
