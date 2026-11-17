import { User } from '../../../domain/entities/User.js';

/**
 * Persistencia de usuarios. El correo es único en toda la plataforma; el resto de consultas se acota al tenant.
 */
export interface IUserRepository {
  create(user: User): Promise<void>;

  /** Busca en todos los tenants (el correo es único en la plataforma), incluidas cuentas desactivadas o borradas. */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Usuario que puede iniciar sesión (H3): activo, no borrado y de una empresa no borrada.
   * Busca en todos los tenants, como `findByEmail`.
   */
  findActiveByEmail(email: string): Promise<User | null>;

  /** Usuario no borrado del tenant actual. Puede estar desactivado: lo decide quien llama. */
  findById(id: string): Promise<User | null>;

  /**
   * Suma un fallo de login de forma atómica (dos fallos simultáneos cuentan dos) y devuelve el total.
   * Por id, sin tenant: el login aún no tiene sesión.
   */
  recordFailedLogin(userId: string): Promise<number>;

  /** Bloquea el login de la cuenta hasta ese momento. */
  lockLogin(userId: string, lockedUntil: Date): Promise<void>;

  /** Pone a cero los fallos y quita el bloqueo, tras un login correcto. */
  clearFailedLogins(userId: string): Promise<void>;

  /**
   * Usuario activo y no borrado de una empresa no borrada, por id y en cualquier tenant: la recuperación de
   * contraseña llega sin sesión y el tenant sale del token.
   */
  findActiveByIdAcrossTenants(userId: string): Promise<User | null>;

  /** Marca el correo como verificado ahora, si aún no lo estaba (D-12). */
  markEmailVerified(userId: string): Promise<void>;

  /** Guarda el hash de la contraseña nueva. */
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;

  /** Usuarios no borrados del tenant actual, activos o no, por fecha de alta. */
  listByTenant(): Promise<User[]>;

  /** Cambia el rol o el estado activo de un usuario del tenant actual (F2-T05). */
  updateRoleAndStatus(userId: string, changes: { role?: User['role']; isActive?: boolean }): Promise<void>;
}
