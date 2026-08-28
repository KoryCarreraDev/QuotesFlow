import { CompanyContact } from "../../../domain/entities/CompanyContact.js";
import { CompanyContactDTO } from "../../../application/dtos/CompanyContactDTO.js";
import { IMapper } from "./IMapper.js";

export interface ICompanyContactMapper extends IMapper<CompanyContact, CompanyContactDTO> {
    toDTO(companyContact: CompanyContact): CompanyContactDTO;
}
