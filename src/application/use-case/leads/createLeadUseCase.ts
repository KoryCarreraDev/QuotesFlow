import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { Action, can } from '@/application/policies/authorizationPolicy.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { CreateLeadDTO } from '../../../application/dtos/CreateLeadDTO.js';
import { ILeadRepository } from '../../../application/ports/repositories/ILeadRepository.js';
import { ILeadStatusConfigRepository } from '@/application/ports/repositories/ILeadStatusConfigRepository.js';
import { ILeadMapper } from '../../../application/ports/mappers/ILeadMapper.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Lead } from '../../../domain/entities/Lead.js';
import { Role } from '@/domain/enums/Role.js';
import { IUserRepository } from '@/application/ports/repositories/IUserRepository.js';

/**
 * Crea un lead. Sin estado, toma el predeterminado de la empresa. Un comercial queda siempre como responsable; gestión puede asignarlo a un usuario activo de la empresa (H9).
 *
 * @throws {ValidationError} `INVALID_LEAD_STATUS` o `ASSIGNED_USER_NOT_FOUND`.
 * @throws {ConflictError} `DEFAULT_LEAD_STATUS_MISSING`.
 */
export class CreateLeadUseCase {
  constructor(
    private readonly leadRepository: ILeadRepository,
    private readonly leadMapper: ILeadMapper,
    private readonly tenantContext: ITenantContext,
    private readonly leadStatusRepository: ILeadStatusConfigRepository,
    private readonly userRepository: IUserRepository,
    private readonly auditLogger: IAuditLogger,
    private readonly transactionManager: ITransactionManager,
  ) {}

  async execute(createLead: CreateLeadDTO, userId: string, role: Role) {
    const tenantId = this.tenantContext.getTenantId();

    if (!tenantId) {
      throw new Error('Tenant not found');
    }

    let statusId = createLead.statusId;

    if (!statusId) {
      const defaultStatus = await this.leadStatusRepository.findDefaultByTenant(tenantId);
      if (!defaultStatus) {
        throw new ConflictError(
          ErrorCode.DEFAULT_LEAD_STATUS_MISSING,
          'Default lead status not configured for this tenant',
        );
      }
      statusId = defaultStatus.id;
    } else {
      const existingStatus = await this.leadStatusRepository.findById(statusId);
      if (!existingStatus) {
        throw new ValidationError(ErrorCode.INVALID_LEAD_STATUS, 'Invalid statusId: does not belong to this tenant');
      }
    }

    const actor = { role, userId };
    if (!can(actor, Action.LEAD_CREATE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }
    const mayAssignToOthers = can(actor, Action.LEAD_ASSIGN_TO_OTHERS);

    if (createLead.assignedToId && mayAssignToOthers) {
      const findUser = await this.userRepository.findById(createLead.assignedToId);
      // Un usuario desactivado no puede recibir leads nuevos (H9).
      if (!findUser?.isActive) {
        throw new ValidationError(ErrorCode.ASSIGNED_USER_NOT_FOUND, 'User not found');
      }
    }

    const assignedToId = mayAssignToOthers ? createLead.assignedToId : userId;

    const leadEntity = Lead.create({
      tenantId: tenantId,
      companyName: createLead.companyName,
      contactName: createLead.contactName,
      email: createLead.email,
      phone: createLead.phone,
      statusId: statusId,
      source: createLead.source,
      assignedToId: assignedToId,
      estimatedValue: createLead.estimatedValue,
      expectedCloseDate: createLead.expectedCloseDate,
      notes: createLead.notes,
    });

    // F2-T08 (F1-S1): la modificación y su registro de auditoría se confirman o se revierten juntos.
    await this.transactionManager.runInTransaction(async () => {
      await this.leadRepository.create(leadEntity);
      await this.auditLogger.record({
        action: AuditAction.LEAD_CREATED,
        entity: AuditEntity.LEAD,
        entityId: leadEntity.id,
      });
    });
    return this.leadMapper.toDTO(leadEntity);
  }
}
