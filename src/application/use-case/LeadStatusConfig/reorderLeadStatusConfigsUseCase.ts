import { LeadStatusConfigDTO } from '../../dtos/LeadStatusConfigDTO.js';
import { ILeadStatusConfigMapper } from '../../ports/mappers/ILeadStatusConfigMapper.js';
import { ILeadStatusConfigRepository } from '../../ports/repositories/ILeadStatusConfigRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '../../ports/services/IAuditLogger.js';
import { ITenantContext } from '../../ports/services/ITenantContext.js';
import { ITransactionManager } from '../../ports/services/ITransactionManager.js';
import { Action, type Actor, can } from '../../policies/authorizationPolicy.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';
import { ValidationError } from '../../../domain/errors/ValidationError.js';

/**
 * Reordena los estados de lead de la empresa (F1-T14). Recibe la lista completa de estados activos en
 * el orden nuevo y les asigna 1..n en una transacción: o cambian todos o ninguno.
 */
export class ReorderLeadStatusConfigsUseCase {
  constructor(
    private readonly leadStatusRepository: ILeadStatusConfigRepository,
    private readonly leadStatusMapper: ILeadStatusConfigMapper,
    private readonly tenantContext: ITenantContext,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  /**
   * @param statusIdsInOrder Todos los estados activos de la empresa, cada uno una vez.
   * @throws {ForbiddenError} Si el rol no puede modificar estados.
   * @throws {ValidationError} `LEAD_STATUS_LIST_MISMATCH` si falta o sobra algún estado, o se repite.
   */
  async execute(statusIdsInOrder: string[], actor: Actor): Promise<LeadStatusConfigDTO[]> {
    if (!can(actor, Action.LEAD_STATUS_UPDATE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    const tenantId = this.tenantContext.getTenantId();
    return this.transactionManager.runInTransaction(async () => {
      const currentStatuses = await this.leadStatusRepository.findAllByTenant(tenantId);
      const currentIds = new Set(currentStatuses.map((status) => status.id));
      const requestedIds = new Set(statusIdsInOrder);
      const sameStatuses =
        requestedIds.size === statusIdsInOrder.length &&
        requestedIds.size === currentIds.size &&
        statusIdsInOrder.every((statusId) => currentIds.has(statusId));
      if (!sameStatuses) {
        throw new ValidationError(
          ErrorCode.LEAD_STATUS_LIST_MISMATCH,
          'statusIds must list every active lead status of the company exactly once',
        );
      }

      await this.leadStatusRepository.reorder(statusIdsInOrder);
      await this.auditLogger.record({
        action: AuditAction.LEAD_STATUS_CONFIGS_REORDERED,
        entity: AuditEntity.LEAD_STATUS_CONFIG,
        entityId: tenantId,
        metadata: { statusIdsInOrder },
      });

      const reorderedStatuses = await this.leadStatusRepository.findAllByTenant(tenantId);
      return reorderedStatuses.map((status) => this.leadStatusMapper.toDTO(status));
    });
  }
}
