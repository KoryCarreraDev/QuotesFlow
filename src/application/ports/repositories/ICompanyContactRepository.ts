import { CompanyContact } from "../../../domain/entities/CompanyContact.js";
import { IFilterableRepository } from "./IFilterableRepository.js";

export interface ICompanyContactRepository extends IFilterableRepository<CompanyContact>{
    findByTenant(): Promise<CompanyContact[]>;
    create(companyContact: CompanyContact): Promise<void>;
    findById(id: string): Promise<CompanyContact | null>;
    update(companyContactId: string, data: CompanyContact): Promise<void>;
}
