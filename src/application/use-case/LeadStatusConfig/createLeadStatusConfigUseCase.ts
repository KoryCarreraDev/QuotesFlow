import { CreateLeadStatusConfigDTO } from "@/application/dtos/CreateLeadStatusConfigDTO.js";
import { ILeadStatusConfigRepository } from "@/application/ports/repositories/ILeadStatusConfigRepository.js";
import { ILeadStatusConfigMapper } from "@/application/ports/mappers/ILeadStatusConfigMapper.js";
import { ITenantContext } from "@/application/ports/services/ITenantContext.js";
import { LeadStatusConfig } from "@/domain/entities/LeadStatusConfig.js";
import { Role } from "@/domain/enums/Role.js";

export class CreateLeadStatusConfigUseCase {
    constructor (
        private readonly statusRepo: ILeadStatusConfigRepository,
        private readonly statusMap: ILeadStatusConfigMapper,
        private readonly tenantContext: ITenantContext,
    ) {}

    async execute(createLeadStatus: CreateLeadStatusConfigDTO, role: string) {

        const tenantId = this.tenantContext.getTenantId();

        if(!tenantId) {
            throw new Error('Tenant not found');
        }

        if(role === Role.SALES_REP){
            throw new Error('Insufficient permissions')
        }

        const defaultStatus = await this.statusRepo.findDefaultByTenant(tenantId);

        if(createLeadStatus.isDefault === true){
            if(defaultStatus){
                const oldDefaultLeadStatus = new LeadStatusConfig(
                    defaultStatus.id,
                    defaultStatus.name,
                    defaultStatus.order,
                    false,
                    new Date(),
                    defaultStatus.createdAt,
                    defaultStatus.color,
                    tenantId,
                    defaultStatus.deleted
                )
                await this.statusRepo.update(oldDefaultLeadStatus.id, oldDefaultLeadStatus);
            }
        }

        const leadStatusEntity = LeadStatusConfig.create({
            name: createLeadStatus.name,
            order: createLeadStatus.order,
            isDefault: createLeadStatus.isDefault,
            tenantId: tenantId,
            color: createLeadStatus.color
        })

        await this.statusRepo.create(leadStatusEntity);
        return this.statusMap.toDTO(leadStatusEntity);
    }
}