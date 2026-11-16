import { CompanyContact } from '../../../domain/entities/CompanyContact.js';
import { IFilterableRepository } from './IFilterableRepository.js';

export interface ICompanyContactRepository extends IFilterableRepository<CompanyContact> {
  /** Empresas cliente activas del tenant; con `ownerId`, solo las de ese responsable. */
  findByTenant(ownerId?: string): Promise<CompanyContact[]>;
  /** Empresa cliente activa del tenant con ese NIT normalizado (D-19). */
  findActiveByDocumentNumber(documentNumber: string): Promise<CompanyContact | null>;
  create(companyContact: CompanyContact): Promise<void>;
  /** Empresa cliente no borrada del tenant actual. */
  findById(id: string): Promise<CompanyContact | null>;
  update(companyContactId: string, data: CompanyContact): Promise<void>;
  /** Borrado suave. */
  delete(companyContactId: string): Promise<void>;
}
