import { ICompanyContactRepository } from '@/application/ports/repositories/ICompanyContactRepository.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { CreateContactDTO } from '../../../application/dtos/CreateContactDTO.js';
import { IContactRepository } from '../../../application/ports/repositories/IContactRepository.js';
import { IContactMapper } from '../../../application/ports/mappers/IContactMapper.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Contact } from '../../../domain/entities/Contact.js';

export class CreateContactUseCase {
  constructor(
    private readonly contactRepo: IContactRepository,
    private readonly contactMap: IContactMapper,
    private readonly tenantContext: ITenantContext,
    private readonly companyContactRepo: ICompanyContactRepository,
  ) {}

  async execute(createContact: CreateContactDTO) {
    const tenantId = this.tenantContext.getTenantId();

    if (!tenantId) {
      throw new Error('Tenant not found');
    }

    if (createContact.companyId) await this.ensureCompanyContactBelongsToTenant(createContact.companyId);

    const contactEntity = Contact.create({
      tenantId: tenantId,
      firstName: createContact.firstName,
      lastName: createContact.lastName,
      email: createContact.email,
      phone: createContact.phone,
      companyId: createContact.companyId,
    });

    await this.contactRepo.create(contactEntity);
    return this.contactMap.toDTO(contactEntity);
  }
  /** La empresa cliente del contacto tiene que existir, no estar borrada y ser de la misma empresa (H9). */
  private async ensureCompanyContactBelongsToTenant(companyContactId: string): Promise<void> {
    const companyContact = await this.companyContactRepo.findById(companyContactId);
    if (!companyContact) {
      throw new ValidationError(ErrorCode.INVALID_COMPANY_CONTACT, 'Invalid companyId: does not belong to this tenant');
    }
  }
}
