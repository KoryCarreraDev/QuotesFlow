import { IContactMapper } from "../ports/mappers/IContactMapper.js";
import { Contact } from "../../domain/entities/Contact.js";
import { ContactDTO } from "../dtos/ContactDTO.js";

export class ContactMapper implements IContactMapper {
    toDTO(contact: Contact): ContactDTO {
        return {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone,
            companyId: contact.companyId,
        };
    }
}
