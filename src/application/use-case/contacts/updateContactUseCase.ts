import { UpdateContactDTO } from "@/application/dtos/UpdateContactDTO.js";
import { IContactRepository } from "@/application/ports/repositories/IContactRepository.js";
import { IContactMapper } from "@/application/ports/mappers/IContactMapper.js";
import { ITenantContext } from "@/application/ports/services/ITenantContext.js";
import { Contact } from "@/domain/entities/Contact.js";

export class UpdateContactUseCase {
    constructor(
        private readonly contactRepo: IContactRepository,
        private readonly contactMap: IContactMapper,
        private readonly tenantContext: ITenantContext,
    ) {}

    async execute(contactId: string, updateContact: UpdateContactDTO) {

        if (!contactId || !updateContact) {
            throw new Error("All information is required");
        }

        const tenantId = this.tenantContext.getTenantId();
        if (!tenantId) {
            throw new Error("Tenant ID is required");
        }

        const existingContact = await this.contactRepo.findById(contactId);
        if (!existingContact) {
            throw new Error("Contact not found");
        }

        const updatedContact = new Contact(
            existingContact.id,
            existingContact.tenantId,
            updateContact.firstName !== undefined ? updateContact.firstName : existingContact.firstName,
            updateContact.lastName !== undefined ? updateContact.lastName : existingContact.lastName,
            updateContact.email !== undefined ? updateContact.email : existingContact.email,
            updateContact.phone !== undefined ? updateContact.phone : existingContact.phone,
            updateContact.companyId !== undefined ? updateContact.companyId : existingContact.companyId,
            existingContact.createdAt,
            new Date()
        );

        await this.contactRepo.update(existingContact.id, updatedContact);

        return this.contactMap.toDTO(updatedContact);
    }
}
