import { AuditAction, AuditEntity, IAuditLogger } from '../../ports/services/IAuditLogger.js';
import { IContactRepository } from '../../ports/repositories/IContactRepository.js';
import { Action, type Actor, can } from '../../policies/authorizationPolicy.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';
import { NotFoundError } from '../../../domain/errors/NotFoundError.js';

/** Borrado suave de un contacto (F1-T16): deja de verse y de poder modificarse; la fila se conserva. */
export class DeleteContactUseCase {
  constructor(
    private readonly contactRepository: IContactRepository,
    private readonly auditLogger: IAuditLogger,
  ) {}

  /**
   * @throws {ForbiddenError} Si el rol no puede borrar contactos.
   * @throws {NotFoundError} `CONTACT_NOT_FOUND` si no existe, ya está borrado o es de otra empresa.
   */
  async execute(contactId: string, actor: Actor): Promise<void> {
    if (!can(actor, Action.CONTACT_DELETE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    const contact = await this.contactRepository.findById(contactId);
    if (!contact) {
      throw new NotFoundError(ErrorCode.CONTACT_NOT_FOUND, 'Contact not found');
    }

    await this.contactRepository.delete(contactId);
    await this.auditLogger.record({
      action: AuditAction.CONTACT_DELETED,
      entity: AuditEntity.CONTACT,
      entityId: contactId,
    });
  }
}
