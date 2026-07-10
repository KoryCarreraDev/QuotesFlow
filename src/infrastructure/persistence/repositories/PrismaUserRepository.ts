import { IUserRepository } from "../../../application/ports/repositories/IUserRepository.js";
import { User } from "../../../domain/entities/User.js";
import { Role } from "../../../domain/enums/Role.js"
import { BasePrismaRepository } from "./BasePrismaRepository.js";

export class PrismaUserRepository extends BasePrismaRepository implements IUserRepository {
    async create(user: User): Promise<void> {
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

    async findById(id: string): Promise<User | null> {
        const record = await this.prisma.user.findFirst({
            where: { id, tenantId: this.tenantId }
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
            record.updatedAt
        );
    }
}