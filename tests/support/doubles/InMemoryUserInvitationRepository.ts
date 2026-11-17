import { IUserInvitationRepository } from '@/application/ports/repositories/IUserInvitationRepository.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { UserInvitation } from '@/domain/entities/UserInvitation.js';

type InvitationState = Partial<Pick<UserInvitation, 'acceptedAt' | 'revokedAt'>>;

function withState(invitation: UserInvitation, state: InvitationState): UserInvitation {
  return new UserInvitation(
    invitation.id,
    invitation.tenantId,
    invitation.email,
    invitation.role,
    invitation.invitedById,
    invitation.tokenHash,
    invitation.expiresAt,
    invitation.createdAt,
    state.acceptedAt ?? invitation.acceptedAt,
    state.revokedAt ?? invitation.revokedAt,
  );
}

/** Doble en memoria de `IUserInvitationRepository`; respeta el tenant igual que el adaptador Prisma. */
export class InMemoryUserInvitationRepository implements IUserInvitationRepository {
  private readonly invitationsById = new Map<string, UserInvitation>();

  constructor(private readonly tenantContext: ITenantContext) {}

  seed(...invitations: UserInvitation[]): void {
    for (const invitation of invitations) this.invitationsById.set(invitation.id, invitation);
  }

  listStored(): UserInvitation[] {
    return [...this.invitationsById.values()];
  }

  async create(invitation: UserInvitation): Promise<void> {
    this.invitationsById.set(invitation.id, invitation);
  }

  async findByIdAcrossTenants(invitationId: string): Promise<UserInvitation | null> {
    return this.invitationsById.get(invitationId) ?? null;
  }

  async findById(invitationId: string): Promise<UserInvitation | null> {
    const invitation = this.invitationsById.get(invitationId);
    return invitation?.tenantId === this.tenantContext.getTenantId() ? invitation : null;
  }

  async listPending(): Promise<UserInvitation[]> {
    return this.pendingOfTenant();
  }

  async revokePendingForEmail(email: string): Promise<void> {
    for (const invitation of this.pendingOfTenant().filter((pending) => pending.email === email)) {
      this.invitationsById.set(invitation.id, withState(invitation, { revokedAt: new Date() }));
    }
  }

  async revoke(invitationId: string): Promise<void> {
    const invitation = this.pendingOfTenant().find((pending) => pending.id === invitationId);
    if (invitation) this.invitationsById.set(invitation.id, withState(invitation, { revokedAt: new Date() }));
  }

  async markAccepted(invitationId: string): Promise<boolean> {
    const invitation = this.invitationsById.get(invitationId);
    if (!invitation?.isPendingAt(new Date())) return false;
    this.invitationsById.set(invitationId, withState(invitation, { acceptedAt: new Date() }));
    return true;
  }

  private pendingOfTenant(): UserInvitation[] {
    const now = new Date();
    return this.listStored().filter(
      (invitation) => invitation.tenantId === this.tenantContext.getTenantId() && invitation.isPendingAt(now),
    );
  }
}
