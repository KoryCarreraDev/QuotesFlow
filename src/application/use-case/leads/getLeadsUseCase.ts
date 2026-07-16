import { ILeadRepository } from "../../../application/ports/repositories/ILeadRepository.js";
import { ILeadMapper } from "../../../application/ports/mappers/ILeadMapper.js";
import { LeadDTO } from "../../../application/dtos/LeadDTO.js";
import { Role } from "../../../domain/enums/Role.js";

export class GetLeadsUseCase {
    constructor(
        private readonly leadRepo: ILeadRepository,
        private readonly leadMapper: ILeadMapper
    ) {}

    async execute(rolUser: Role, assignedTo?: string): Promise<LeadDTO[]> {

        if (rolUser == Role.SALES_REP) {
            const leads = await this.leadRepo.findByTenant(assignedTo);
            return leads.map(this.leadMapper.toDTO);
        }

        const leads = await this.leadRepo.findByTenant();
        return leads.map(this.leadMapper.toDTO);
    }
}
