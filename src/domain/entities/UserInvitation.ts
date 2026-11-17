import { Role } from '../enums/Role.js';

/**
 * Invitación a unirse a una empresa con un rol (F2-T05). El enlace del correo lleva `<id>.<secreto>`; aquí solo
 * se guarda el hash SHA-256 del secreto. Una invitación vale una vez, hasta `expiresAt`, si no se revocó.
 */
export class UserInvitation {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly email: string,
    public readonly role: Role,
    public readonly invitedById: string,
    public readonly tokenHash: string,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
    public readonly acceptedAt?: Date,
    public readonly revokedAt?: Date,
  ) {}

  /** Sigue esperando respuesta: ni aceptada, ni revocada, ni caducada. */
  isPendingAt(moment: Date): boolean {
    return this.acceptedAt === undefined && this.revokedAt === undefined && this.expiresAt.getTime() > moment.getTime();
  }
}
