import { ILeadStatusConfigRepository } from '../../ports/repositories/ILeadStatusConfigRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '../../ports/services/IAuditLogger.js';
import { ITransactionManager } from '../../ports/services/ITransactionManager.js';
import { Action, type Actor, can } from '../../policies/authorizationPolicy.js';
import { ConflictError } from '../../../domain/errors/ConflictError.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';
import { NotFoundError } from '../../../domain/errors/NotFoundError.js';

/**
 * Borrado suave de un estado de lead (F1-T14). No se borra el predeterminado (los leads nuevos lo
 * necesitan) ni un estado con leads (se quedarían con un estado que ya no se ve).
 */
export class DeleteLeadStatusConfigUseCase {
  constructor(
    private readonly leadStatusRepository: ILeadStatusConfigRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  /**
   * @throws {ForbiddenError} Si el rol no puede borrar estados.
   * @throws {NotFoundError} `LEAD_STATUS_NOT_FOUND` si no existe, ya está borrado o es de otra empresa.
   * @throws {ConflictError} `DEFAULT_LEAD_STATUS_CANNOT_BE_DELETED` o `LEAD_STATUS_IN_USE`.
   */
  async execute(statusId: string, actor: Actor): Promise<void> {
    if (!can(actor, Action.LEAD_STATUS_DELETE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    await this.transactionManager.runInTransaction(async () => {
      const status = await this.leadStatusRepository.findById(statusId);
      if (!status) {
        throw new NotFoundError(ErrorCode.LEAD_STATUS_NOT_FOUND, 'Status Lead not found');
      }
      if (status.isDefault) {
        throw new ConflictError(
          ErrorCode.DEFAULT_LEAD_STATUS_CANNOT_BE_DELETED,
          'The default lead status cannot be deleted; choose another default first',
        );
      }
      if ((await this.leadStatusRepository.countLeadByStatus(statusId)) > 0) {
        throw new ConflictError(ErrorCode.LEAD_STATUS_IN_USE, 'Lead status still has leads; move them first');
      }

      await this.leadStatusRepository.delete(statusId);
      await this.auditLogger.record({
        action: AuditAction.LEAD_STATUS_CONFIG_DELETED,
        entity: AuditEntity.LEAD_STATUS_CONFIG,
        entityId: statusId,
      });
    });
  }
}
