import { CreateCompanyContactDTO } from "../../../application/dtos/CreateCompanyContactDTO.js";
import { ICompanyContactRepository } from "../../../application/ports/repositories/ICompanyContactRepository.js";
import { ICompanyContactMapper } from "../../../application/ports/mappers/ICompanyContactMapper.js";
import { ITenantContext } from "@/application/ports/services/ITenantContext.js";
import { CompanyContact } from "../../../domain/entities/CompanyContact.js";

export class CreateCompanyContactUseCase {
    constructor (
        private readonly companyContactRepo: ICompanyContactRepository,
        private readonly companyContactMap: ICompanyContactMapper,
        private readonly tenantContext: ITenantContext,
    ) {}

    async execute(createCompanyContact: CreateCompanyContactDTO) {

        const tenantId = this.tenantContext.getTenantId();

        if (!tenantId) {
            throw new Error('Tenant not found');
        }

        const companyContactEntity = CompanyContact.create({
            tenantId: tenantId,
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
        });

        await this.companyContactRepo.create(companyContactEntity);
        return this.companyContactMap.toDTO(companyContactEntity);
    }
}
