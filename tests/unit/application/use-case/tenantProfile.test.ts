import { describe, expect, it } from 'vitest';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import {
  GetTenantProfileUseCase,
  UpdateTenantProfileUseCase,
} from '@/application/use-case/tenant/TenantProfileUseCases.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { DEFAULT_TENANT_TIMEZONE, isSupportedTimezone } from '@/domain/value-objects/timezone.js';
import { InMemoryTenantProfileRepository } from '@tests/support/doubles/InMemoryTenantProfileRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

// F2-T06: perfil y configuración de la empresa.

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

describe('auditoría de valores sensibles (F3-A21)', () => {
  const partner = { role: Role.PARTNER, userId: 'partner' };

  it('el IVA por defecto y los topes de descuento dejan el valor anterior y el nuevo', async () => {
    const { updateProfile, auditLogger } = setup();

    await updateProfile.execute(partner, { defaultTaxRate: '19.00', maximumDiscountRateSalesRep: '100.00' });
    await updateProfile.execute(partner, { maximumDiscountRateSalesRep: '10.00', defaultTaxRate: null });

    expect(auditLogger.entries.map((entry) => entry.metadata)).toEqual([
      {
        changedFields: ['defaultTaxRate', 'maximumDiscountRateSalesRep'],
        changedValues: {
          defaultTaxRate: { from: null, to: '19.00' },
          maximumDiscountRateSalesRep: { from: '10.00', to: '100.00' },
        },
      },
      {
        changedFields: ['defaultTaxRate', 'maximumDiscountRateSalesRep'],
        changedValues: {
          defaultTaxRate: { from: '19.00', to: null },
          maximumDiscountRateSalesRep: { from: '100.00', to: '10.00' },
        },
      },
    ]);
  });

  it('un campo que se envía con el mismo valor que ya tenía no se registra como cambio de valor', async () => {
    const { updateProfile, auditLogger } = setup();

    await updateProfile.execute(partner, { maximumDiscountRateSalesLeader: '20.00' });

    expect(auditLogger.entries[0].metadata).toEqual({ changedFields: ['maximumDiscountRateSalesLeader'] });
  });

  it('el nombre y la zona horaria no llevan valores: solo se sensibilizan los campos de la lista', async () => {
    const { updateProfile, auditLogger } = setup();

    await updateProfile.execute(partner, { name: 'Otro Nombre SAS', timezone: 'America/Lima' });

    expect(JSON.stringify(auditLogger.entries[0].metadata)).not.toContain('Otro Nombre');
  });
});

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
