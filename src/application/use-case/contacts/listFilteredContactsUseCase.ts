import { GenericListFilteredUseCase } from "../filter/GenericListFilteredUseCase.js";
import { Contact } from "@/domain/entities/Contact.js";
import { ContactDTO } from "@/application/dtos/ContactDTO.js";

export type ListFilteredContactsUseCase = GenericListFilteredUseCase<Contact, ContactDTO>;
