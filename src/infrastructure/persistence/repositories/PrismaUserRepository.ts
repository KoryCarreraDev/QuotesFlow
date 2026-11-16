import { DeletedState as StoredDeletedState } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { IUserRepository } from '../../../application/ports/repositories/IUserRepository.js';
import { ConflictError } from '../../../domain/errors/ConflictError.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { User } from '../../../domain/entities/User.js';
import { Role } from '../../../domain/enums/Role.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

// Código de Prisma para una restricción única violada.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION;
}

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
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { email } });
    return record ? this.toDomain(record) : null;
  }

  async findActiveByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({
      where: {
        email,
        isActive: true,
        deleted: StoredDeletedState.INUSE,
        tenant: { deleted: StoredDeletedState.INUSE },
      },
    });
    return record ? this.toDomain(record) : null;
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({
      where: { id, tenantId: this.tenantId, deleted: StoredDeletedState.INUSE },
    });
    return record ? this.toDomain(record) : null;
  }

  private toDomain(record: any): User {
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
    );
  }
}
