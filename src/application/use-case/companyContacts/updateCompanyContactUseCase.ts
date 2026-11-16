import { IUserRepository } from '@/application/ports/repositories/IUserRepository.js';
import { Action, type Actor, can } from '@/application/policies/authorizationPolicy.js';
import { resolveOwnerForUpdatedClient } from '../clients/clientRules.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import {
  AuditAction,
  AuditEntity,
  IAuditLogger,
  changedFieldNames,
} from '@/application/ports/services/IAuditLogger.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { UpdateCompanyContactDTO } from '@/application/dtos/UpdateCompanyContactDTO.js';
import { ICompanyContactRepository } from '@/application/ports/repositories/ICompanyContactRepository.js';
import { ICompanyContactMapper } from '@/application/ports/mappers/ICompanyContactMapper.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { CompanyContact } from '@/domain/entities/CompanyContact.js';

export class UpdateCompanyContactUseCase {
  constructor(
    private readonly companyContactRepo: ICompanyContactRepository,
    private readonly companyContactMap: ICompanyContactMapper,
    private readonly tenantContext: ITenantContext,
    private readonly auditLogger: IAuditLogger,
    private readonly userRepo: IUserRepository,
  ) {}

  /**
   * @throws {ForbiddenError} Si un comercial intenta modificar una empresa cliente que no es suya (D-18).
   * @throws {ConflictError} `DOCUMENT_ALREADY_REGISTERED` si otra empresa cliente activa tiene el NIT (D-19).
   */
  async execute(companyContactId: string, updateCompanyContact: UpdateCompanyContactDTO, actor: Actor) {
    if (!companyContactId || !updateCompanyContact) {
      throw new ValidationError(ErrorCode.MISSING_REQUIRED_DATA, 'All information is required');
    }

    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const existingCompanyContact = await this.companyContactRepo.findById(companyContactId);
    if (!existingCompanyContact) {
      throw new NotFoundError(ErrorCode.COMPANY_CONTACT_NOT_FOUND, 'Company contact not found');
    }
    if (!can(actor, Action.COMPANY_CONTACT_UPDATE, { ownerUserId: existingCompanyContact.ownerId })) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'You can only update your own company contacts');
    }

    const ownerId = await resolveOwnerForUpdatedClient(
      actor,
      updateCompanyContact.ownerId,
      existingCompanyContact.ownerId,
      Action.COMPANY_CONTACT_ASSIGN_OWNER,
      this.userRepo,
    );
    const changesTaxNumber =
      updateCompanyContact.taxNumber !== undefined &&
      updateCompanyContact.taxNumber !== existingCompanyContact.taxNumber;
    const documentNumber = changesTaxNumber
      ? CompanyContact.documentNumberFrom(updateCompanyContact.taxNumber)
      : existingCompanyContact.documentNumber;
    if (changesTaxNumber && documentNumber) {
      const holder = await this.companyContactRepo.findActiveByDocumentNumber(documentNumber);
      if (holder && holder.id !== existingCompanyContact.id) {
        throw new ConflictError(
          ErrorCode.DOCUMENT_ALREADY_REGISTERED,
          'Another client of the company has this document',
        );
      }
    }

    const updatedCompanyContact = new CompanyContact(
      existingCompanyContact.id,
      existingCompanyContact.tenantId,
      updateCompanyContact.name !== undefined ? updateCompanyContact.name : existingCompanyContact.name,
      updateCompanyContact.industry !== undefined ? updateCompanyContact.industry : existingCompanyContact.industry,
      updateCompanyContact.taxNumber !== undefined ? updateCompanyContact.taxNumber : existingCompanyContact.taxNumber,
      updateCompanyContact.phone !== undefined ? updateCompanyContact.phone : existingCompanyContact.phone,
      updateCompanyContact.email !== undefined ? updateCompanyContact.email : existingCompanyContact.email,
      updateCompanyContact.address !== undefined ? updateCompanyContact.address : existingCompanyContact.address,
      updateCompanyContact.city !== undefined ? updateCompanyContact.city : existingCompanyContact.city,
      updateCompanyContact.state !== undefined ? updateCompanyContact.state : existingCompanyContact.state,
      updateCompanyContact.zip !== undefined ? updateCompanyContact.zip : existingCompanyContact.zip,
      updateCompanyContact.country !== undefined ? updateCompanyContact.country : existingCompanyContact.country,
      existingCompanyContact.createdAt,
      new Date(),
      ownerId,
      documentNumber,
    );

    await this.companyContactRepo.update(existingCompanyContact.id, updatedCompanyContact);
    await this.auditLogger.record({
      action: AuditAction.COMPANY_CONTACT_UPDATED,
      entity: AuditEntity.COMPANY_CONTACT,
      entityId: existingCompanyContact.id,
      metadata: { changedFields: changedFieldNames(updateCompanyContact) },
    });

    return this.companyContactMap.toDTO(updatedCompanyContact);
  }
}
