import { ILeadRepository } from "@/application/ports/repositories/ILeadRepository.js";
import { ITenantContext } from "@/application/ports/services/ITenantContext.js";
import { Role } from "@/domain/enums/Role.js";

export class DeleteLeadUseCase {
    constructor(
        private readonly leadRepo: ILeadRepository,
        private readonly tenantContext: ITenantContext,
    ){}

    async execute(leadId: string, userId: string, role: Role): Promise<void> {

        const tenantId = this.tenantContext.getTenantId();

        if (!tenantId) {
            throw new Error('Tenant not found');
        }

        const existingRepo = await this.leadRepo.findById(leadId);

        if(!existingRepo){
            throw new Error('Lead not found');
        }

        if (role === Role.SALES_REP && existingRepo.assignedToId !== userId) {
            throw new Error("You do not have the necessary permissions.");
        }

        await this.leadRepo.delete(leadId);
    }
}