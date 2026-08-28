import { GenericListFilteredUseCase } from "../filter/GenericListFilteredUseCase.js";
import { CompanyContact } from "@/domain/entities/CompanyContact.js";
import { CompanyContactDTO } from "@/application/dtos/CompanyContactDTO.js";

export type ListFilteredCompanyContactsUseCase = GenericListFilteredUseCase<CompanyContact, CompanyContactDTO>;
