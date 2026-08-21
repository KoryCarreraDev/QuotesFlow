import { Contact } from "../../../domain/entities/Contact.js";
import { IFilterableRepository } from "./IFilterableRepository.js";

export interface IContactRepository extends IFilterableRepository<Contact>{
    findByTenant(): Promise<Contact[]>;
    create(contact: Contact): Promise<void>;
    findById(id: string): Promise<Contact | null>;
    update(contactId: string, data: Contact): Promise<void>;
}
