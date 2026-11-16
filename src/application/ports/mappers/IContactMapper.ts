import { Contact } from '../../../domain/entities/Contact.js';
import { ContactDTO } from '../../../application/dtos/ContactDTO.js';
import { IMapper } from './IMapper.js';

/**
 * Convierte un contacto de dominio en el DTO que devuelve la API.
 */
export interface IContactMapper extends IMapper<Contact, ContactDTO> {
  toDTO(contact: Contact): ContactDTO;
}
