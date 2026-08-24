import { CreateContactDTO } from "../../../application/dtos/CreateContactDTO.js";
import { IContactRepository } from "../../../application/ports/repositories/IContactRepository.js";
import { IContactMapper } from "../../../application/ports/mappers/IContactMapper.js";
import { ITenantContext } from "@/application/ports/services/ITenantContext.js";
import { Contact } from "../../../domain/entities/Contact.js";

export class CreateContactUseCase {
    constructor (
        private readonly contactRepo: IContactRepository,
        private readonly contactMap: IContactMapper,
        private readonly tenantContext: ITenantContext,
    ) {}

    async execute(createContact: CreateContactDTO) {

        const tenantId = this.tenantContext.getTenantId();

        if (!tenantId) {
            throw new Error('Tenant not found');
        }

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
}
