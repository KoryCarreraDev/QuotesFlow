import { CreateContactDTO } from '../../dtos/CreateContactDTO.js';
import { ContactDTO } from '../../dtos/ContactDTO.js';
import { IContactMapper } from '../../ports/mappers/IContactMapper.js';
import { ICompanyContactRepository } from '../../ports/repositories/ICompanyContactRepository.js';
import { IContactRepository } from '../../ports/repositories/IContactRepository.js';
import { IUserRepository } from '../../ports/repositories/IUserRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '../../ports/services/IAuditLogger.js';
import { ITenantContext } from '../../ports/services/ITenantContext.js';
import { Action, type Actor, can } from '../../policies/authorizationPolicy.js';
import { canSeeClient, normalizeClientDocument, resolveOwnerForNewClient } from '../clients/clientRules.js';
import { Contact } from '../../../domain/entities/Contact.js';
import { ConflictError } from '../../../domain/errors/ConflictError.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';
import { ValidationError } from '../../../domain/errors/ValidationError.js';

export class CreateContactUseCase {
  constructor(
    private readonly contactRepo: IContactRepository,
    private readonly contactMap: IContactMapper,
    private readonly tenantContext: ITenantContext,
    private readonly companyContactRepo: ICompanyContactRepository,
    private readonly auditLogger: IAuditLogger,
    private readonly userRepo: IUserRepository,
  ) {}

  /**
   * @throws {ValidationError} `INVALID_COMPANY_CONTACT`, `OWNER_NOT_FOUND`, `DOCUMENT_TYPE_REQUIRED` o `INVALID_DOCUMENT_NUMBER`.
   * @throws {ConflictError} `DOCUMENT_ALREADY_REGISTERED` si otro contacto activo de la empresa tiene el documento (D-19).
   */
  async execute(createContact: CreateContactDTO, actor: Actor): Promise<ContactDTO> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant not found');
    }
    if (!can(actor, Action.CONTACT_CREATE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    if (createContact.companyId) await this.ensureVisibleCompanyContact(createContact.companyId, actor);
    const ownerId = await resolveOwnerForNewClient(
      actor,
      createContact.ownerId,
      Action.CONTACT_ASSIGN_OWNER,
      this.userRepo,
    );
    const documentNumber = normalizeClientDocument(createContact.documentType, createContact.documentNumber);
    if (documentNumber) await this.ensureDocumentIsFree(documentNumber);

    const contactEntity = Contact.create({
      tenantId,
      firstName: createContact.firstName,
      lastName: createContact.lastName,
      email: createContact.email,
      phone: createContact.phone,
      companyId: createContact.companyId,
      ownerId,
      documentType: documentNumber ? createContact.documentType : undefined,
      documentNumber,
    });

    await this.contactRepo.create(contactEntity);
    await this.auditLogger.record({
      action: AuditAction.CONTACT_CREATED,
      entity: AuditEntity.CONTACT,
      entityId: contactEntity.id,
    });
    return this.contactMap.toDTO(contactEntity);
  }

  /** La empresa cliente tiene que ser del tenant, no estar borrada (H9) y ser visible para el actor (D-18). */
  private async ensureVisibleCompanyContact(companyContactId: string, actor: Actor): Promise<void> {
    const companyContact = await this.companyContactRepo.findById(companyContactId);
    if (!companyContact || !canSeeClient(actor, Action.COMPANY_CONTACT_LIST, companyContact.ownerId)) {
      throw new ValidationError(ErrorCode.INVALID_COMPANY_CONTACT, 'Invalid companyId: does not belong to this tenant');
    }
  }

  private async ensureDocumentIsFree(documentNumber: string): Promise<void> {
    if (await this.contactRepo.findActiveByDocumentNumber(documentNumber)) {
      throw new ConflictError(ErrorCode.DOCUMENT_ALREADY_REGISTERED, 'Another client of the company has this document');
    }
  }
}
