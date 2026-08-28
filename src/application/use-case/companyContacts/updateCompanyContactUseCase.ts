import { UpdateCompanyContactDTO } from "@/application/dtos/UpdateCompanyContactDTO.js";
import { ICompanyContactRepository } from "@/application/ports/repositories/ICompanyContactRepository.js";
import { ICompanyContactMapper } from "@/application/ports/mappers/ICompanyContactMapper.js";
import { ITenantContext } from "@/application/ports/services/ITenantContext.js";
import { CompanyContact } from "@/domain/entities/CompanyContact.js";

export class UpdateCompanyContactUseCase {
    constructor(
        private readonly companyContactRepo: ICompanyContactRepository,
        private readonly companyContactMap: ICompanyContactMapper,
        private readonly tenantContext: ITenantContext,
    ) {}

    async execute(companyContactId: string, updateCompanyContact: UpdateCompanyContactDTO) {

        if (!companyContactId || !updateCompanyContact) {
            throw new Error("All information is required");
        }

        const tenantId = this.tenantContext.getTenantId();
        if (!tenantId) {
            throw new Error("Tenant ID is required");
        }

        const existingCompanyContact = await this.companyContactRepo.findById(companyContactId);
        if (!existingCompanyContact) {
            throw new Error("Company contact not found");
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
            new Date()
        );

        await this.companyContactRepo.update(existingCompanyContact.id, updatedCompanyContact);

        return this.companyContactMap.toDTO(updatedCompanyContact);
    }
}
