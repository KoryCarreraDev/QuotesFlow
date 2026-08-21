import { Contact } from "../../../domain/entities/Contact.js";
import { ContactDTO } from "../../../application/dtos/ContactDTO.js";
import { IMapper } from "./IMapper.js";

export interface IContactMapper extends IMapper<Contact, ContactDTO> {
    toDTO(contact: Contact): ContactDTO;
}
