import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { LeadStatusConfigMapper } from '../../application/mappers/LeadConfigStatusMapper.js';
import { CreateLeadStatusConfigUseCase } from '../../application/use-case/LeadStatusConfig/createLeadStatusConfigUseCase.js';
import { GetLeadStatusConfigUseCase } from '../../application/use-case/LeadStatusConfig/getLeadStatusConfigUseCase.js';
import { UpdateLeadStatusConfigUseCase } from '../../application/use-case/LeadStatusConfig/updateLeadStatusConfigUseCase.js';
import { DeleteLeadStatusConfigUseCase } from '../../application/use-case/LeadStatusConfig/deleteLeadStatusConfigUseCase.js';
import { ReorderLeadStatusConfigsUseCase } from '../../application/use-case/LeadStatusConfig/reorderLeadStatusConfigsUseCase.js';
import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaLeadStatusConfigRepository } from '../../infrastructure/persistence/repositories/PrismaLeadStatusConfig.js';
import { ModuleDependencies } from './ModuleDependencies.js';

/** Estados de lead configurables por empresa. */
export class LeadStatusModule {
  private readonly leadStatusMapper = new LeadStatusConfigMapper();

  constructor(private readonly dependencies: ModuleDependencies) {}

  private createAuditLogger(): PrismaAuditLogger {
    return new PrismaAuditLogger(this.dependencies.prisma, this.dependencies.tenantContext);
  }

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
      this.createAuditLogger(),
      this.createTransactionManager(),
    );
  }

  getUpdateLeadStatusConfigUseCase(): UpdateLeadStatusConfigUseCase {
    return new UpdateLeadStatusConfigUseCase(
      this.createLeadStatusRepository(),
      this.leadStatusMapper,
      this.dependencies.tenantContext,
      this.createAuditLogger(),
      this.createTransactionManager(),
    );
  }

  getDeleteLeadStatusConfigUseCase(): DeleteLeadStatusConfigUseCase {
    return new DeleteLeadStatusConfigUseCase(
      this.createLeadStatusRepository(),
      this.createTransactionManager(),
      this.createAuditLogger(),
    );
  }

  getReorderLeadStatusConfigsUseCase(): ReorderLeadStatusConfigsUseCase {
    return new ReorderLeadStatusConfigsUseCase(
      this.createLeadStatusRepository(),
      this.leadStatusMapper,
      this.dependencies.tenantContext,
      this.createTransactionManager(),
      this.createAuditLogger(),
    );
  }

  private createTransactionManager(): PrismaTransactionManager {
    return new PrismaTransactionManager(this.dependencies.prisma);
  }
}
