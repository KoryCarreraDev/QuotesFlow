import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { ICompanyContactRepository } from '@/application/ports/repositories/ICompanyContactRepository.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { CompanyContact } from '@/domain/entities/CompanyContact.js';
import { paginateInMemory } from './inMemoryPagination.js';

/**
 * Doble en memoria de `ICompanyContactRepository`. Solo ve empresas del tenant actual.
 * `findFiltered` no interpreta los filtros (eso se prueba contra PostgreSQL); solo pagina.
 */
export class InMemoryCompanyContactRepository implements ICompanyContactRepository {
  private readonly companyContactsById = new Map<string, CompanyContact>();

  constructor(private readonly tenantContext: ITenantContext) {}

  /** Carga datos iniciales sin pasar por ningún caso de uso. */
  seed(...companyContacts: CompanyContact[]): void {
    for (const companyContact of companyContacts) {
      this.companyContactsById.set(companyContact.id, companyContact);
    }
  }

  /** Devuelve el registro tal como está guardado, sin filtrar por tenant. */
  findStoredById(id: string): CompanyContact | undefined {
    return this.companyContactsById.get(id);
  }

  /** Todos los registros guardados, de cualquier tenant. */
  listStored(): CompanyContact[] {
    return [...this.companyContactsById.values()];
  }

  async findByTenant(): Promise<CompanyContact[]> {
    return this.listCompanyContactsOfCurrentTenant();
  }

  async create(companyContact: CompanyContact): Promise<void> {
    this.companyContactsById.set(companyContact.id, companyContact);
  }

  async findById(id: string): Promise<CompanyContact | null> {
    const companyContact = this.companyContactsById.get(id);
    return companyContact && companyContact.tenantId === this.tenantContext.getTenantId() ? companyContact : null;
  }

  async update(companyContactId: string, data: CompanyContact): Promise<void> {
    const storedCompanyContact = this.companyContactsById.get(companyContactId);
    if (!storedCompanyContact || storedCompanyContact.tenantId !== this.tenantContext.getTenantId()) {
      throw new Error('Record to update not found');
    }

    this.companyContactsById.set(
      companyContactId,
      new CompanyContact(
        storedCompanyContact.id,
        storedCompanyContact.tenantId,
        data.name ?? storedCompanyContact.name,
        data.industry ?? storedCompanyContact.industry,
        data.taxNumber ?? storedCompanyContact.taxNumber,
        data.phone ?? storedCompanyContact.phone,
        data.email ?? storedCompanyContact.email,
        data.address ?? storedCompanyContact.address,
        data.city ?? storedCompanyContact.city,
        data.state ?? storedCompanyContact.state,
        data.zip ?? storedCompanyContact.zip,
        data.country ?? storedCompanyContact.country,
        storedCompanyContact.createdAt,
        new Date(),
      ),
    );
  }

  async findFiltered(criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<CompanyContact[]> {
    return paginateInMemory(this.listCompanyContactsOfCurrentTenant(), criteria);
  }

  async countFiltered(_criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<number> {
    return this.listCompanyContactsOfCurrentTenant().length;
  }

  private listCompanyContactsOfCurrentTenant(): CompanyContact[] {
    return this.listStored().filter((companyContact) => companyContact.tenantId === this.tenantContext.getTenantId());
  }
}
