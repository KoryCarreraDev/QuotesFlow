import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { ensureDefaultStatusIsOpen } from './leadStatusRules.js';
import {
  AuditAction,
  AuditEntity,
  IAuditLogger,
  changedFieldNames,
} from '@/application/ports/services/IAuditLogger.js';
import { Action, can } from '@/application/policies/authorizationPolicy.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { UpdateLeadStatusConfigDTO } from '@/application/dtos/UpdateLeadStatusConfigDTO.js';
import { ILeadStatusConfigMapper } from '@/application/ports/mappers/ILeadStatusConfigMapper.js';
import { ILeadStatusConfigRepository } from '@/application/ports/repositories/ILeadStatusConfigRepository.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Role } from '@/domain/enums/Role.js';
import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';
import { error } from 'node:console';

export class UpdateLeadStatusConfigUseCase {
  constructor(
    private readonly statusRepo: ILeadStatusConfigRepository,
    private readonly statusMap: ILeadStatusConfigMapper,
    private readonly tenantContext: ITenantContext,
    private readonly auditLogger: IAuditLogger,
    private readonly transactionManager: ITransactionManager,
  ) {}

  async execute(statusId: string, statusUpdate: UpdateLeadStatusConfigDTO, role: Role, userId: string) {
    if (!statusId || !statusUpdate || !role || !userId) {
      throw new ValidationError(ErrorCode.MISSING_REQUIRED_DATA, 'All information is required');
    }

    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant Id is required');
    }

    const statusProperty = await this.statusRepo.findById(statusId);
    if (!statusProperty) {
      throw new NotFoundError(ErrorCode.LEAD_STATUS_NOT_FOUND, 'Status Lead not found');
    }

    if (!can({ role, userId }, Action.LEAD_STATUS_UPDATE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    const resultingType = statusUpdate.type ?? statusProperty.type;
    ensureDefaultStatusIsOpen(statusUpdate.isDefault ?? statusProperty.isDefault, resultingType);

    // Todo o nada: el cambio de predeterminado y la modificación se confirman juntos.
    return this.transactionManager.runInTransaction(async () => {
      const defaultStatus = await this.statusRepo.findDefaultByTenant(tenantId);

      if (defaultStatus?.id === statusId && statusUpdate.isDefault === false) {
        throw new ConflictError(
          ErrorCode.DEFAULT_LEAD_STATUS_REQUIRED,
          'You cannot disable a default state without first having another one',
        );
      }

      if (statusUpdate.isDefault === true) {
        if (defaultStatus && defaultStatus?.id !== statusId) {
          const oldDefaultStatus = new LeadStatusConfig(
            defaultStatus!.id,
            defaultStatus!.name,
            defaultStatus!.order,
            false,
            new Date(),
            defaultStatus!.createdAt,
            defaultStatus!.color,
            tenantId,
            defaultStatus!.deleted,
            defaultStatus!.type,
          );
          await this.statusRepo.update(oldDefaultStatus.id, oldDefaultStatus);
        }
      }

      const updateStatus = new LeadStatusConfig(
        statusProperty.id,
        statusUpdate.name !== undefined ? statusUpdate.name : statusProperty.name,
        statusUpdate.order !== undefined ? statusUpdate.order : statusProperty.order,
        statusUpdate.isDefault !== undefined ? statusUpdate.isDefault : statusProperty.isDefault,
        new Date(),
        statusProperty.createdAt,
        statusUpdate.color !== undefined ? statusUpdate.color : statusProperty.color,
        tenantId,
        statusProperty.deleted,
        resultingType,
      );

      await this.statusRepo.update(statusProperty.id, updateStatus);
      await this.auditLogger.record({
        action: AuditAction.LEAD_STATUS_CONFIG_UPDATED,
        entity: AuditEntity.LEAD_STATUS_CONFIG,
        entityId: statusProperty.id,
        metadata: { changedFields: changedFieldNames(statusUpdate) },
      });

      return this.statusMap.toDTO(updateStatus);
    });
  }
}
