import { ITenantRepository } from '../../../application/ports/repositories/ITenantRepository.js';
import { Tenant } from '../../../domain/entities/Tenant.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

export class PrismaTenantRepository extends BasePrismaRepository implements ITenantRepository {
    async create(tenant: Tenant): Promise<void> {
        await this.prisma.tenant.create({
            data: {
                id: tenant.id,
                name: tenant.name,
                logoUrl: tenant.logoUrl,
                settings: tenant.settings ?? undefined,
            },
        });
    }

    async findById(id: string): Promise<Tenant | null> {
        const record = await this.prisma.tenant.findUnique({ where: { id } });
        if (!record) return null;
        return new Tenant(
            record.id,
            record.name,
            record.logoUrl,
            record.settings as Record<string, unknown> | null,
            record.createdAt,
            record.updatedAt
        )
    }
}