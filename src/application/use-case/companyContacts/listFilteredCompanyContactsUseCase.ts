import { GenericListFilteredUseCase } from '../filter/GenericListFilteredUseCase.js';
import { CompanyContact } from '@/domain/entities/CompanyContact.js';
import { CompanyContactDTO } from '@/application/dtos/CompanyContactDTO.js';

/**
 * Listado filtrado y paginado de empresas cliente, acotado por responsable (D-18).
 */
export type ListFilteredCompanyContactsUseCase = GenericListFilteredUseCase<CompanyContact, CompanyContactDTO>;
