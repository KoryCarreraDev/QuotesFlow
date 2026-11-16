import { ContactDTO } from '../../dtos/ContactDTO.js';
import { UpdateContactDTO } from '../../dtos/UpdateContactDTO.js';
import { IContactMapper } from '../../ports/mappers/IContactMapper.js';
import { ICompanyContactRepository } from '../../ports/repositories/ICompanyContactRepository.js';
import { IContactRepository } from '../../ports/repositories/IContactRepository.js';
import { IUserRepository } from '../../ports/repositories/IUserRepository.js';
import { AuditAction, AuditEntity, IAuditLogger, changedFieldNames } from '../../ports/services/IAuditLogger.js';
import { ITenantContext } from '../../ports/services/ITenantContext.js';
import { Action, type Actor, can } from '../../policies/authorizationPolicy.js';
import { canSeeClient, normalizeClientDocument, resolveOwnerForUpdatedClient } from '../clients/clientRules.js';
import { Contact } from '../../../domain/entities/Contact.js';
import { ConflictError } from '../../../domain/errors/ConflictError.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';
import { NotFoundError } from '../../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../../domain/errors/ValidationError.js';

/**
 * Modifica un contacto: un comercial solo los suyos; solo gestión cambia el responsable.
 */
export class UpdateContactUseCase {
  constructor(
    private readonly contactRepository: IContactRepository,
    private readonly contactMapper: IContactMapper,
    private readonly tenantContext: ITenantContext,
    private readonly companyContactRepository: ICompanyContactRepository,
    private readonly auditLogger: IAuditLogger,
    private readonly userRepository: IUserRepository,
  ) {}

  /**
   * @throws {NotFoundError} `CONTACT_NOT_FOUND` si no existe, está borrado o es de otra empresa.
   * @throws {ForbiddenError} Si un comercial intenta modificar un contacto que no es suyo (D-18).
   * @throws {ValidationError} `INVALID_COMPANY_CONTACT`, `OWNER_NOT_FOUND` o de documento.
   * @throws {ConflictError} `DOCUMENT_ALREADY_REGISTERED`.
   */
  async execute(contactId: string, updateContact: UpdateContactDTO, actor: Actor): Promise<ContactDTO> {
    if (!contactId || !updateContact) {
      throw new ValidationError(ErrorCode.MISSING_REQUIRED_DATA, 'All information is required');
    }
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const existingContact = await this.contactRepository.findById(contactId);
    if (!existingContact) {
      throw new NotFoundError(ErrorCode.CONTACT_NOT_FOUND, 'Contact not found');
    }
    if (!can(actor, Action.CONTACT_UPDATE, { ownerUserId: existingContact.ownerId })) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'You can only update your own contacts');
    }

    const changesCompany =
      updateContact.companyId !== undefined && updateContact.companyId !== existingContact.companyId;
    if (changesCompany) await this.ensureVisibleCompanyContact(updateContact.companyId!, actor);
    const ownerId = await resolveOwnerForUpdatedClient(
      actor,
      updateContact.ownerId,
      existingContact.ownerId,
      Action.CONTACT_ASSIGN_OWNER,
      this.userRepository,
    );

    const changesDocument = updateContact.documentNumber !== undefined || updateContact.documentType !== undefined;
    const documentType = updateContact.documentType ?? existingContact.documentType;
    const documentNumber = changesDocument
      ? normalizeClientDocument(documentType, updateContact.documentNumber ?? existingContact.documentNumber)
      : existingContact.documentNumber;
    if (changesDocument && documentNumber) await this.ensureDocumentIsFree(documentNumber, existingContact.id);

    const updatedContact = new Contact(
      existingContact.id,
      existingContact.tenantId,
      updateContact.firstName ?? existingContact.firstName,
      updateContact.lastName ?? existingContact.lastName,
      updateContact.email ?? existingContact.email,
      updateContact.phone ?? existingContact.phone,
      updateContact.companyId ?? existingContact.companyId,
      existingContact.createdAt,
      new Date(),
      ownerId,
      documentNumber ? documentType : undefined,
      documentNumber,
    );

    await this.contactRepository.update(existingContact.id, updatedContact);
    await this.auditLogger.record({
      action: AuditAction.CONTACT_UPDATED,
      entity: AuditEntity.CONTACT,
      entityId: existingContact.id,
      metadata: { changedFields: changedFieldNames(updateContact) },
    });

    return this.contactMapper.toDTO(updatedContact);
  }

  /** La empresa cliente tiene que ser del tenant, no estar borrada (H9) y ser visible para el actor (D-18). */
  private async ensureVisibleCompanyContact(companyContactId: string, actor: Actor): Promise<void> {
    const companyContact = await this.companyContactRepository.findById(companyContactId);
    if (!companyContact || !canSeeClient(actor, Action.COMPANY_CONTACT_LIST, companyContact.ownerId)) {
      throw new ValidationError(ErrorCode.INVALID_COMPANY_CONTACT, 'Invalid companyId: does not belong to this tenant');
    }
  }

  private async ensureDocumentIsFree(documentNumber: string, contactId: string): Promise<void> {
    const holder = await this.contactRepository.findActiveByDocumentNumber(documentNumber);
    if (holder && holder.id !== contactId) {
      throw new ConflictError(ErrorCode.DOCUMENT_ALREADY_REGISTERED, 'Another client of the company has this document');
    }
  }
}
