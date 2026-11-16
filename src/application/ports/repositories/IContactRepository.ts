import { Contact } from '../../../domain/entities/Contact.js';
import { IFilterableRepository } from './IFilterableRepository.js';

export interface IContactRepository extends IFilterableRepository<Contact> {
  findByTenant(): Promise<Contact[]>;
  create(contact: Contact): Promise<void>;
  /** Contacto no borrado del tenant actual. */
  findById(id: string): Promise<Contact | null>;
  update(contactId: string, data: Contact): Promise<void>;
  /** Borrado suave. */
  delete(contactId: string): Promise<void>;
  /** Contactos no borrados vinculados a la empresa cliente. */
  countActiveByCompany(companyContactId: string): Promise<number>;
}
