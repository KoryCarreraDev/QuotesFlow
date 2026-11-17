import { AcceptInvitationDTO } from '@/application/dtos/UserDTO.js';
import { ITenantRepository } from '@/application/ports/repositories/ITenantRepository.js';
import { IUserInvitationRepository } from '@/application/ports/repositories/IUserInvitationRepository.js';
import { IUserRepository } from '@/application/ports/repositories/IUserRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { IHashService } from '@/application/ports/services/IHashService.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { hashesMatch, hashOpaqueSecret, parseCompositeToken } from '@/application/services/opaqueTokens.js';
import { PasswordPolicy } from '@/application/services/PasswordPolicy.js';
import { IssuedSession, SessionIssuer } from '@/application/services/SessionIssuer.js';
import { User } from '@/domain/entities/User.js';
import { UserInvitation } from '@/domain/entities/UserInvitation.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';

/** Lo que necesita aceptar una invitación. */
export interface AcceptInvitationDependencies {
  invitationRepository: IUserInvitationRepository;
  userRepository: IUserRepository;
  tenantRepository: ITenantRepository;
  hashService: IHashService;
  passwordPolicy: PasswordPolicy;
  sessionIssuer: SessionIssuer;
  transactionManager: ITransactionManager;
  auditLogger: IAuditLogger;
}

function invalidInvitationError(): ValidationError {
  return new ValidationError(ErrorCode.INVALID_ACCOUNT_TOKEN, 'Token is invalid, expired or already used');
}

/**
 * Acepta una invitación (F2-T05): crea la cuenta con el rol invitado, con el correo ya verificado (el enlace
 * llegó a ese buzón), y abre la sesión.
 *
 * Reglas:
 * - La invitación vale una vez, hasta que vence, si no se revocó y su empresa sigue activa.
 * - La contraseña cumple la política (D-11); si no, la invitación sigue sirviendo.
 *
 * @throws {ValidationError} `INVALID_ACCOUNT_TOKEN`, `PASSWORD_TOO_WEAK` o `PASSWORD_BREACHED`.
 * @throws {ConflictError} `EMAIL_ALREADY_IN_USE` si entretanto se creó una cuenta con ese correo.
 */
export class AcceptInvitationUseCase {
  constructor(private readonly dependencies: AcceptInvitationDependencies) {}

  async execute(acceptance: AcceptInvitationDTO): Promise<IssuedSession> {
    const { userRepository, hashService, passwordPolicy, sessionIssuer, transactionManager, auditLogger } =
      this.dependencies;
    const invitation = await this.findPendingInvitation(acceptance.token);
    await passwordPolicy.assertAcceptable(acceptance.password, { email: invitation.email });
    const user = User.create({
      email: invitation.email,
      passwordHash: await hashService.hash(acceptance.password),
      firstName: acceptance.firstName,
      lastName: acceptance.lastName,
      role: invitation.role,
      tenantId: invitation.tenantId,
      emailVerifiedAt: new Date(),
    });

    return transactionManager.runInTransaction(async () => {
      if (!(await this.dependencies.invitationRepository.markAccepted(invitation.id))) throw invalidInvitationError();
      await userRepository.create(user);
      await auditLogger.record({
        action: AuditAction.USER_INVITATION_ACCEPTED,
        entity: AuditEntity.USER_INVITATION,
        entityId: invitation.id,
        publicActor: { userId: user.id, tenantId: user.tenantId },
      });
      return sessionIssuer.open(user);
    });
  }

  private async findPendingInvitation(token: string): Promise<UserInvitation> {
    const presentedToken = parseCompositeToken(token);
    const invitation = presentedToken
      ? await this.dependencies.invitationRepository.findByIdAcrossTenants(presentedToken.recordId)
      : null;
    if (
      !presentedToken ||
      !invitation ||
      !hashesMatch(hashOpaqueSecret(presentedToken.secret), invitation.tokenHash) ||
      !invitation.isPendingAt(new Date()) ||
      !(await this.dependencies.tenantRepository.findById(invitation.tenantId))
    ) {
      throw invalidInvitationError();
    }
    return invitation;
  }
}
