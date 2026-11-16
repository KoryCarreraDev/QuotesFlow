import { ILeadStatusConfigRepository } from '@/application/ports/repositories/ILeadStatusConfigRepository.js';
import { ILeadStatusConfigMapper } from '@/application/ports/mappers/ILeadStatusConfigMapper.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';

/**
 * Estados de lead de la empresa, ordenados por su campo `order`.
 */
export class GetLeadStatusConfigUseCase {
  constructor(
    private readonly leadStatusRepository: ILeadStatusConfigRepository,
    private readonly leadStatusMapper: ILeadStatusConfigMapper,
    private readonly tenantContext: ITenantContext,
  ) {}

  async execute() {
    const tenantId = this.tenantContext.getTenantId();

    if (!tenantId) {
      throw new Error('Tenant not found');
    }

    const status = await this.leadStatusRepository.findAllByTenant(tenantId);
    return status.map((entity) => this.leadStatusMapper.toDTO(entity));
  }
}
