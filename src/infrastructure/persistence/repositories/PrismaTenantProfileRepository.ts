import { randomUUID } from 'node:crypto';
import { DeletedState as StoredDeletedState } from '@prisma/client';
import {
  ITenantProfileRepository,
  TenantProfile,
  TenantProfileChanges,
} from '../../../application/ports/repositories/ITenantProfileRepository.js';
import { DEFAULT_TENANT_TIMEZONE } from '../../../domain/value-objects/timezone.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

/** Adaptador de `ITenantProfileRepository` sobre `Tenant` y `TenantSettings`, siempre con el tenant del contexto. */
export class PrismaTenantProfileRepository extends BasePrismaRepository implements ITenantProfileRepository {
  async findCurrent(): Promise<TenantProfile | null> {
    const record = await this.prisma.tenant.findFirst({
      where: { id: this.tenantId, deleted: StoredDeletedState.INUSE },
      include: { tenantSettings: true },
    });
    if (!record) return null;
    return {
      id: record.id,
      name: record.name,
      logoUrl: record.logoUrl ?? undefined,
      timezone: record.tenantSettings?.timezone ?? DEFAULT_TENANT_TIMEZONE,
    };
  }

  async updateCurrent(changes: TenantProfileChanges): Promise<void> {
    const tenantId = this.tenantId;
    if (changes.name !== undefined) {
      await this.prisma.tenant.updateMany({
        where: { id: tenantId, deleted: StoredDeletedState.INUSE },
        data: { name: changes.name },
      });
    }
    if (changes.timezone !== undefined) {
      await this.prisma.tenantSettings.upsert({
        where: { tenantId },
        create: { id: randomUUID(), tenantId, timezone: changes.timezone },
        update: { timezone: changes.timezone },
      });
    }
  }
}
