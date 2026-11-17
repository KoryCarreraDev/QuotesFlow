import { IAccountTokenRepository } from '@/application/ports/repositories/IAccountTokenRepository.js';
import { ISessionRepository } from '@/application/ports/repositories/ISessionRepository.js';
import { IUserRepository } from '@/application/ports/repositories/IUserRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { EmailTemplate } from '@/application/ports/services/IEmailTemplateRenderer.js';
import { IHashService } from '@/application/ports/services/IHashService.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { AccountLinks } from '@/application/services/AccountLinks.js';
import { AccountTokenIssuer, PASSWORD_RESET_LIFETIME_MINUTES } from '@/application/services/AccountTokenIssuer.js';
import { PasswordPolicy } from '@/application/services/PasswordPolicy.js';
import { TransactionalEmailSender } from '@/application/services/TransactionalEmailSender.js';
import { AccountTokenPurpose } from '@/domain/entities/AccountToken.js';
import { SessionRevocationReason } from '@/domain/entities/UserSession.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { wasRecentlySent } from './EmailVerificationUseCases.js';

/** Lo que comparten los casos de uso de recuperación. */
export interface PasswordResetDependencies {
  userRepository: IUserRepository;
  accountTokenRepository: IAccountTokenRepository;
  accountTokenIssuer: AccountTokenIssuer;
  emailSender: TransactionalEmailSender;
  accountLinks: AccountLinks;
  transactionManager: ITransactionManager;
  auditLogger: IAuditLogger;
}

/**
 * Pide recuperar la contraseña (F2-T04). Siempre termina igual: no revela si el correo existe. Si existe una
 * cuenta activa, le envía un enlace de un solo uso que vence en 30 minutos; como mucho uno por minuto.
 */
export class RequestPasswordResetUseCase {
  constructor(private readonly dependencies: PasswordResetDependencies) {}

  async execute(email: string): Promise<void> {
    const { userRepository, accountTokenRepository, accountTokenIssuer, transactionManager, auditLogger } =
      this.dependencies;
    const user = await userRepository.findActiveByEmail(email);
    if (!user) return;
    if (await wasRecentlySent(accountTokenRepository, user.id, AccountTokenPurpose.PASSWORD_RESET)) return;

    const token = await transactionManager.runInTransaction(async () => {
      const issuedToken = await accountTokenIssuer.issue(user, AccountTokenPurpose.PASSWORD_RESET);
      await auditLogger.record({
        action: AuditAction.PASSWORD_RESET_REQUESTED,
        entity: AuditEntity.USER,
        entityId: user.id,
        publicActor: { userId: user.id, tenantId: user.tenantId },
      });
      return issuedToken;
    });

    await this.dependencies.emailSender.send(
      { email: user.email, tenantId: user.tenantId, userId: user.id },
      EmailTemplate.PASSWORD_RESET,
      {
        firstName: user.firstName,
        actionUrl: this.dependencies.accountLinks.resetPassword(token),
        expiresInMinutes: String(PASSWORD_RESET_LIFETIME_MINUTES),
      },
    );
  }
}

/**
 * Elige una contraseña nueva con el enlace de recuperación (F2-T04).
 *
 * Reglas:
 * - La contraseña cumple la política (D-11); si no, el enlace sigue sirviendo para otro intento.
 * - Al cambiarla se cierran todas las sesiones del usuario, se quita el bloqueo por fallos y el correo queda
 *   verificado (el enlace prueba que controla el buzón). Se avisa por correo del cambio.
 *
 * @throws {ValidationError} `INVALID_ACCOUNT_TOKEN`, `PASSWORD_TOO_WEAK` o `PASSWORD_BREACHED`.
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly dependencies: PasswordResetDependencies,
    private readonly sessionRepository: ISessionRepository,
    private readonly hashService: IHashService,
    private readonly passwordPolicy: PasswordPolicy,
  ) {}

  async execute(token: string, newPassword: string): Promise<void> {
    const { accountTokenIssuer, userRepository, transactionManager, auditLogger } = this.dependencies;
    // Comprobar sin gastar el enlace: la consulta de filtraciones y bcrypt no van dentro de la transacción.
    const inspectedToken = await accountTokenIssuer.inspect(token, AccountTokenPurpose.PASSWORD_RESET);
    const user = await userRepository.findActiveByIdAcrossTenants(inspectedToken.userId);
    if (!user) throw new ValidationError(ErrorCode.INVALID_ACCOUNT_TOKEN, 'Token is invalid, expired or already used');
    await this.passwordPolicy.assertAcceptable(newPassword, user);
    const passwordHash = await this.hashService.hash(newPassword);

    await transactionManager.runInTransaction(async () => {
      await accountTokenIssuer.redeem(token, AccountTokenPurpose.PASSWORD_RESET);
      await userRepository.updatePasswordHash(user.id, passwordHash);
      await userRepository.clearFailedLogins(user.id);
      await userRepository.markEmailVerified(user.id);
      await this.sessionRepository.revokeAllForUser(user.id, SessionRevocationReason.PASSWORD_CHANGED);
      await auditLogger.record({
        action: AuditAction.PASSWORD_RESET_COMPLETED,
        entity: AuditEntity.USER,
        entityId: user.id,
        publicActor: { userId: user.id, tenantId: user.tenantId },
      });
    });

    await this.dependencies.emailSender.send(
      { email: user.email, tenantId: user.tenantId, userId: user.id },
      EmailTemplate.PASSWORD_CHANGED,
      { firstName: user.firstName, resetUrl: this.dependencies.accountLinks.forgotPassword() },
    );
  }
}
