import { AuditAction, AuditEntity, IAuditLogger } from '../../ports/services/IAuditLogger.js';
import { ICompanyContactRepository } from '../../ports/repositories/ICompanyContactRepository.js';
import { IContactRepository } from '../../ports/repositories/IContactRepository.js';
import { Action, type Actor, can } from '../../policies/authorizationPolicy.js';
import { ConflictError } from '../../../domain/errors/ConflictError.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';
import { NotFoundError } from '../../../domain/errors/NotFoundError.js';

/**
 * Borrado suave de una empresa cliente (F1-T16).
 *
 * No se borra mientras tenga contactos activos (Q-012): esos contactos quedarían apuntando a una
 * empresa que ya no se ve ni se puede elegir.
 */
export class DeleteCompanyContactUseCase {
  constructor(
    private readonly companyContactRepository: ICompanyContactRepository,
    private readonly contactRepository: IContactRepository,
    private readonly auditLogger: IAuditLogger,
  ) {}

  /**
   * @throws {ForbiddenError} Si el rol no puede borrar empresas cliente.
   * @throws {NotFoundError} `COMPANY_CONTACT_NOT_FOUND` si no existe, ya está borrada o es de otra empresa.
   * @throws {ConflictError} `COMPANY_CONTACT_HAS_CONTACTS` si aún tiene contactos activos.
   */
  async execute(companyContactId: string, actor: Actor): Promise<void> {
    if (!can(actor, Action.COMPANY_CONTACT_DELETE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    const companyContact = await this.companyContactRepository.findById(companyContactId);
    if (!companyContact) {
      throw new NotFoundError(ErrorCode.COMPANY_CONTACT_NOT_FOUND, 'Company contact not found');
    }

    if ((await this.contactRepository.countActiveByCompany(companyContactId)) > 0) {
      throw new ConflictError(
        ErrorCode.COMPANY_CONTACT_HAS_CONTACTS,
        'Company contact still has active contacts; delete or move them first',
      );
    }

    await this.companyContactRepository.delete(companyContactId);
    await this.auditLogger.record({
      action: AuditAction.COMPANY_CONTACT_DELETED,
      entity: AuditEntity.COMPANY_CONTACT,
      entityId: companyContactId,
    });
  }
}
