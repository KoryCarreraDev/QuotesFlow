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
}
