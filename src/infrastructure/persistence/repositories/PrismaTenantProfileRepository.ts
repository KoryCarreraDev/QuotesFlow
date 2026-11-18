import { randomUUID } from 'node:crypto';
import { DeletedState as StoredDeletedState } from '@prisma/client';
import {
  ITenantProfileRepository,
  TenantProfile,
  TenantProfileChanges,
} from '../../../application/ports/repositories/ITenantProfileRepository.js';
import { Percentage } from '../../../domain/value-objects/money.js';
import { DEFAULT_TENANT_TIMEZONE } from '../../../domain/value-objects/timezone.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

// Topes por defecto de la columna (D-25, Q-019), para una empresa sin configuración guardada.
const DEFAULT_MAXIMUM_DISCOUNT_RATE_SALES_REP = '10';
const DEFAULT_MAXIMUM_DISCOUNT_RATE_SALES_LEADER = '20';

/** Porcentaje guardado (`Decimal(5,2)`) como texto de la API: `"19.00"`. */
function percentageText(storedRate: { toFixed(): string } | string): string {
  return Percentage.fromDecimalString(
    typeof storedRate === 'string' ? storedRate : storedRate.toFixed(),
  ).toDecimalString();
}

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
      logoKey: record.logoUrl ?? undefined,
      timezone: record.tenantSettings?.timezone ?? DEFAULT_TENANT_TIMEZONE,
      emailDeliveryEnabled: record.tenantSettings?.emailDeliveryEnabled ?? false,
      defaultTaxRate: record.tenantSettings?.defaultTaxRate
        ? percentageText(record.tenantSettings.defaultTaxRate)
        : undefined,
      maximumDiscountRateSalesRep: percentageText(
        record.tenantSettings?.maximumDiscountRateSalesRep ?? DEFAULT_MAXIMUM_DISCOUNT_RATE_SALES_REP,
      ),
      maximumDiscountRateSalesLeader: percentageText(
        record.tenantSettings?.maximumDiscountRateSalesLeader ?? DEFAULT_MAXIMUM_DISCOUNT_RATE_SALES_LEADER,
      ),
    };
  }

  async updateLogoKey(logoKey: string | null): Promise<string | undefined> {
    // `FOR UPDATE` bloquea la fila: un segundo cambio espera, lee la clave que dejó el primero y la devuelve.
    const rows = await this.prisma.$queryRaw<Array<{ previousKey: string | null }>>`
      WITH previous AS (
        SELECT "logoUrl" FROM "Tenant" WHERE "id" = ${this.tenantId} AND "deleted" = 'INUSE'::"DeletedState" FOR UPDATE
      )
      UPDATE "Tenant" SET "logoUrl" = ${logoKey}
      FROM previous
      WHERE "Tenant"."id" = ${this.tenantId}
      RETURNING previous."logoUrl" AS "previousKey"`;
    return rows[0]?.previousKey ?? undefined;
  }

  async updateCurrent(changes: TenantProfileChanges): Promise<void> {
    const tenantId = this.tenantId;
    if (changes.name !== undefined) {
      await this.prisma.tenant.updateMany({
        where: { id: tenantId, deleted: StoredDeletedState.INUSE },
        data: { name: changes.name },
      });
    }
    const settingsChanges = {
      timezone: changes.timezone,
      emailDeliveryEnabled: changes.emailDeliveryEnabled,
      defaultTaxRate: changes.defaultTaxRate,
      maximumDiscountRateSalesRep: changes.maximumDiscountRateSalesRep,
      maximumDiscountRateSalesLeader: changes.maximumDiscountRateSalesLeader,
    };
    if (Object.values(settingsChanges).some((value) => value !== undefined)) {
      await this.prisma.tenantSettings.upsert({
        where: { tenantId },
        create: { id: randomUUID(), tenantId, ...settingsChanges },
        update: settingsChanges,
      });
    }
  }
}
