import { Lead } from "../../../domain/entities/Lead.js";

export interface ILeadRepository {
    findByTenant(): Promise<Lead[]>;
}