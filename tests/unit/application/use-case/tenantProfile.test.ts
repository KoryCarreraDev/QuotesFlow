import { describe, expect, it } from 'vitest';
import {
  ITenantProfileRepository,
  TenantProfile,
  TenantProfileChanges,
} from '@/application/ports/repositories/ITenantProfileRepository.js';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import {
  GetTenantProfileUseCase,
  UpdateTenantProfileUseCase,
} from '@/application/use-case/tenant/TenantProfileUseCases.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { DEFAULT_TENANT_TIMEZONE, isSupportedTimezone } from '@/domain/value-objects/timezone.js';
import { DEFAULT_TEST_TENANT_ID } from '@tests/support/builders/entityBuilders.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

// F2-T06: perfil y configuración de la empresa.

class InMemoryTenantProfileRepository implements ITenantProfileRepository {
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
    this.profile = { ...this.profile, ...otherChanges, defaultTaxRate: defaultTaxRate ?? undefined };
  }
}

function setup() {
  const repository = new InMemoryTenantProfileRepository();
  const auditLogger = new RecordingAuditLogger();
  return {
    repository,
    auditLogger,
    getProfile: new GetTenantProfileUseCase(repository),
    updateProfile: new UpdateTenantProfileUseCase(repository, new RecordingTransactionManager(), auditLogger),
  };
}

describe('zona horaria', () => {
  it('por defecto es America/Bogota', () => {
    expect(DEFAULT_TENANT_TIMEZONE).toBe('America/Bogota');
  });

  it.each(['America/Bogota', 'Europe/Madrid', 'UTC'])('%s es una zona IANA válida', (timezone) => {
    expect(isSupportedTimezone(timezone)).toBe(true);
  });

  it.each(['Bogota', 'GMT-5', '', 'America/Atlantida'])('"%s" no es una zona válida', (timezone) => {
    expect(isSupportedTimezone(timezone)).toBe(false);
  });
});

describe('Perfil de la empresa', () => {
  it('todo el equipo ve el perfil', async () => {
    const { getProfile } = setup();

    await expect(getProfile.execute({ role: Role.SALES_REP, userId: 'rep' })).resolves.toMatchObject({
      name: 'Aluminios Andinos SAS',
      timezone: 'America/Bogota',
    });
  });

  it('el socio cambia el nombre y la zona horaria, y queda auditado con los campos cambiados (D-16)', async () => {
    const { updateProfile, auditLogger } = setup();

    const profile = await updateProfile.execute(
      { role: Role.PARTNER, userId: 'partner' },
      { name: 'Aluminios Andinos SAS BIC', timezone: 'America/Lima' },
    );

    expect(profile).toMatchObject({ name: 'Aluminios Andinos SAS BIC', timezone: 'America/Lima' });
    expect(auditLogger.entries).toEqual([
      expect.objectContaining({
        action: AuditAction.TENANT_UPDATED,
        metadata: { changedFields: ['name', 'timezone'] },
      }),
    ]);
  });

  it.each([Role.SALES_LEADER, Role.SALES_REP])('%s no cambia el perfil', async (role) => {
    const { updateProfile, repository } = setup();

    await expect(updateProfile.execute({ role, userId: 'someone' }, { name: 'Otro nombre' })).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
    expect(repository.profile?.name).toBe('Aluminios Andinos SAS');
  });

  it('el correo de la empresa empieza desactivado y el dueño lo activa, auditado (D-57)', async () => {
    const { getProfile, updateProfile, auditLogger } = setup();

    await expect(getProfile.execute({ role: Role.OWNER, userId: 'owner' })).resolves.toMatchObject({
      emailDeliveryEnabled: false,
    });
    const profile = await updateProfile.execute({ role: Role.OWNER, userId: 'owner' }, { emailDeliveryEnabled: true });

    expect(profile.emailDeliveryEnabled).toBe(true);
    expect(auditLogger.entries).toEqual([
      expect.objectContaining({ metadata: { changedFields: ['emailDeliveryEnabled'] } }),
    ]);
  });

  it('un rol desconocido no ve el perfil', async () => {
    const { getProfile } = setup();

    await expect(getProfile.execute({ role: 'UNKNOWN' as Role })).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
  });

  it('si la empresa de la sesión no existe es un fallo interno, no un 404', async () => {
    const { getProfile, repository } = setup();
    repository.profile = null;

    await expect(getProfile.execute({ role: Role.OWNER, userId: 'owner' })).rejects.toThrow(
      'Tenant of the session not found',
    );
  });
});
