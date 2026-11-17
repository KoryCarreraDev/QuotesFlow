import { DeletedState } from '@/domain/enums/DeletedState.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { AccountTokenPurpose } from '@/domain/entities/AccountToken.js';
import { EmailTemplate } from '@/application/ports/services/IEmailTemplateRenderer.js';
import { AccountLinks } from '@/application/services/AccountLinks.js';
import { AccountTokenIssuer, EMAIL_VERIFICATION_LIFETIME_HOURS } from '@/application/services/AccountTokenIssuer.js';
import { TransactionalEmailSender } from '@/application/services/TransactionalEmailSender.js';
import { ITenantRepository } from '../../ports/repositories/ITenantRepository.js';
import { IUserRepository } from '../../ports/repositories/IUserRepository.js';
import { IHashService } from '../../ports/services/IHashService.js';
import { ITransactionManager } from '../../ports/services/ITransactionManager.js';
import { PasswordPolicy } from '../../services/PasswordPolicy.js';
import { ILeadStatusConfigRepository } from '@/application/ports/repositories/ILeadStatusConfigRepository.js';
import { RegisterCompanyDTO } from '../../dtos/RegisterCompanyDTO.js';
import { Tenant } from '../../../domain/entities/Tenant.js';
import { User } from '../../../domain/entities/User.js';
import { Role } from '../../../domain/enums/Role.js';
import { defaultLeadStatuses } from '@/application/constants/defaultLeadStatuses.js';
import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';

/** Respuesta del registro: igual exista o no el correo (H8). */
export interface RegistrationReceipt {
  status: 'PENDING_EMAIL_VERIFICATION';
}

const REGISTRATION_RECEIPT: RegistrationReceipt = { status: 'PENDING_EMAIL_VERIFICATION' };

/** Las dependencias de correo y tokens del registro (F2-T04). */
export interface RegistrationMailing {
  accountTokenIssuer: AccountTokenIssuer;
  emailSender: TransactionalEmailSender;
  accountLinks: AccountLinks;
}

/**
 * Registro de una empresa nueva con su dueño (OWNER) y los 5 estados de lead por defecto, todo en una
 * transacción (H8).
 *
 * Reglas:
 * - La contraseña cumple la política (D-11) antes de escribir nada.
 * - El dueño queda sin verificar y recibe el enlace de verificación (D-12): hasta abrirlo no puede entrar.
 * - Un correo ya registrado no se revela (H8): la respuesta es la misma, se gasta el mismo bcrypt y el dueño
 *   del correo recibe un aviso con enlaces para entrar o recuperar la contraseña. Dos registros simultáneos
 *   con el mismo correo crean una sola empresa y los dos responden igual.
 *
 * @throws {ValidationError} `PASSWORD_TOO_WEAK` o `PASSWORD_BREACHED`.
 */
export class RegisterCompanyAndOwnerUseCase {
  constructor(
    private tenantRepository: ITenantRepository,
    private userRepository: IUserRepository,
    private hashService: IHashService,
    private leadStatusRepository: ILeadStatusConfigRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly mailing: RegistrationMailing,
  ) {}

  async execute(dto: RegisterCompanyDTO): Promise<RegistrationReceipt> {
    await this.passwordPolicy.assertAcceptable(dto.password, { email: dto.ownerEmail });

    // Antes de saber si el correo existe: así las dos respuestas tardan lo mismo (H8).
    const passwordHash = await this.hashService.hash(dto.password);
    const existingUser = await this.userRepository.findByEmail(dto.ownerEmail);
    if (existingUser) {
      await this.notifyExistingAccount(existingUser);
      return REGISTRATION_RECEIPT;
    }

    const tenant = Tenant.create({ name: dto.companyName });
    const owner = User.create({
      email: dto.ownerEmail,
      passwordHash,
      firstName: dto.ownerFirstName,
      lastName: dto.ownerLastName,
      role: Role.OWNER,
      tenantId: tenant.id,
    });

    let verificationToken: string;
    try {
      verificationToken = await this.createCompany(tenant, owner);
    } catch (error) {
      // Otro registro simultáneo ganó el correo (la restricción única decide): misma respuesta (H8).
      if (error instanceof ConflictError && error.code === ErrorCode.EMAIL_ALREADY_IN_USE) return REGISTRATION_RECEIPT;
      throw error;
    }

    await this.mailing.emailSender.send(
      { email: owner.email, tenantId: tenant.id, userId: owner.id },
      EmailTemplate.EMAIL_VERIFICATION,
      {
        firstName: owner.firstName,
        actionUrl: this.mailing.accountLinks.verifyEmail(verificationToken),
        expiresInHours: String(EMAIL_VERIFICATION_LIFETIME_HOURS),
      },
    );
    return REGISTRATION_RECEIPT;
  }

  /** Todo o nada (H8): una empresa sin dueño o sin estados no puede usarse ni volver a registrarse. */
  private async createCompany(tenant: Tenant, owner: User): Promise<string> {
    return this.transactionManager.runInTransaction(async () => {
      await this.tenantRepository.create(tenant);
      await this.userRepository.create(owner);

      for (const statusData of defaultLeadStatuses) {
        const status = LeadStatusConfig.create({
          name: statusData.name,
          order: statusData.order,
          isDefault: statusData.isDefault,
          tenantId: tenant.id,
          color: statusData.color,
          type: statusData.type,
          deleted: DeletedState.ACTIVE,
        });
        await this.leadStatusRepository.create(status);
      }

      const verificationToken = await this.mailing.accountTokenIssuer.issue(
        owner,
        AccountTokenPurpose.EMAIL_VERIFICATION,
      );
      await this.auditLogger.record({
        action: AuditAction.COMPANY_REGISTERED,
        entity: AuditEntity.TENANT,
        entityId: tenant.id,
        publicActor: { userId: owner.id, tenantId: tenant.id },
      });
      return verificationToken;
    });
  }

  /** Solo se avisa a cuentas que pueden usarse: una desactivada no debe recibir enlaces de acceso. */
  private async notifyExistingAccount(existingUser: User): Promise<void> {
    const activeUser = await this.userRepository.findActiveByEmail(existingUser.email);
    if (!activeUser) return;

    await this.auditLogger.record({
      action: AuditAction.REGISTRATION_WITH_EXISTING_EMAIL,
      entity: AuditEntity.USER,
      entityId: activeUser.id,
      publicActor: { userId: activeUser.id, tenantId: activeUser.tenantId },
    });
    await this.mailing.emailSender.send(
      { email: activeUser.email, tenantId: activeUser.tenantId, userId: activeUser.id },
      EmailTemplate.ACCOUNT_ALREADY_REGISTERED,
      {
        firstName: activeUser.firstName,
        loginUrl: this.mailing.accountLinks.login(),
        resetUrl: this.mailing.accountLinks.forgotPassword(),
      },
    );
  }
}
