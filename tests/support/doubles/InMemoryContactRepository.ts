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
  // La entidad `Contact` no lleva la marca de borrado; el doble la guarda aparte, como hace la base.
  private readonly deletedContactIds = new Set<string>();

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

  async findByTenant(ownerId?: string): Promise<Contact[]> {
    const contacts = this.listContactsOfCurrentTenant();
    return ownerId ? contacts.filter((contact) => contact.ownerId === ownerId) : contacts;
  }

  async findActiveByDocumentNumber(documentNumber: string): Promise<Contact | null> {
    return this.listContactsOfCurrentTenant().find((contact) => contact.documentNumber === documentNumber) ?? null;
  }

  async create(contact: Contact): Promise<void> {
    this.contactsById.set(contact.id, contact);
  }

  async findById(id: string): Promise<Contact | null> {
    const contact = this.contactsById.get(id);
    return contact && this.isVisible(contact) ? contact : null;
  }

  async delete(contactId: string): Promise<void> {
    const storedContact = this.contactsById.get(contactId);
    if (!storedContact || storedContact.tenantId !== this.tenantContext.getTenantId()) {
      throw new Error('Record to delete not found');
    }
    this.deletedContactIds.add(contactId);
  }

  async countActiveByCompany(companyContactId: string): Promise<number> {
    return this.listContactsOfCurrentTenant().filter((contact) => contact.companyId === companyContactId).length;
  }

  async update(contactId: string, data: Contact): Promise<void> {
    const storedContact = this.contactsById.get(contactId);
    if (!storedContact || !this.isVisible(storedContact)) {
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
        data.ownerId,
        data.documentType,
        data.documentNumber,
      ),
    );
  }

  async findFiltered(criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<Contact[]> {
    return paginateInMemory(this.listContactsOfCurrentTenant(), criteria);
  }

  async countFiltered(_criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<number> {
    return this.listContactsOfCurrentTenant().length;
  }

  private isVisible(contact: Contact): boolean {
    return contact.tenantId === this.tenantContext.getTenantId() && !this.deletedContactIds.has(contact.id);
  }

  private listContactsOfCurrentTenant(): Contact[] {
    return this.listStored().filter((contact) => this.isVisible(contact));
  }
}
