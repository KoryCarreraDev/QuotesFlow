import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { Action, can } from '@/application/policies/authorizationPolicy.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { ILeadRepository } from '@/application/ports/repositories/ILeadRepository.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Role } from '@/domain/enums/Role.js';

export class DeleteLeadUseCase {
  constructor(
    private readonly leadRepo: ILeadRepository,
    private readonly tenantContext: ITenantContext,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(leadId: string, userId: string, role: Role): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();

    if (!tenantId) {
      throw new Error('Tenant not found');
    }

    const existingRepo = await this.leadRepo.findById(leadId);

    if (!existingRepo) {
      throw new NotFoundError(ErrorCode.LEAD_NOT_FOUND, 'Lead not found');
    }

    if (!can({ role, userId }, Action.LEAD_DELETE, { ownerUserId: existingRepo.assignedToId })) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'You do not have the necessary permissions.');
    }

    await this.leadRepo.delete(leadId);
    await this.auditLogger.record({ action: AuditAction.LEAD_DELETED, entity: AuditEntity.LEAD, entityId: leadId });
  }
}
