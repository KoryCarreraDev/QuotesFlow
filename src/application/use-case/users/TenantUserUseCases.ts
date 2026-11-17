import { randomUUID } from 'node:crypto';
import { InviteUserDTO, UpdateUserDTO, UserDTO, UserInvitationDTO } from '@/application/dtos/UserDTO.js';
import { toUserDTO, toUserInvitationDTO } from '@/application/mappers/UserMapper.js';
import { ISessionRepository } from '@/application/ports/repositories/ISessionRepository.js';
import { ITenantRepository } from '@/application/ports/repositories/ITenantRepository.js';
import { IUserInvitationRepository } from '@/application/ports/repositories/IUserInvitationRepository.js';
import { IUserRepository } from '@/application/ports/repositories/IUserRepository.js';
import {
  AuditAction,
  AuditEntity,
  IAuditLogger,
  changedFieldNames,
} from '@/application/ports/services/IAuditLogger.js';
import { EmailTemplate } from '@/application/ports/services/IEmailTemplateRenderer.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { Action, Actor, can, canManageRole } from '@/application/policies/authorizationPolicy.js';
import { AccountLinks } from '@/application/services/AccountLinks.js';
import { buildCompositeToken, generateOpaqueSecret, hashOpaqueSecret } from '@/application/services/opaqueTokens.js';
import { TransactionalEmailSender } from '@/application/services/TransactionalEmailSender.js';
import { User } from '@/domain/entities/User.js';
import { UserInvitation } from '@/domain/entities/UserInvitation.js';
import { SessionRevocationReason } from '@/domain/entities/UserSession.js';
import { Role } from '@/domain/enums/Role.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';

/** La invitación vence a la semana. */
export const INVITATION_LIFETIME_DAYS = 7;
const MILLISECONDS_PER_DAY = 86_400_000;

/** Nombre de cada rol tal como lo lee la persona invitada (R11: contenido para el cliente final). */
const ROLE_NAMES_IN_SPANISH: ReadonlyMap<Role, string> = new Map([
  [Role.OWNER, 'dueño'],
  [Role.PARTNER, 'socio'],
  [Role.SALES_LEADER, 'líder comercial'],
  [Role.SALES_REP, 'comercial'],
]);

/** Actor con sesión: siempre tiene usuario. */
export type SessionActor = Actor & { userId: string };

/** Lo que comparten los casos de uso de usuarios del tenant. */
export interface TenantUserDependencies {
  userRepository: IUserRepository;
  invitationRepository: IUserInvitationRepository;
  sessionRepository: ISessionRepository;
  tenantRepository: ITenantRepository;
  transactionManager: ITransactionManager;
  auditLogger: IAuditLogger;
  emailSender: TransactionalEmailSender;
  accountLinks: AccountLinks;
}

function insufficientPermissionsError(): ForbiddenError {
  return new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
}

function assertAllowed(actor: Actor, action: Action): void {
  if (!can(actor, action)) throw insufficientPermissionsError();
}

/** Lista los usuarios de la empresa (F2-T05). Solo gestión. @throws {ForbiddenError} */
export class ListTenantUsersUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(actor: Actor): Promise<UserDTO[]> {
    assertAllowed(actor, Action.USER_LIST);
    return (await this.userRepository.listByTenant()).map(toUserDTO);
  }
}

/** Lista las invitaciones pendientes de la empresa (F2-T05). Solo gestión. @throws {ForbiddenError} */
export class ListUserInvitationsUseCase {
  constructor(private readonly invitationRepository: IUserInvitationRepository) {}

  async execute(actor: Actor): Promise<UserInvitationDTO[]> {
    assertAllowed(actor, Action.USER_LIST);
    return (await this.invitationRepository.listPending()).map(toUserInvitationDTO);
  }
}

/**
 * Invita a alguien a la empresa con un rol (F2-T05) y le envía el enlace por correo (7 días, un solo uso).
 *
 * Reglas:
 * - Solo los roles que el actor gestiona (D-16, D-17); nadie invita a otro dueño.
 * - Reinvitar al mismo correo anula la invitación anterior.
 * - Un correo que ya tiene cuenta en la plataforma no se puede invitar: el correo es único.
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {ConflictError} `EMAIL_ALREADY_IN_USE`.
 */
export class InviteUserUseCase {
  constructor(private readonly dependencies: TenantUserDependencies) {}

  async execute(actor: SessionActor, invitation: InviteUserDTO): Promise<UserInvitationDTO> {
    const { userRepository, invitationRepository, transactionManager, auditLogger } = this.dependencies;
    assertAllowed(actor, Action.USER_INVITE);
    if (!canManageRole(actor, invitation.role)) throw insufficientPermissionsError();
    const email = invitation.email.trim().toLowerCase();
    if (await userRepository.findByEmail(email)) {
      throw new ConflictError(ErrorCode.EMAIL_ALREADY_IN_USE, 'Email already in use');
    }

    const inviter = await userRepository.findById(actor.userId);
    if (!inviter) throw insufficientPermissionsError();
    const secret = generateOpaqueSecret();
    const now = new Date();
    const storedInvitation = new UserInvitation(
      randomUUID(),
      inviter.tenantId,
      email,
      invitation.role,
      inviter.id,
      hashOpaqueSecret(secret),
      new Date(now.getTime() + INVITATION_LIFETIME_DAYS * MILLISECONDS_PER_DAY),
      now,
    );

    await transactionManager.runInTransaction(async () => {
      await invitationRepository.revokePendingForEmail(email);
      await invitationRepository.create(storedInvitation);
      await auditLogger.record({
        action: AuditAction.USER_INVITED,
        entity: AuditEntity.USER_INVITATION,
        entityId: storedInvitation.id,
        metadata: { role: storedInvitation.role },
      });
    });

    await this.sendInvitation(inviter, storedInvitation, buildCompositeToken(storedInvitation.id, secret));
    return toUserInvitationDTO(storedInvitation);
  }

  private async sendInvitation(inviter: User, invitation: UserInvitation, token: string): Promise<void> {
    const tenant = await this.dependencies.tenantRepository.findById(invitation.tenantId);
    await this.dependencies.emailSender.send(
      { email: invitation.email, tenantId: invitation.tenantId },
      EmailTemplate.USER_INVITATION,
      {
        inviterName: `${inviter.firstName} ${inviter.lastName}`,
        companyName: tenant?.name ?? 'tu empresa',
        roleName: ROLE_NAMES_IN_SPANISH.get(invitation.role) ?? invitation.role,
        actionUrl: this.dependencies.accountLinks.acceptInvitation(token),
        expiresInDays: String(INVITATION_LIFETIME_DAYS),
      },
    );
  }
}

/**
 * Revoca una invitación pendiente (F2-T05), solo de los roles que el actor gestiona.
 *
 * @throws {NotFoundError} `INVITATION_NOT_FOUND` si no existe, es de otra empresa o ya no está pendiente.
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 */
export class RevokeUserInvitationUseCase {
  constructor(private readonly dependencies: TenantUserDependencies) {}

  async execute(actor: Actor, invitationId: string): Promise<void> {
    const { invitationRepository, transactionManager, auditLogger } = this.dependencies;
    assertAllowed(actor, Action.USER_INVITE);
    const invitation = await invitationRepository.findById(invitationId);
    if (!invitation?.isPendingAt(new Date())) {
      throw new NotFoundError(ErrorCode.INVITATION_NOT_FOUND, 'Invitation not found');
    }
    if (!canManageRole(actor, invitation.role)) throw insufficientPermissionsError();

    await transactionManager.runInTransaction(async () => {
      await invitationRepository.revoke(invitation.id);
      await auditLogger.record({
        action: AuditAction.USER_INVITATION_REVOKED,
        entity: AuditEntity.USER_INVITATION,
        entityId: invitation.id,
      });
    });
  }
}

/**
 * Cambia el rol de un usuario o lo desactiva o reactiva (F2-T05).
 *
 * Reglas:
 * - Solo sobre usuarios con un rol que el actor gestiona, y solo hacia roles que gestiona (D-16, D-17).
 * - Nadie se gestiona a sí mismo: no se quita su rol ni se desactiva.
 * - Desactivar cierra todas sus sesiones al momento; el rol nuevo vale desde su siguiente petición (H2).
 *
 * @throws {NotFoundError} `USER_NOT_FOUND` si no existe o es de otra empresa.
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS` o `CANNOT_MANAGE_OWN_ACCOUNT`.
 */
export class UpdateTenantUserUseCase {
  constructor(private readonly dependencies: TenantUserDependencies) {}

  async execute(actor: SessionActor, userId: string, changes: UpdateUserDTO): Promise<UserDTO> {
    const { userRepository, sessionRepository, transactionManager, auditLogger } = this.dependencies;
    assertAllowed(actor, Action.USER_MANAGE);
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError(ErrorCode.USER_NOT_FOUND, 'User not found');
    if (user.id === actor.userId) {
      throw new ForbiddenError(ErrorCode.CANNOT_MANAGE_OWN_ACCOUNT, 'You cannot change your own role or status');
    }
    const newRole = changes.role ?? user.role;
    if (!canManageRole(actor, user.role) || !canManageRole(actor, newRole)) throw insufficientPermissionsError();

    const deactivates = changes.isActive === false && user.isActive;
    await transactionManager.runInTransaction(async () => {
      await userRepository.updateRoleAndStatus(user.id, changes);
      if (deactivates) await sessionRepository.revokeAllForUser(user.id, SessionRevocationReason.USER_DEACTIVATED);
      await auditLogger.record({
        action: AuditAction.USER_UPDATED,
        entity: AuditEntity.USER,
        entityId: user.id,
        metadata: {
          changedFields: changedFieldNames(changes),
          role: newRole,
          isActive: changes.isActive ?? user.isActive,
        },
      });
    });

    const updatedUser = await userRepository.findById(user.id);
    return toUserDTO(updatedUser ?? user);
  }
}
