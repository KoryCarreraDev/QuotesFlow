import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { Action } from '../../application/policies/authorizationPolicy.js';
import { LeadMapper } from '../../application/mappers/LeadMapper.js';
import { GenericListFilteredUseCase } from '../../application/use-case/filter/GenericListFilteredUseCase.js';
import { CreateLeadUseCase } from '../../application/use-case/leads/createLeadUseCase.js';
import { DeleteLeadUseCase } from '../../application/use-case/leads/deleteLeadUseCase.js';
import { GetLeadsUseCase } from '../../application/use-case/leads/getLeadsUseCase.js';
import { ListFilteredLeadsUseCase } from '../../application/use-case/leads/listFilteredLeadsUseCase.js';
import { UpdateLeadUseCase } from '../../application/use-case/leads/updateLeadUseCase.js';
import { ChangeLeadStatusUseCase } from '../../application/use-case/leads/changeLeadStatusUseCase.js';
import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaLeadStatusHistoryRepository } from '../../infrastructure/persistence/repositories/PrismaLeadStatusHistoryRepository.js';
import { leadFilterConfig } from '../../infrastructure/persistence/filters/leadFilterConfig.js';
import { PrismaLeadRepository } from '../../infrastructure/persistence/repositories/PrismaLeadRepository.js';
import { PrismaLeadStatusConfigRepository } from '../../infrastructure/persistence/repositories/PrismaLeadStatusConfig.js';
import { PrismaUserRepository } from '../../infrastructure/persistence/repositories/PrismaUserRepository.js';
import { ModuleDependencies } from './ModuleDependencies.js';

/** Leads: listado, filtrado, alta, modificación y borrado suave. */
export class LeadModule {
  private readonly leadMapper = new LeadMapper();

  constructor(private readonly dependencies: ModuleDependencies) {}

  private createAuditLogger(): PrismaAuditLogger {
    return new PrismaAuditLogger(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createLeadRepository(): PrismaLeadRepository {
    return new PrismaLeadRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  getGetLeadsUseCase(): GetLeadsUseCase {
    return new GetLeadsUseCase(this.createLeadRepository(), this.leadMapper);
  }

  getCreateLeadUseCase(): CreateLeadUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new CreateLeadUseCase(
      this.createLeadRepository(),
      this.leadMapper,
      tenantContext,
      new PrismaLeadStatusConfigRepository(prisma, tenantContext),
      new PrismaUserRepository(prisma, tenantContext),
      this.createAuditLogger(),
    );
  }

  getUpdateLeadUseCase(): UpdateLeadUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new UpdateLeadUseCase(
      this.createLeadRepository(),
      this.leadMapper,
      tenantContext,
      new PrismaUserRepository(prisma, tenantContext),
      this.createAuditLogger(),
    );
  }

  getChangeLeadStatusUseCase(): ChangeLeadStatusUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new ChangeLeadStatusUseCase(
      this.createLeadRepository(),
      new PrismaLeadStatusConfigRepository(prisma, tenantContext),
      new PrismaLeadStatusHistoryRepository(prisma, tenantContext),
      new PrismaTransactionManager(prisma),
      this.leadMapper,
      tenantContext,
      this.createAuditLogger(),
    );
  }

  getDeleteLeadUseCase(): DeleteLeadUseCase {
    return new DeleteLeadUseCase(
      this.createLeadRepository(),
      this.dependencies.tenantContext,
      this.createAuditLogger(),
    );
  }

  getListFilteredLeadsUseCase(): ListFilteredLeadsUseCase {
    return new GenericListFilteredUseCase(this.createLeadRepository(), this.leadMapper, leadFilterConfig, {
      action: Action.LEAD_LIST,
      ownerField: 'assignedToId',
    });
  }
}
