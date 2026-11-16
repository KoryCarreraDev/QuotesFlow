import { ICompanyContactRepository } from '@/application/ports/repositories/ICompanyContactRepository.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { UpdateContactDTO } from '@/application/dtos/UpdateContactDTO.js';
import { IContactRepository } from '@/application/ports/repositories/IContactRepository.js';
import { IContactMapper } from '@/application/ports/mappers/IContactMapper.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Contact } from '@/domain/entities/Contact.js';

export class UpdateContactUseCase {
  constructor(
    private readonly contactRepo: IContactRepository,
    private readonly contactMap: IContactMapper,
    private readonly tenantContext: ITenantContext,
    private readonly companyContactRepo: ICompanyContactRepository,
  ) {}

  async execute(contactId: string, updateContact: UpdateContactDTO) {
    if (!contactId || !updateContact) {
      throw new ValidationError(ErrorCode.MISSING_REQUIRED_DATA, 'All information is required');
    }

    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const existingContact = await this.contactRepo.findById(contactId);
    if (!existingContact) {
      throw new NotFoundError(ErrorCode.CONTACT_NOT_FOUND, 'Contact not found');
    }

    const changesCompany =
      updateContact.companyId !== undefined && updateContact.companyId !== existingContact.companyId;
    if (changesCompany) await this.ensureCompanyContactBelongsToTenant(updateContact.companyId!);

    const updatedContact = new Contact(
      existingContact.id,
      existingContact.tenantId,
      updateContact.firstName !== undefined ? updateContact.firstName : existingContact.firstName,
      updateContact.lastName !== undefined ? updateContact.lastName : existingContact.lastName,
      updateContact.email !== undefined ? updateContact.email : existingContact.email,
      updateContact.phone !== undefined ? updateContact.phone : existingContact.phone,
      updateContact.companyId !== undefined ? updateContact.companyId : existingContact.companyId,
      existingContact.createdAt,
      new Date(),
    );

    await this.contactRepo.update(existingContact.id, updatedContact);

    return this.contactMap.toDTO(updatedContact);
  }
  /** La empresa cliente del contacto tiene que existir, no estar borrada y ser de la misma empresa (H9). */
  private async ensureCompanyContactBelongsToTenant(companyContactId: string): Promise<void> {
    const companyContact = await this.companyContactRepo.findById(companyContactId);
    if (!companyContact) {
      throw new ValidationError(ErrorCode.INVALID_COMPANY_CONTACT, 'Invalid companyId: does not belong to this tenant');
    }
  }
}
