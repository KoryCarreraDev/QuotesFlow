import { UserInvitation } from '../../../domain/entities/UserInvitation.js';

/** Invitaciones de usuarios (F2-T05). */
export interface IUserInvitationRepository {
  create(invitation: UserInvitation): Promise<void>;

  /** Por id y en cualquier tenant: aceptar una invitación llega sin sesión. */
  findByIdAcrossTenants(invitationId: string): Promise<UserInvitation | null>;

  /** Invitación del tenant actual, en cualquier estado; `null` si no existe o es de otro tenant. */
  findById(invitationId: string): Promise<UserInvitation | null>;

  /** Invitaciones pendientes (ni aceptadas, ni revocadas, ni caducadas) del tenant actual. */
  listPending(): Promise<UserInvitation[]>;

  /** Revoca las invitaciones pendientes del tenant actual a ese correo: al reinvitar solo vale la última. */
  revokePendingForEmail(email: string): Promise<void>;

  /** Revoca la invitación del tenant actual si sigue pendiente. */
  revoke(invitationId: string): Promise<void>;

  /**
   * Marca la invitación como aceptada solo si sigue pendiente. De dos aceptaciones simultáneas, gana una.
   * @returns `false` si ya no estaba pendiente.
   */
  markAccepted(invitationId: string): Promise<boolean>;
}
