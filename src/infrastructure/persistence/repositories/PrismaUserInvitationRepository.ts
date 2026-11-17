import { type UserInvitation as UserInvitationRecord } from '@prisma/client';
import { IUserInvitationRepository } from '../../../application/ports/repositories/IUserInvitationRepository.js';
import { UserInvitation } from '../../../domain/entities/UserInvitation.js';
import { Role } from '../../../domain/enums/Role.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

function toDomain(record: UserInvitationRecord): UserInvitation {
  return new UserInvitation(
    record.id,
    record.tenantId,
    record.email,
    record.role as Role,
    record.invitedById,
    record.tokenHash,
    record.expiresAt,
    record.createdAt,
    record.acceptedAt ?? undefined,
    record.revokedAt ?? undefined,
  );
}

/** Adaptador de `IUserInvitationRepository`. Todo filtra por el tenant actual salvo `findByIdAcrossTenants`. */
export class PrismaUserInvitationRepository extends BasePrismaRepository implements IUserInvitationRepository {
  private pendingConditions() {
    return { tenantId: this.tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } };
  }

  async create(invitation: UserInvitation): Promise<void> {
    await this.prisma.userInvitation.create({
      data: {
        id: invitation.id,
        tenantId: invitation.tenantId,
        email: invitation.email,
        role: invitation.role,
        invitedById: invitation.invitedById,
        tokenHash: invitation.tokenHash,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      },
    });
  }

  // Sin tenant a propósito: quien acepta aún no tiene sesión; el tenant sale de la invitación.
  async findByIdAcrossTenants(invitationId: string): Promise<UserInvitation | null> {
    const record = await this.prisma.userInvitation.findUnique({ where: { id: invitationId } });
    return record ? toDomain(record) : null;
  }

  async findById(invitationId: string): Promise<UserInvitation | null> {
    const record = await this.prisma.userInvitation.findFirst({ where: { id: invitationId, tenantId: this.tenantId } });
    return record ? toDomain(record) : null;
  }

  async listPending(): Promise<UserInvitation[]> {
    const records = await this.prisma.userInvitation.findMany({
      where: this.pendingConditions(),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return records.map(toDomain);
  }

  async revokePendingForEmail(email: string): Promise<void> {
    await this.prisma.userInvitation.updateMany({
      where: { ...this.pendingConditions(), email },
      data: { revokedAt: new Date() },
    });
  }

  async revoke(invitationId: string): Promise<void> {
    await this.prisma.userInvitation.updateMany({
      where: { ...this.pendingConditions(), id: invitationId },
      data: { revokedAt: new Date() },
    });
  }

  async markAccepted(invitationId: string): Promise<boolean> {
    // Comparar y cambiar en una sentencia; sin tenant del contexto, como `findByIdAcrossTenants`.
    const { count } = await this.prisma.userInvitation.updateMany({
      where: { id: invitationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    return count === 1;
  }
}
