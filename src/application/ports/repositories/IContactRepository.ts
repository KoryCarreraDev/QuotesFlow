import { Contact } from '../../../domain/entities/Contact.js';
import { IFilterableRepository } from './IFilterableRepository.js';

export interface IContactRepository extends IFilterableRepository<Contact> {
  /** Contactos activos del tenant; con `ownerId`, solo los de ese responsable. */
  findByTenant(ownerId?: string): Promise<Contact[]>;
  /** Contacto activo del tenant con ese documento normalizado (D-19). */
  findActiveByDocumentNumber(documentNumber: string): Promise<Contact | null>;
  create(contact: Contact): Promise<void>;
  /** Contacto no borrado del tenant actual. */
  findById(id: string): Promise<Contact | null>;
  update(contactId: string, data: Contact): Promise<void>;
  /** Borrado suave. */
  delete(contactId: string): Promise<void>;
  /** Contactos no borrados vinculados a la empresa cliente. */
  countActiveByCompany(companyContactId: string): Promise<number>;
}
