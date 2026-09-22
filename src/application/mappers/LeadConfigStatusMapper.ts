import { ILeadStatusConfigMapper } from "../ports/mappers/ILeadStatusConfigMapper.js";
import { LeadStatusConfig } from "@/domain/entities/LeadStatusConfig.js";
import { LeadStatusConfigDTO } from "../dtos/LeadStatusConfigDTO.js";

export class LeadStatusConfigMapper implements ILeadStatusConfigMapper {
    toDTO(leadStatus: LeadStatusConfig): LeadStatusConfigDTO {
        return {
            id: leadStatus.id!,
            name: leadStatus.name!,
            order: leadStatus.order!,
            isDefault: leadStatus.isDefault!,
            color: leadStatus.color!,
            deleted: leadStatus.deleted
        };
    };
}