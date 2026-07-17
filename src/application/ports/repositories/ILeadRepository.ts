import { Lead } from "../../../domain/entities/Lead.js";

export interface ILeadRepository {
    findByTenant(AssignedTo?: string | undefined): Promise<Lead[]>;
    create(lead: Lead): Promise<void>;
}