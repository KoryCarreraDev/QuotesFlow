import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { LeadStatusType } from '@/domain/enums/LeadStatusType.js';
import { ensureDefaultStatusIsOpen } from './leadStatusRules.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { Action, can } from '@/application/policies/authorizationPolicy.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { CreateLeadStatusConfigDTO } from '@/application/dtos/CreateLeadStatusConfigDTO.js';
import { ILeadStatusConfigRepository } from '@/application/ports/repositories/ILeadStatusConfigRepository.js';
import { ILeadStatusConfigMapper } from '@/application/ports/mappers/ILeadStatusConfigMapper.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';
import { Role } from '@/domain/enums/Role.js';

/**
 * Crea un estado de lead. Solo gestión. Si es el predeterminado, desmarca el anterior en la misma transacción; el predeterminado tiene que ser OPEN.
 *
 * @throws {ForbiddenError} Si el rol no puede crear estados.
 * @throws {ValidationError} `DEFAULT_LEAD_STATUS_MUST_BE_OPEN`.
 * @throws {ConflictError} `LEAD_STATUS_ORDER_TAKEN` si el orden ya lo usa otro estado.
 */
export class CreateLeadStatusConfigUseCase {
  constructor(
    private readonly leadStatusRepository: ILeadStatusConfigRepository,
    private readonly leadStatusMapper: ILeadStatusConfigMapper,
    private readonly tenantContext: ITenantContext,
    private readonly auditLogger: IAuditLogger,
    private readonly transactionManager: ITransactionManager,
  ) {}

  async execute(createLeadStatus: CreateLeadStatusConfigDTO, role: string) {
    const tenantId = this.tenantContext.getTenantId();

    if (!tenantId) {
      throw new Error('Tenant not found');
    }

    if (!can({ role: role as Role }, Action.LEAD_STATUS_CREATE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    const statusType = createLeadStatus.type ?? LeadStatusType.OPEN;
    ensureDefaultStatusIsOpen(createLeadStatus.isDefault, statusType);

    // Todo o nada (F1-T14): si la creación falla (orden repetido), el predeterminado anterior se conserva.
    return this.transactionManager.runInTransaction(async () => {
      const defaultStatus = await this.leadStatusRepository.findDefaultByTenant(tenantId);

      if (createLeadStatus.isDefault === true) {
        if (defaultStatus) {
          const oldDefaultLeadStatus = new LeadStatusConfig(
            defaultStatus.id,
            defaultStatus.name,
            defaultStatus.order,
            false,
            new Date(),
            defaultStatus.createdAt,
            defaultStatus.color,
            tenantId,
            defaultStatus.deleted,
            defaultStatus.type,
          );
          await this.leadStatusRepository.update(oldDefaultLeadStatus.id, oldDefaultLeadStatus);
        }
      }

      const leadStatusEntity = LeadStatusConfig.create({
        name: createLeadStatus.name,
        order: createLeadStatus.order,
        isDefault: createLeadStatus.isDefault,
        tenantId: tenantId,
        color: createLeadStatus.color,
        type: statusType,
      });

      await this.leadStatusRepository.create(leadStatusEntity);
      await this.auditLogger.record({
        action: AuditAction.LEAD_STATUS_CONFIG_CREATED,
        entity: AuditEntity.LEAD_STATUS_CONFIG,
        entityId: leadStatusEntity.id,
      });
      return this.leadStatusMapper.toDTO(leadStatusEntity);
    });
  }
}
