import { TenantProfileDTO } from '@/application/dtos/TenantProfileDTO.js';
import { toTenantProfileDTO } from '@/application/mappers/TenantProfileMapper.js';
import {
  ITenantProfileRepository,
  TenantProfile,
  TenantProfileChanges,
} from '@/application/ports/repositories/ITenantProfileRepository.js';
import {
  AuditAction,
  AuditEntity,
  IAuditLogger,
  changedFieldNames,
  changedValues,
} from '@/application/ports/services/IAuditLogger.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { Action, Actor, can } from '@/application/policies/authorizationPolicy.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';

/**
 * Perfil de la empresa de la sesión (F2-T06): nombre, logo y zona horaria. Lo ve todo el equipo.
 *
 * @throws {ForbiddenError} Si el rol no puede verlo (todos pueden; la política lo confirma).
 */
export class GetTenantProfileUseCase {
  constructor(private readonly tenantProfileRepository: ITenantProfileRepository) {}

  async execute(actor: Actor): Promise<TenantProfileDTO> {
    if (!can(actor, Action.TENANT_VIEW)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }
    const profile = await this.tenantProfileRepository.findCurrent();
    // Con sesión válida la empresa existe y está activa (lo comprueba la autenticación): es un fallo interno.
    if (!profile) throw new Error('Tenant of the session not found');
    return toTenantProfileDTO(profile);
  }
}

// F3-A21: el IVA por defecto y los topes de descuento mueven dinero: se audita de qué a qué. Lista cerrada, sin
// datos personales; el nombre, la zona horaria y el canal de correo solo dejan su nombre de campo.
const AUDITED_TENANT_FIELDS = [
  'defaultTaxRate',
  'maximumDiscountRateSalesRep',
  'maximumDiscountRateSalesLeader',
] as const;

function auditedValuesOf(profile: TenantProfile) {
  return {
    defaultTaxRate: profile.defaultTaxRate,
    maximumDiscountRateSalesRep: profile.maximumDiscountRateSalesRep,
    maximumDiscountRateSalesLeader: profile.maximumDiscountRateSalesLeader,
  };
}

/**
 * Cambia el nombre o la zona horaria de la empresa (F2-T06). Solo dueño y socio (D-16). La zona horaria ya llega
 * validada contra la lista IANA del entorno.
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 */
export class UpdateTenantProfileUseCase {
  constructor(
    private readonly tenantProfileRepository: ITenantProfileRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, changes: TenantProfileChanges): Promise<TenantProfileDTO> {
    if (!can(actor, Action.TENANT_UPDATE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    return this.transactionManager.runInTransaction(async () => {
      const before = await this.tenantProfileRepository.findCurrent();
      await this.tenantProfileRepository.updateCurrent(changes);
      const profile = await this.tenantProfileRepository.findCurrent();
      if (!profile) throw new Error('Tenant of the session not found');
      const values = before
        ? changedValues(auditedValuesOf(before), auditedValuesOf(profile), AUDITED_TENANT_FIELDS)
        : {};
      await this.auditLogger.record({
        action: AuditAction.TENANT_UPDATED,
        entity: AuditEntity.TENANT,
        entityId: profile.id,
        metadata: {
          changedFields: changedFieldNames(changes),
          ...(Object.keys(values).length === 0 ? {} : { changedValues: values }),
        },
      });
      return toTenantProfileDTO(profile);
    });
  }
}
