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

export class UpdateLeadUseCase {
  constructor(
    private readonly leadRepo: ILeadRepository,
    private readonly leadmap: ILeadMapper,
    private readonly tenantContext: ITenantContext,
    private readonly userRepo: IUserRepository,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(leadId: string, updateLead: UpdateLeadDTO, role: string, userId: string) {
    if (!leadId || !updateLead || !role || !userId) {
      throw new ValidationError(ErrorCode.MISSING_REQUIRED_DATA, 'All information is required');
    }

    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const leadProperty = await this.leadRepo.findById(leadId);
    if (!leadProperty) {
      throw new NotFoundError(ErrorCode.LEAD_NOT_FOUND, 'Lead not found');
    }

    if (leadProperty.deleted === DeletedState.Inactive) {
      throw new NotFoundError(ErrorCode.LEAD_NOT_FOUND, 'This lead is deleted');
    }

    const actor = { role: role as Role, userId };
    const lead = { ownerUserId: leadProperty.assignedToId };
    if (!can(actor, Action.LEAD_UPDATE, lead)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'You can only update your own leads');
    }
    const mayReassign = can(actor, Action.LEAD_REASSIGN, lead);
    const reassignsLead =
      mayReassign && updateLead.assignedToId !== undefined && updateLead.assignedToId !== leadProperty.assignedToId;
    if (reassignsLead) await this.ensureAssignableUser(updateLead.assignedToId!);

    const updatedLead = new Lead(
      leadProperty.id,
      leadProperty.tenantId,
      updateLead.companyName !== undefined ? updateLead.companyName : leadProperty.companyName,
      updateLead.contactName !== undefined ? updateLead.contactName : leadProperty.contactName,
      updateLead.email !== undefined ? updateLead.email : leadProperty.email,
      updateLead.phone !== undefined ? updateLead.phone : leadProperty.phone,
      leadProperty.statusId,
      updateLead.source !== undefined ? updateLead.source : leadProperty.source,
      mayReassign && updateLead.assignedToId !== undefined ? updateLead.assignedToId : leadProperty.assignedToId,
      updateLead.estimatedValue !== undefined ? updateLead.estimatedValue : leadProperty.estimatedValue,
      updateLead.expectedCloseDate !== undefined ? updateLead.expectedCloseDate : leadProperty.expectedCloseDate,
      updateLead.notes !== undefined ? updateLead.notes : leadProperty.notes,
      leadProperty.createdAt,
      new Date(),
    );

    await this.leadRepo.update(leadProperty.id, updatedLead);
    await this.auditLogger.record({
      action: AuditAction.LEAD_UPDATED,
      entity: AuditEntity.LEAD,
      entityId: leadProperty.id,
      metadata: { changedFields: changedFieldNames(updateLead) },
    });

    return this.leadmap.toDTO(updatedLead);
  }

  /** El nuevo responsable tiene que ser un usuario activo de la misma empresa (H9). */
  private async ensureAssignableUser(userId: string): Promise<void> {
    const assignee = await this.userRepo.findById(userId);
    if (!assignee?.isActive) {
      throw new ValidationError(ErrorCode.ASSIGNED_USER_NOT_FOUND, 'User not found');
    }
  }
}
