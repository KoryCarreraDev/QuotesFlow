import { Role } from '../../domain/enums/Role.js';

/** Usuario de la empresa tal como lo ve gestión. Nunca lleva el hash de la contraseña ni datos de bloqueo. */
export interface UserDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt?: Date;
}

/** Invitación pendiente. Nunca lleva el token ni su hash. */
export interface UserInvitationDTO {
  id: string;
  email: string;
  role: Role;
  invitedById: string;
  expiresAt: Date;
  createdAt: Date;
}

/** Datos para invitar a alguien. */
export interface InviteUserDTO {
  email: string;
  role: Role;
}

/** Cambios de gestión sobre un usuario. */
export interface UpdateUserDTO {
  role?: Role;
  isActive?: boolean;
}

/** Datos con los que la persona invitada crea su cuenta. */
export interface AcceptInvitationDTO {
  token: string;
  password: string;
  firstName: string;
  lastName: string;
}
