import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import {
  AuditAction,
  AuditEntity,
  IAuditLogger,
  changedFieldNames,
} from '@/application/ports/services/IAuditLogger.js';
import { Action, can } from '@/application/policies/authorizationPolicy.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { UpdateLeadDTO } from '@/application/dtos/UpdateLeadDTO.js';
import { ILeadRepository } from '@/application/ports/repositories/ILeadRepository.js';
import { ILeadMapper } from '@/application/ports/mappers/ILeadMapper.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Role } from '@/domain/enums/Role.js';
import { Lead } from '@/domain/entities/Lead.js';
import { IUserRepository } from '@/application/ports/repositories/IUserRepository.js';
import { Money } from '@/domain/value-objects/money.js';

/**
 * Modifica los datos de un lead (no su estado: eso es `ChangeLeadStatusUseCase`). Un comercial solo los suyos y sin reasignar; gestión reasigna a usuarios activos de la empresa (H9).
 *
 * @throws {NotFoundError} `LEAD_NOT_FOUND`.
 * @throws {ForbiddenError} Si un comercial intenta modificar un lead ajeno.
 * @throws {ValidationError} `ASSIGNED_USER_NOT_FOUND`.
 */
export class UpdateLeadUseCase {
  constructor(
    private readonly leadRepository: ILeadRepository,
    private readonly leadMapper: ILeadMapper,
    private readonly tenantContext: ITenantContext,
    private readonly userRepository: IUserRepository,
    private readonly auditLogger: IAuditLogger,
    private readonly transactionManager: ITransactionManager,
  ) {}

  async execute(leadId: string, updateLead: UpdateLeadDTO, role: string, userId: string) {
    if (!leadId || !updateLead || !role || !userId) {
      throw new ValidationError(ErrorCode.MISSING_REQUIRED_DATA, 'All information is required');
    }

    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const storedLead = await this.leadRepository.findById(leadId);
    if (!storedLead) {
      throw new NotFoundError(ErrorCode.LEAD_NOT_FOUND, 'Lead not found');
    }

    if (storedLead.deleted === DeletedState.INACTIVE) {
      throw new NotFoundError(ErrorCode.LEAD_NOT_FOUND, 'This lead is deleted');
    }

    const actor = { role: role as Role, userId };
    const lead = { ownerUserId: storedLead.assignedToId };
    if (!can(actor, Action.LEAD_UPDATE, lead)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'You can only update your own leads');
    }
    const mayReassign = can(actor, Action.LEAD_REASSIGN, lead);
    const reassignsLead =
      mayReassign && updateLead.assignedToId !== undefined && updateLead.assignedToId !== storedLead.assignedToId;
    if (reassignsLead) await this.ensureAssignableUser(updateLead.assignedToId!);

    const updatedLead = new Lead(
      storedLead.id,
      storedLead.tenantId,
      updateLead.companyName !== undefined ? updateLead.companyName : storedLead.companyName,
      updateLead.contactName !== undefined ? updateLead.contactName : storedLead.contactName,
      updateLead.email !== undefined ? updateLead.email : storedLead.email,
      updateLead.phone !== undefined ? updateLead.phone : storedLead.phone,
      storedLead.statusId,
      updateLead.source !== undefined ? updateLead.source : storedLead.source,
      mayReassign && updateLead.assignedToId !== undefined ? updateLead.assignedToId : storedLead.assignedToId,
      updateLead.estimatedValue !== undefined
        ? Money.fromDecimalString(updateLead.estimatedValue)
        : storedLead.estimatedValue,
      updateLead.expectedCloseDate !== undefined ? updateLead.expectedCloseDate : storedLead.expectedCloseDate,
      updateLead.notes !== undefined ? updateLead.notes : storedLead.notes,
      storedLead.createdAt,
      new Date(),
    );

    // F2-T08 (F1-S1): la modificación y su registro de auditoría se confirman o se revierten juntos.
    await this.transactionManager.runInTransaction(async () => {
      await this.leadRepository.update(storedLead.id, updatedLead);
      await this.auditLogger.record({
        action: AuditAction.LEAD_UPDATED,
        entity: AuditEntity.LEAD,
        entityId: storedLead.id,
        metadata: { changedFields: changedFieldNames(updateLead) },
      });
    });

    return this.leadMapper.toDTO(updatedLead);
  }

  /** El nuevo responsable tiene que ser un usuario activo de la misma empresa (H9). */
  private async ensureAssignableUser(userId: string): Promise<void> {
    const assignee = await this.userRepository.findById(userId);
    if (!assignee?.isActive) {
      throw new ValidationError(ErrorCode.ASSIGNED_USER_NOT_FOUND, 'User not found');
    }
  }
}
