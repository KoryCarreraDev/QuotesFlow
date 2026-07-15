import { ILeadRepository } from "../../../application/ports/repositories/ILeadRepository.js";
import { ILeadMapper } from "../../../application/ports/mappers/ILeadMapper.js";
import { LeadDTO } from "../../../application/dtos/LeadDTO.js";

export class GetLeadsUseCase {
    constructor(
        private readonly leadRepo: ILeadRepository,
        private readonly leadMapper: ILeadMapper
    ) {}

    async execute(): Promise<LeadDTO[]> {
        const leads = await this.leadRepo.findByTenant();
        return leads.map(this.leadMapper.toDTO);
    }
}
