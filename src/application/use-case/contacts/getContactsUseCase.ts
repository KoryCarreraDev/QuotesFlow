import { IContactRepository } from "../../../application/ports/repositories/IContactRepository.js";
import { IContactMapper } from "../../../application/ports/mappers/IContactMapper.js";
import { ContactDTO } from "../../../application/dtos/ContactDTO.js";

export class GetContactsUseCase {
    constructor(
        private readonly contactRepo: IContactRepository,
        private readonly contactMapper: IContactMapper
    ) {}

    async execute(): Promise<ContactDTO[]> {
        const contacts = await this.contactRepo.findByTenant();
        return contacts.map(this.contactMapper.toDTO);
    }
}
