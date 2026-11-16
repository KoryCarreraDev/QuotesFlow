import { User } from '../../../domain/entities/User.js';

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
}
