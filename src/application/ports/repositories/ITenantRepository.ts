import { Tenant } from "../../../domain/entities/Tenant.js";

export interface ITenantRepository{
    create(tenant: Tenant): Promise<void>;
    findById(id: string): Promise<Tenant | null>;
}