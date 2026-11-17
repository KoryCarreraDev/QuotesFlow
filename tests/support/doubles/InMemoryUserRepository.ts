import { IUserRepository } from '@/application/ports/repositories/IUserRepository.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { User } from '@/domain/entities/User.js';

/** Campos de `User` que cambian después de crearlo. */
interface MutableUserFields {
  passwordHash: string;
  role: User['role'];
  isActive: boolean;
  failedLoginAttempts: number;
  loginLockedUntil: Date | undefined;
  emailVerifiedAt: Date | undefined;
}

/** Copia del usuario con algunos campos cambiados (la entidad es inmutable). */
export function withUserChanges(user: User, changes: Partial<MutableUserFields>): User {
  const fields: MutableUserFields = {
    passwordHash: user.passwordHash,
    role: user.role,
    isActive: user.isActive,
    failedLoginAttempts: user.failedLoginAttempts,
    loginLockedUntil: user.loginLockedUntil,
    emailVerifiedAt: user.emailVerifiedAt,
    ...changes,
  };
  return new User(
    user.id,
    user.email,
    fields.passwordHash,
    user.firstName,
    user.lastName,
    fields.role,
    fields.isActive,
    user.tenantId,
    user.createdAt,
    user.updatedAt,
    fields.failedLoginAttempts,
    fields.loginLockedUntil,
    fields.emailVerifiedAt,
  );
}

/**
 * Doble en memoria de `IUserRepository`.
 * Igual que `PrismaUserRepository`: `findByEmail` y las búsquedas "across tenants" buscan en todos los tenants
 * (el correo es único global) y `findById` solo dentro del tenant actual.
 */
export class InMemoryUserRepository implements IUserRepository {
  private readonly usersById = new Map<string, User>();

  constructor(private readonly tenantContext: ITenantContext) {}

  /** Carga datos iniciales sin pasar por ningún caso de uso. */
  seed(...users: User[]): void {
    for (const user of users) {
      this.usersById.set(user.id, user);
    }
  }

  /** Todos los usuarios guardados, de cualquier tenant. */
  listStored(): User[] {
    return [...this.usersById.values()];
  }

  /** El usuario guardado, sin filtros. */
  findStoredById(userId: string): User | undefined {
    return this.usersById.get(userId);
  }

  async create(user: User): Promise<void> {
    this.usersById.set(user.id, user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.listStored().find((user) => user.email === email) ?? null;
  }

  /** La entidad `User` no lleva la marca de borrado: aquí solo cuenta `isActive`. */
  async findActiveByEmail(email: string): Promise<User | null> {
    return this.listStored().find((user) => user.email === email && user.isActive) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    const user = this.usersById.get(id);
    return user && user.tenantId === this.tenantContext.getTenantId() ? user : null;
  }

  async findActiveByIdAcrossTenants(userId: string): Promise<User | null> {
    const user = this.usersById.get(userId);
    return user?.isActive ? user : null;
  }

  async recordFailedLogin(userId: string): Promise<number> {
    const user = this.requireStored(userId);
    const failedLoginAttempts = user.failedLoginAttempts + 1;
    this.usersById.set(userId, withUserChanges(user, { failedLoginAttempts }));
    return failedLoginAttempts;
  }

  async lockLogin(userId: string, lockedUntil: Date): Promise<void> {
    this.usersById.set(userId, withUserChanges(this.requireStored(userId), { loginLockedUntil: lockedUntil }));
  }

  async clearFailedLogins(userId: string): Promise<void> {
    this.usersById.set(
      userId,
      withUserChanges(this.requireStored(userId), { failedLoginAttempts: 0, loginLockedUntil: undefined }),
    );
  }

  async markEmailVerified(userId: string): Promise<void> {
    const user = this.requireStored(userId);
    if (!user.isEmailVerified) this.usersById.set(userId, withUserChanges(user, { emailVerifiedAt: new Date() }));
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    this.usersById.set(userId, withUserChanges(this.requireStored(userId), { passwordHash }));
  }

  private requireStored(userId: string): User {
    const user = this.usersById.get(userId);
    if (!user) throw new Error(`User not stored: ${userId}`);
    return user;
  }
}
