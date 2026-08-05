import { Lead } from "../../../domain/entities/Lead.js";

export interface ILeadRepository {
    findByTenant(AssignedTo?: string | undefined): Promise<Lead[]>;
    create(lead: Lead): Promise<void>;
    findById(id: string): Promise<Lead | null>;
    update(leadId: string, data: Lead): Promise<void>;
}