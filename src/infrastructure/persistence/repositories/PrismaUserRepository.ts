import { DeletedState as StoredDeletedState } from '@prisma/client';
import { type User as UserRecord } from '@prisma/client';
import { IUserRepository } from '../../../application/ports/repositories/IUserRepository.js';
import { ConflictError } from '../../../domain/errors/ConflictError.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { User } from '../../../domain/entities/User.js';
import { Role } from '../../../domain/enums/Role.js';
import { isUniqueConstraintViolation } from '../prisma/prismaErrors.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

// Cuenta que puede usar la plataforma (H3): activa, no borrada y de una empresa no borrada.
const ACTIVE_ACCOUNT_CONDITIONS = {
  isActive: true,
  deleted: StoredDeletedState.INUSE,
  tenant: { deleted: StoredDeletedState.INUSE },
};

export class PrismaUserRepository extends BasePrismaRepository implements IUserRepository {
  /**
   * @throws {ConflictError} `EMAIL_ALREADY_IN_USE` si el correo ya existe. El caso de uso lo comprueba
   * antes, pero dos registros simultáneos pueden pasar esa comprobación a la vez: la restricción única
   * de la base de datos es la que decide.
   */
  async create(user: User): Promise<void> {
    try {
      await this.insert(user);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictError(ErrorCode.EMAIL_ALREADY_IN_USE, 'Email already in use', { cause: error });
      }
      throw error;
    }
  }

  private async insert(user: User): Promise<void> {
    await this.prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        tenantId: user.tenantId,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { email } });
    return record ? this.toDomain(record) : null;
  }

  async findActiveByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({ where: { email, ...ACTIVE_ACCOUNT_CONDITIONS } });
    return record ? this.toDomain(record) : null;
  }

  async findActiveByIdAcrossTenants(userId: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({ where: { id: userId, ...ACTIVE_ACCOUNT_CONDITIONS } });
    return record ? this.toDomain(record) : null;
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({
      where: { id, tenantId: this.tenantId, deleted: StoredDeletedState.INUSE },
    });
    return record ? this.toDomain(record) : null;
  }

  async recordFailedLogin(userId: string): Promise<number> {
    // `increment` es atómico en SQL: dos intentos simultáneos no pisan el contador.
    const record = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    return record.failedLoginAttempts;
  }

  async lockLogin(userId: string, lockedUntil: Date): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { loginLockedUntil: lockedUntil } });
  }

  async clearFailedLogins(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, loginLockedUntil: null },
    });
  }

  private toDomain(record: UserRecord): User {
    return new User(
      record.id,
      record.email,
      record.passwordHash,
      record.firstName,
      record.lastName,
      record.role as Role,
      record.isActive,
      record.tenantId,
      record.createdAt,
      record.updatedAt,
      record.failedLoginAttempts,
      record.loginLockedUntil ?? undefined,
      record.emailVerifiedAt ?? undefined,
    );
  }
}
