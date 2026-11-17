import { randomUUID } from 'node:crypto';
import { DeletedState as StoredDeletedState, Prisma } from '@prisma/client';
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
        // El dominio no conoce los tipos JSON de Prisma; el adaptador hace la conversión.
        settings: (tenant.settings ?? undefined) as Prisma.InputJsonObject | undefined,
        // F2-T06: toda empresa nace con su configuración (zona horaria por defecto de la base).
        tenantSettings: { create: { id: randomUUID() } },
      },
    });
  }

  async findById(id: string): Promise<Tenant | null> {
    const record = await this.prisma.tenant.findFirst({ where: { id, deleted: StoredDeletedState.INUSE } });
    if (!record) return null;
    return new Tenant(
      record.id,
      record.name,
      record.logoUrl,
      record.settings as Record<string, unknown> | null,
      record.createdAt,
      record.updatedAt,
    );
  }
}
