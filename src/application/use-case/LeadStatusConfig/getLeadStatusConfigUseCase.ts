import { ILeadStatusConfigRepository } from "@/application/ports/repositories/ILeadStatusConfigRepository.js";
import { ILeadStatusConfigMapper } from "@/application/ports/mappers/ILeadStatusConfigMapper.js";
import { ITenantContext } from "@/application/ports/services/ITenantContext.js";

export class GetLeadStatusConfigUseCase{
    constructor(
        private readonly statusRepo: ILeadStatusConfigRepository,
        private readonly statusMap: ILeadStatusConfigMapper,
        private readonly tenantContext: ITenantContext,
    ) {}

    async execute() {
        const tenantId = this.tenantContext.getTenantId();

        if(!tenantId) {
            throw new Error('Tenant not found');
        };

        const status = await this.statusRepo.findAllByTenant(tenantId);
        return status.map(this.statusMap.toDTO);
    }
}

