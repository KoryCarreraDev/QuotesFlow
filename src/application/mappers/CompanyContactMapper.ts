import { ICompanyContactMapper } from "../ports/mappers/ICompanyContactMapper.js";
import { CompanyContact } from "../../domain/entities/CompanyContact.js";
import { CompanyContactDTO } from "../dtos/CompanyContactDTO.js";

export class CompanyContactMapper implements ICompanyContactMapper {
    toDTO(companyContact: CompanyContact): CompanyContactDTO {
        return {
            id: companyContact.id,
            name: companyContact.name,
            industry: companyContact.industry,
            taxNumber: companyContact.taxNumber,
            phone: companyContact.phone,
            email: companyContact.email,
            address: companyContact.address,
            city: companyContact.city,
            state: companyContact.state,
            zip: companyContact.zip,
            country: companyContact.country,
        };
    }
}
