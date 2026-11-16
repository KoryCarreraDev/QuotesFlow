import { AuditAction, AuditEntity, IAuditLogger } from '../../ports/services/IAuditLogger.js';
import { ChangeLeadStatusDTO } from '../../dtos/ChangeLeadStatusDTO.js';
import { LeadDTO } from '../../dtos/LeadDTO.js';
import { ILeadMapper } from '../../ports/mappers/ILeadMapper.js';
import { ILeadRepository } from '../../ports/repositories/ILeadRepository.js';
import { ILeadStatusConfigRepository } from '../../ports/repositories/ILeadStatusConfigRepository.js';
import { ILeadStatusHistoryRepository } from '../../ports/repositories/ILeadStatusHistoryRepository.js';
import { ITenantContext } from '../../ports/services/ITenantContext.js';
import { ITransactionManager } from '../../ports/services/ITransactionManager.js';
import { Action, type Actor, can } from '../../policies/authorizationPolicy.js';
import { Lead } from '../../../domain/entities/Lead.js';
import { LeadStatusChange } from '../../../domain/entities/LeadStatusChange.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';
import { NotFoundError } from '../../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../../domain/errors/ValidationError.js';

/**
 * Cambia el estado de un lead y lo deja registrado en su historial (F1-T13).
 *
 * El lead y el historial se escriben en una transacción: nunca hay un cambio de estado sin su
 * registro, ni un registro de un cambio que no ocurrió. Pedir el estado que ya tiene no escribe nada.
 */
export class ChangeLeadStatusUseCase {
  constructor(
    private readonly leadRepository: ILeadRepository,
    private readonly leadStatusRepository: ILeadStatusConfigRepository,
    private readonly leadStatusHistoryRepository: ILeadStatusHistoryRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly leadMapper: ILeadMapper,
    private readonly tenantContext: ITenantContext,
    private readonly auditLogger: IAuditLogger,
  ) {}

  /**
   * @throws {NotFoundError} `LEAD_NOT_FOUND` si el lead no existe, está borrado o es de otra empresa.
   * @throws {ForbiddenError} Si el rol no permite modificar ese lead (un comercial, solo los suyos).
   * @throws {ValidationError} `INVALID_LEAD_STATUS` si el estado no existe en la empresa.
   */
  async execute(leadId: string, statusChange: ChangeLeadStatusDTO, actor: Actor): Promise<LeadDTO> {
    return this.transactionManager.runInTransaction(async () => {
      const lead = await this.leadRepository.findById(leadId);
      if (!lead) {
        throw new NotFoundError(ErrorCode.LEAD_NOT_FOUND, 'Lead not found');
      }

      // El historial necesita saber quién hizo el cambio: sin usuario identificado no hay cambio.
      const changedById = actor.userId;
      if (!changedById || !can(actor, Action.LEAD_UPDATE, { ownerUserId: lead.assignedToId })) {
        throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'You can only update your own leads');
      }

      const newStatus = await this.leadStatusRepository.findById(statusChange.statusId);
      if (!newStatus) {
        throw new ValidationError(ErrorCode.INVALID_LEAD_STATUS, 'Invalid statusId: does not belong to this tenant');
      }

      if (lead.statusId === newStatus.id) {
        return this.leadMapper.toDTO(lead);
      }

      const updatedLead = this.withStatus(lead, newStatus.id);
      await this.leadRepository.updateStatus(lead.id, newStatus.id);
      await this.leadStatusHistoryRepository.create(
        LeadStatusChange.create({
          tenantId: this.tenantContext.getTenantId(),
          leadId: lead.id,
          oldStatusId: lead.statusId,
          newStatusId: newStatus.id,
          changedById,
          note: statusChange.note,
        }),
      );

      await this.auditLogger.record({
        action: AuditAction.LEAD_STATUS_CHANGED,
        entity: AuditEntity.LEAD,
        entityId: lead.id,
        metadata: { oldStatusId: lead.statusId ?? null, newStatusId: newStatus.id },
      });

      return this.leadMapper.toDTO(updatedLead);
    });
  }

  private withStatus(lead: Lead, statusId: string): Lead {
    return new Lead(
      lead.id,
      lead.tenantId,
      lead.companyName,
      lead.contactName,
      lead.email,
      lead.phone,
      statusId,
      lead.source,
      lead.assignedToId,
      lead.estimatedValue,
      lead.expectedCloseDate,
      lead.notes,
      lead.createdAt,
      new Date(),
      lead.deleted,
    );
  }
}
