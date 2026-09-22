import { LeadStatusConfig } from "@/domain/entities/LeadStatusConfig.js";
import { LeadStatusConfigDTO } from "@/application/dtos/LeadStatusConfigDTO.js";
import { IMapper } from "./IMapper.js";

export interface ILeadStatusConfigMapper extends IMapper<LeadStatusConfig, LeadStatusConfigDTO>{
    toDTO(leadStatus: LeadStatusConfig): LeadStatusConfigDTO;
};