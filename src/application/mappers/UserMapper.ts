import { User } from '../../domain/entities/User.js';
import { UserInvitation } from '../../domain/entities/UserInvitation.js';
import { UserDTO, UserInvitationDTO } from '../dtos/UserDTO.js';

// Salida por DTO (R8): ni el hash de la contraseña, ni el estado del bloqueo, ni el token de la invitación.

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
  };
}

export function toUserInvitationDTO(invitation: UserInvitation): UserInvitationDTO {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    invitedById: invitation.invitedById,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}
