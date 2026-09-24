import { UpdateLeadStatusConfigDTO } from "@/application/dtos/UpdateLeadStatusConfigDTO.js";
import { ILeadStatusConfigMapper } from "@/application/ports/mappers/ILeadStatusConfigMapper.js";
import { ILeadStatusConfigRepository } from "@/application/ports/repositories/ILeadStatusConfigRepository.js";
import { ITenantContext } from "@/application/ports/services/ITenantContext.js";
import { Role } from "@/domain/enums/Role.js";
import { LeadStatusConfig } from "@/domain/entities/LeadStatusConfig.js";
import { error } from "node:console";

export class UpdateLeadStatusConfigUseCase {
    constructor(
        private readonly statusRepo: ILeadStatusConfigRepository,
        private readonly statusMap: ILeadStatusConfigMapper,
        private readonly tenantContext: ITenantContext,
    ){}

    async execute(
        statusId: string, 
        statusUpdate: UpdateLeadStatusConfigDTO, 
        role: Role, 
        userId: string
    ){
     
        if(!statusId || !statusUpdate || !role || !userId){
            throw new Error('All information is required');
        };

        const tenantId = this.tenantContext.getTenantId();
        if(!tenantId) {
            throw new Error('Tenant Id is required');
        };

        const statusProperty = await this.statusRepo.findById(statusId);
        if(!statusProperty){
            throw new Error('Status Lead not found');           
        }

        if(role === Role.SALES_REP){
            throw new Error('Insufficient permissions');
        };

        const defaultStatus = await this.statusRepo.findDefaultByTenant(tenantId);

        if(defaultStatus?.id === statusId && statusUpdate.isDefault === false) {
            throw new Error("You cannot disable a default state without first having another one");
        }

        if(statusUpdate.isDefault === true){
            if (defaultStatus &&defaultStatus?.id !== statusId) {
                
                const oldDefaultStatus = new LeadStatusConfig(
                    defaultStatus!.id,
                    defaultStatus!.name,
                    defaultStatus!.order,
                    false,
                    new Date(),
                    defaultStatus!.createdAt,
                    defaultStatus!.color,
                    tenantId,
                    defaultStatus!.deleted
                );
                await this.statusRepo.update(oldDefaultStatus.id, oldDefaultStatus);
            }
        }

        const updateStatus = new LeadStatusConfig(
            statusProperty.id,
            statusUpdate.name !== undefined ? statusUpdate.name : statusProperty.name,
            statusUpdate.order !== undefined ? statusUpdate.order : statusProperty.order,
            statusUpdate.isDefault !== undefined ? statusUpdate.isDefault : statusProperty.isDefault,
            new Date(),
            statusProperty.createdAt,
            statusUpdate.color !== undefined ? statusUpdate.color : statusProperty.color,
            tenantId,
            statusProperty.deleted
        )

        await this.statusRepo.update(statusProperty.id, updateStatus);

        return this.statusMap.toDTO(updateStatus);
    }
}