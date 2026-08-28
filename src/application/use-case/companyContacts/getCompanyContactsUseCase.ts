import { ICompanyContactRepository } from "../../../application/ports/repositories/ICompanyContactRepository.js";
import { ICompanyContactMapper } from "../../../application/ports/mappers/ICompanyContactMapper.js";
import { CompanyContactDTO } from "../../../application/dtos/CompanyContactDTO.js";

export class GetCompanyContactsUseCase {
    constructor(
        private readonly companyContactRepo: ICompanyContactRepository,
        private readonly companyContactMapper: ICompanyContactMapper
    ) {}

    async execute(): Promise<CompanyContactDTO[]> {
        const companyContacts = await this.companyContactRepo.findByTenant();
        return companyContacts.map(this.companyContactMapper.toDTO);
    }
}
