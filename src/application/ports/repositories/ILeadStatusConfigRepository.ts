import { LeadStatusConfig } from "@/domain/entities/LeadStatusConfig.js";

export interface ILeadStatusConfigRepository {
    create(Status: LeadStatusConfig): Promise<void>;
    update(Statusid: string, data: LeadStatusConfig): Promise<void>;
    findAllByTenant(assignedTenant: string): Promise<LeadStatusConfig[]>;
    findById(id: string): Promise<LeadStatusConfig | null>;
    countLeadByStatus(statusId: string): Promise<number>;
    findDefaultByTenant(assignedTenant: string): Promise<LeadStatusConfig | null>;
}