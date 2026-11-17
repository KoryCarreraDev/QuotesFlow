import { IUserRepository } from '@/application/ports/repositories/IUserRepository.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { User } from '@/domain/entities/User.js';

/**
 * Doble en memoria de `IUserRepository`.
 * Igual que `PrismaUserRepository`: `findByEmail` busca en todos los tenants (el correo es único global)
 * y `findById` solo dentro del tenant actual.
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

  async recordFailedLogin(userId: string): Promise<number> {
    const user = this.requireStored(userId);
    const failedAttempts = user.failedLoginAttempts + 1;
    this.usersById.set(userId, withLoginState(user, failedAttempts, user.loginLockedUntil));
    return failedAttempts;
  }

  async lockLogin(userId: string, lockedUntil: Date): Promise<void> {
    const user = this.requireStored(userId);
    this.usersById.set(userId, withLoginState(user, user.failedLoginAttempts, lockedUntil));
  }

  async clearFailedLogins(userId: string): Promise<void> {
    this.usersById.set(userId, withLoginState(this.requireStored(userId), 0, undefined));
  }

  private requireStored(userId: string): User {
    const user = this.usersById.get(userId);
    if (!user) throw new Error(`User not stored: ${userId}`);
    return user;
  }
}

function withLoginState(user: User, failedLoginAttempts: number, loginLockedUntil: Date | undefined): User {
  return new User(
    user.id,
    user.email,
    user.passwordHash,
    user.firstName,
    user.lastName,
    user.role,
    user.isActive,
    user.tenantId,
    user.createdAt,
    user.updatedAt,
    failedLoginAttempts,
    loginLockedUntil,
  );
}
