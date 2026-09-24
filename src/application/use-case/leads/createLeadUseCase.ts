import { CreateLeadDTO } from "../../../application/dtos/CreateLeadDTO.js";
import { ILeadRepository } from "../../../application/ports/repositories/ILeadRepository.js";
import { ILeadStatusConfigRepository } from "@/application/ports/repositories/ILeadStatusConfigRepository.js";
import { ILeadMapper } from "../../../application/ports/mappers/ILeadMapper.js";
import { ITenantContext } from "@/application/ports/services/ITenantContext.js";
import { Lead } from "../../../domain/entities/Lead.js";

export class CreateLeadUseCase {
    constructor(
        private readonly leadRepo: ILeadRepository,
        private readonly leadmap: ILeadMapper,
        private readonly tenantContext: ITenantContext,
        private readonly statusRepo: ILeadStatusConfigRepository
    ) { }

    async execute(createLead: CreateLeadDTO, userId: string, role: string) {

        const tenantId = this.tenantContext.getTenantId();

        if (!tenantId) {
            throw new Error('Tenant not found');
        }

        let statusId = createLead.statusId;

        if (!statusId) {
            const defaultStatus = await this.statusRepo.findDefaultByTenant(tenantId);
            if (!defaultStatus) {
                throw new Error('Default lead status not configured for this tenant');
            }
            statusId = defaultStatus.id;
        } else {
            const existingStatus = await this.statusRepo.findById(statusId);
            if (!existingStatus) {
                throw new Error('Invalid statusId: does not belong to this tenant');
            }
        }

        const leadEntity = Lead.create({
            tenantId: tenantId,
            companyName: createLead.companyName,
            contactName: createLead.contactName,
            email: createLead.email,
            phone: createLead.phone,
            statusId: statusId,
            source: createLead.source,
            assignedToId: createLead.assignedToId,
            estimatedValue: createLead.estimatedValue,
            expectedCloseDate: createLead.expectedCloseDate,
            notes: createLead.notes,
        });

        await this.leadRepo.create(leadEntity);
        return this.leadmap.toDTO(leadEntity);
    }
}