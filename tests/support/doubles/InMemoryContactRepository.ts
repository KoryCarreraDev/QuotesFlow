import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IContactRepository } from '@/application/ports/repositories/IContactRepository.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Contact } from '@/domain/entities/Contact.js';
import { paginateInMemory } from './inMemoryPagination.js';

/**
 * Doble en memoria de `IContactRepository`. Solo ve contactos del tenant actual.
 * `findFiltered` no interpreta los filtros (eso se prueba contra PostgreSQL); solo pagina.
 */
export class InMemoryContactRepository implements IContactRepository {
  private readonly contactsById = new Map<string, Contact>();

  constructor(private readonly tenantContext: ITenantContext) {}

  /** Carga datos iniciales sin pasar por ningún caso de uso. */
  seed(...contacts: Contact[]): void {
    for (const contact of contacts) {
      this.contactsById.set(contact.id, contact);
    }
  }

  /** Devuelve el registro tal como está guardado, sin filtrar por tenant. */
  findStoredById(id: string): Contact | undefined {
    return this.contactsById.get(id);
  }

  /** Todos los registros guardados, de cualquier tenant. */
  listStored(): Contact[] {
    return [...this.contactsById.values()];
  }

  async findByTenant(): Promise<Contact[]> {
    return this.listContactsOfCurrentTenant();
  }

  async create(contact: Contact): Promise<void> {
    this.contactsById.set(contact.id, contact);
  }

  async findById(id: string): Promise<Contact | null> {
    const contact = this.contactsById.get(id);
    return contact && contact.tenantId === this.tenantContext.getTenantId() ? contact : null;
  }

  async update(contactId: string, data: Contact): Promise<void> {
    const storedContact = this.contactsById.get(contactId);
    if (!storedContact || storedContact.tenantId !== this.tenantContext.getTenantId()) {
      throw new Error('Record to update not found');
    }

    this.contactsById.set(
      contactId,
      new Contact(
        storedContact.id,
        storedContact.tenantId,
        data.firstName ?? storedContact.firstName,
        data.lastName ?? storedContact.lastName,
        data.email ?? storedContact.email,
        data.phone ?? storedContact.phone,
        data.companyId ?? storedContact.companyId,
        storedContact.createdAt,
        new Date(),
      ),
    );
  }

  async findFiltered(criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<Contact[]> {
    return paginateInMemory(this.listContactsOfCurrentTenant(), criteria);
  }

  async countFiltered(_criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<number> {
    return this.listContactsOfCurrentTenant().length;
  }

  private listContactsOfCurrentTenant(): Contact[] {
    return this.listStored().filter((contact) => contact.tenantId === this.tenantContext.getTenantId());
  }
}
