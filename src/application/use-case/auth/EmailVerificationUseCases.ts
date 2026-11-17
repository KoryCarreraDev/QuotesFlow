import { IAccountTokenRepository } from '@/application/ports/repositories/IAccountTokenRepository.js';
import { IUserRepository } from '@/application/ports/repositories/IUserRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { EmailTemplate } from '@/application/ports/services/IEmailTemplateRenderer.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { AccountLinks } from '@/application/services/AccountLinks.js';
import { AccountTokenIssuer, EMAIL_VERIFICATION_LIFETIME_HOURS } from '@/application/services/AccountTokenIssuer.js';
import { TransactionalEmailSender } from '@/application/services/TransactionalEmailSender.js';
import { AccountTokenPurpose } from '@/domain/entities/AccountToken.js';

/** No se reenvía otro enlace si el anterior se envió hace menos de esto: evita usar la API para bombardear un buzón. */
export const MINIMUM_SECONDS_BETWEEN_ACCOUNT_EMAILS = 60;
const MILLISECONDS_PER_SECOND = 1_000;

/** Indica si ya se envió un enlace del mismo tipo hace muy poco. */
export async function wasRecentlySent(
  accountTokenRepository: IAccountTokenRepository,
  userId: string,
  purpose: AccountTokenPurpose,
): Promise<boolean> {
  const latestCreatedAt = await accountTokenRepository.findLatestOpenTokenCreatedAt(userId, purpose);
  const cooldownMs = MINIMUM_SECONDS_BETWEEN_ACCOUNT_EMAILS * MILLISECONDS_PER_SECOND;
  return latestCreatedAt !== null && Date.now() - latestCreatedAt.getTime() < cooldownMs;
}

/**
 * Verifica el correo con el enlace recibido (D-12, F2-T04). El enlace es de un solo uso.
 *
 * @throws {ValidationError} `INVALID_ACCOUNT_TOKEN` si no existe, caducó o ya se usó.
 */
export class VerifyEmailUseCase {
  constructor(
    private readonly accountTokenIssuer: AccountTokenIssuer,
    private readonly userRepository: IUserRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(token: string): Promise<void> {
    await this.transactionManager.runInTransaction(async () => {
      const redeemedToken = await this.accountTokenIssuer.redeem(token, AccountTokenPurpose.EMAIL_VERIFICATION);
      await this.userRepository.markEmailVerified(redeemedToken.userId);
      await this.auditLogger.record({
        action: AuditAction.EMAIL_VERIFIED,
        entity: AuditEntity.USER,
        entityId: redeemedToken.userId,
        publicActor: { userId: redeemedToken.userId, tenantId: redeemedToken.tenantId },
      });
    });
  }
}

/**
 * Reenvía el enlace de verificación (F2-T04). Nunca revela si el correo existe ni si ya está verificado: siempre
 * termina igual. Solo vale el último enlace enviado, y como mucho uno por minuto.
 */
export class ResendEmailVerificationUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly accountTokenRepository: IAccountTokenRepository,
    private readonly accountTokenIssuer: AccountTokenIssuer,
    private readonly emailSender: TransactionalEmailSender,
    private readonly accountLinks: AccountLinks,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.userRepository.findActiveByEmail(email);
    if (!user || user.isEmailVerified) return;
    if (await wasRecentlySent(this.accountTokenRepository, user.id, AccountTokenPurpose.EMAIL_VERIFICATION)) return;

    const token = await this.accountTokenIssuer.issue(user, AccountTokenPurpose.EMAIL_VERIFICATION);
    await this.emailSender.send(
      { email: user.email, tenantId: user.tenantId, userId: user.id },
      EmailTemplate.EMAIL_VERIFICATION,
      {
        firstName: user.firstName,
        actionUrl: this.accountLinks.verifyEmail(token),
        expiresInHours: String(EMAIL_VERIFICATION_LIFETIME_HOURS),
      },
    );
  }
}
