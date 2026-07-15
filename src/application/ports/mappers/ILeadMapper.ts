import { Lead } from "../../../domain/entities/Lead.js";
import { LeadDTO } from "../../../application/dtos/LeadDTO.js";

export interface ILeadMapper {
    toDTO(lead: Lead): LeadDTO;
}