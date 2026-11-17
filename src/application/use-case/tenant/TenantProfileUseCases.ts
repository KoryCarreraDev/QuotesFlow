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

  async execute(actor: Actor): Promise<TenantProfile> {
    if (!can(actor, Action.TENANT_VIEW)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }
    const profile = await this.tenantProfileRepository.findCurrent();
    // Con sesión válida la empresa existe y está activa (lo comprueba la autenticación): es un fallo interno.
    if (!profile) throw new Error('Tenant of the session not found');
    return profile;
  }
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

  async execute(actor: Actor, changes: TenantProfileChanges): Promise<TenantProfile> {
    if (!can(actor, Action.TENANT_UPDATE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    return this.transactionManager.runInTransaction(async () => {
      await this.tenantProfileRepository.updateCurrent(changes);
      const profile = await this.tenantProfileRepository.findCurrent();
      if (!profile) throw new Error('Tenant of the session not found');
      await this.auditLogger.record({
        action: AuditAction.TENANT_UPDATED,
        entity: AuditEntity.TENANT,
        entityId: profile.id,
        metadata: { changedFields: changedFieldNames(changes) },
      });
      return profile;
    });
  }
}
