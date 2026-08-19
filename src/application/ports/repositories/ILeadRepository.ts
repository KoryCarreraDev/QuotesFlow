import { Lead } from "../../../domain/entities/Lead.js";
import { IFilterableRepository } from "./IFilterableRepository.js";

export interface ILeadRepository extends IFilterableRepository<Lead>{
    findByTenant(AssignedTo?: string | undefined): Promise<Lead[]>;
    create(lead: Lead): Promise<void>;
    findById(id: string): Promise<Lead | null>;
    update(leadId: string, data: Lead): Promise<void>;
}