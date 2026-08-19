import { Lead } from "../../../domain/entities/Lead.js";
import { LeadDTO } from "../../../application/dtos/LeadDTO.js";
import { IMapper } from "./IMapper.js";

export interface ILeadMapper extends IMapper<Lead, LeadDTO> {
    toDTO(lead: Lead): LeadDTO;
}