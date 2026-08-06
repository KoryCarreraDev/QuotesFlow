import { UpdateLeadDTO } from "@/application/dtos/UpdateLeadDTO.js";
import { ILeadRepository } from "@/application/ports/repositories/ILeadRepository.js";
import { ILeadMapper } from "@/application/ports/mappers/ILeadMapper.js";
import { ITenantContext } from "@/application/ports/services/ITenantContext.js";
import { Role } from "@/domain/enums/Role.js";
import { Lead } from "@/domain/entities/Lead.js";

export class UpdateLeadUseCase {
    constructor(
        private readonly leadRepo: ILeadRepository,
        private readonly leadmap: ILeadMapper,
        private readonly tenantContext: ITenantContext,
    ) {}

    async execute(leadId: string, updateLead: UpdateLeadDTO, role: string, userId: string) {

        if (!leadId || !updateLead || !role || !userId) {
            throw new Error("All information is required");
        }

        const tenantId = this.tenantContext.getTenantId();
        if (!tenantId) {
            throw new Error("Tenant ID is required");
        }

        const leadProperty = await this.leadRepo.findById(leadId);
        if (!leadProperty) {
            throw new Error("Lead not found");
        }

        if (role === Role.SALES_REP && leadProperty.assignedToId !== userId) {
            throw new Error("You can only update your own leads");
        }

        const updatedLead = new Lead(
            leadProperty.id,
            leadProperty.tenantId,
            updateLead.companyName !== undefined ? updateLead.companyName : leadProperty.companyName,
            updateLead.contactName !== undefined ? updateLead.contactName : leadProperty.contactName,
            updateLead.email !== undefined ? updateLead.email : leadProperty.email,
            updateLead.phone !== undefined ? updateLead.phone : leadProperty.phone,
            leadProperty.statusId,
            updateLead.source !== undefined ? updateLead.source : leadProperty.source,
            role === Role.SALES_REP
                ? leadProperty.assignedToId
                : (updateLead.assignedToId !== undefined ? updateLead.assignedToId : leadProperty.assignedToId),
            updateLead.estimatedValue !== undefined ? updateLead.estimatedValue : leadProperty.estimatedValue,
            updateLead.expectedCloseDate !== undefined ? updateLead.expectedCloseDate : leadProperty.expectedCloseDate,
            updateLead.notes !== undefined ? updateLead.notes : leadProperty.notes,
            leadProperty.createdAt,
            new Date()
        );

        await this.leadRepo.update(leadProperty.id, updatedLead);

        return this.leadmap.toDTO(updatedLead);
    }
}