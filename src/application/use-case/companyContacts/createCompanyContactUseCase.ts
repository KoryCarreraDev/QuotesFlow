import { CompanyContactDTO } from '../../dtos/CompanyContactDTO.js';
import { CreateCompanyContactDTO } from '../../dtos/CreateCompanyContactDTO.js';
import { ICompanyContactMapper } from '../../ports/mappers/ICompanyContactMapper.js';
import { ICompanyContactRepository } from '../../ports/repositories/ICompanyContactRepository.js';
import { IUserRepository } from '../../ports/repositories/IUserRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '../../ports/services/IAuditLogger.js';
import { ITenantContext } from '../../ports/services/ITenantContext.js';
import { Action, type Actor, can } from '../../policies/authorizationPolicy.js';
import { resolveOwnerForNewClient } from '../clients/clientRules.js';
import { CompanyContact } from '../../../domain/entities/CompanyContact.js';
import { ConflictError } from '../../../domain/errors/ConflictError.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';

export class CreateCompanyContactUseCase {
  constructor(
    private readonly companyContactRepo: ICompanyContactRepository,
    private readonly companyContactMap: ICompanyContactMapper,
    private readonly tenantContext: ITenantContext,
    private readonly auditLogger: IAuditLogger,
    private readonly userRepo: IUserRepository,
  ) {}

  /**
   * @throws {ValidationError} `OWNER_NOT_FOUND` o `INVALID_DOCUMENT_NUMBER` (NIT sin dígitos).
   * @throws {ConflictError} `DOCUMENT_ALREADY_REGISTERED` si otra empresa cliente activa tiene el NIT (D-19).
   */
  async execute(createCompanyContact: CreateCompanyContactDTO, actor: Actor): Promise<CompanyContactDTO> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant not found');
    }
    if (!can(actor, Action.COMPANY_CONTACT_CREATE)) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    const ownerId = await resolveOwnerForNewClient(
      actor,
      createCompanyContact.ownerId,
      Action.COMPANY_CONTACT_ASSIGN_OWNER,
      this.userRepo,
    );
    const companyContactEntity = CompanyContact.create({
      tenantId,
      name: createCompanyContact.name,
      industry: createCompanyContact.industry,
      taxNumber: createCompanyContact.taxNumber,
      phone: createCompanyContact.phone,
      email: createCompanyContact.email,
      address: createCompanyContact.address,
      city: createCompanyContact.city,
      state: createCompanyContact.state,
      zip: createCompanyContact.zip,
      country: createCompanyContact.country,
      ownerId,
    });
    if (companyContactEntity.documentNumber) {
      const holder = await this.companyContactRepo.findActiveByDocumentNumber(companyContactEntity.documentNumber);
      if (holder) {
        throw new ConflictError(
          ErrorCode.DOCUMENT_ALREADY_REGISTERED,
          'Another client of the company has this document',
        );
      }
    }

    await this.companyContactRepo.create(companyContactEntity);
    await this.auditLogger.record({
      action: AuditAction.COMPANY_CONTACT_CREATED,
      entity: AuditEntity.COMPANY_CONTACT,
      entityId: companyContactEntity.id,
    });
    return this.companyContactMap.toDTO(companyContactEntity);
  }
}
