import {
  ITenantProfileRepository,
  TenantProfile,
  TenantProfileChanges,
} from '@/application/ports/repositories/ITenantProfileRepository.js';
import { DEFAULT_TENANT_TIMEZONE } from '@/domain/value-objects/timezone.js';
import { DEFAULT_TEST_TENANT_ID } from '@tests/support/builders/entityBuilders.js';

/** Doble en memoria de `ITenantProfileRepository` con la empresa de prueba y la configuración por defecto. */
export class InMemoryTenantProfileRepository implements ITenantProfileRepository {
  profile: TenantProfile | null = {
    id: DEFAULT_TEST_TENANT_ID,
    name: 'Aluminios Andinos SAS',
    timezone: DEFAULT_TENANT_TIMEZONE,
    emailDeliveryEnabled: false,
    maximumDiscountRateSalesRep: '10.00',
    maximumDiscountRateSalesLeader: '20.00',
  };

  async findCurrent(): Promise<TenantProfile | null> {
    return this.profile;
  }

  async updateCurrent(changes: TenantProfileChanges): Promise<void> {
    if (!this.profile) return;
    const { defaultTaxRate, ...otherChanges } = changes;
    this.profile = {
      ...this.profile,
      ...otherChanges,
      defaultTaxRate: defaultTaxRate === undefined ? this.profile.defaultTaxRate : (defaultTaxRate ?? undefined),
    };
  }

  async updateLogoKey(logoKey: string | null): Promise<void> {
    if (this.profile) this.profile = { ...this.profile, logoKey: logoKey ?? undefined };
  }
}
