import { LeadStatusConfigMapper } from '../../application/mappers/LeadConfigStatusMapper.js';
import { CreateLeadStatusConfigUseCase } from '../../application/use-case/LeadStatusConfig/createLeadStatusConfigUseCase.js';
import { GetLeadStatusConfigUseCase } from '../../application/use-case/LeadStatusConfig/getLeadStatusConfigUseCase.js';
import { UpdateLeadStatusConfigUseCase } from '../../application/use-case/LeadStatusConfig/updateLeadStatusConfigUseCase.js';
import { PrismaLeadStatusConfigRepository } from '../../infrastructure/persistence/repositories/PrismaLeadStatusConfig.js';
import { ModuleDependencies } from './ModuleDependencies.js';

/** Estados de lead configurables por empresa. */
export class LeadStatusModule {
  private readonly leadStatusMapper = new LeadStatusConfigMapper();

  constructor(private readonly dependencies: ModuleDependencies) {}

  private createLeadStatusRepository(): PrismaLeadStatusConfigRepository {
    return new PrismaLeadStatusConfigRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  getGetLeadStatusConfigUseCase(): GetLeadStatusConfigUseCase {
    return new GetLeadStatusConfigUseCase(
      this.createLeadStatusRepository(),
      this.leadStatusMapper,
      this.dependencies.tenantContext,
    );
  }

  getCreateLeadStatusConfigUseCase(): CreateLeadStatusConfigUseCase {
    return new CreateLeadStatusConfigUseCase(
      this.createLeadStatusRepository(),
      this.leadStatusMapper,
      this.dependencies.tenantContext,
    );
  }

  getUpdateLeadStatusConfigUseCase(): UpdateLeadStatusConfigUseCase {
    return new UpdateLeadStatusConfigUseCase(
      this.createLeadStatusRepository(),
      this.leadStatusMapper,
      this.dependencies.tenantContext,
    );
  }
}
