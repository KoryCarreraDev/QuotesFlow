import { ILeadMapper } from "../ports/mappers/ILeadMapper.js";
import { Lead } from "../../domain/entities/Lead.js";
import { LeadDTO } from "../../application/dtos/LeadDTO.js";

export class LeadMapper implements ILeadMapper {
    toDTO(lead: Lead): LeadDTO {
        return {
            id: lead.id,
            companyName: lead.companyName,
            contactName: lead.contactName,
            email: lead.email,
            phone: lead.phone,
            statusId: lead.statusId,
            source: lead.source,
            assignedToId: lead.assignedToId,
            estimatedValue: lead.estimatedValue,
            expectedCloseDate: lead.expectedCloseDate,
            notes: lead.notes,
        };
    }
}