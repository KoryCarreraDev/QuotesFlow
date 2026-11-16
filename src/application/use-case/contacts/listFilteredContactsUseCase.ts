import { GenericListFilteredUseCase } from '../filter/GenericListFilteredUseCase.js';
import { Contact } from '@/domain/entities/Contact.js';
import { ContactDTO } from '@/application/dtos/ContactDTO.js';

/**
 * Listado filtrado y paginado de contactos, acotado por responsable (D-18).
 */
export type ListFilteredContactsUseCase = GenericListFilteredUseCase<Contact, ContactDTO>;
