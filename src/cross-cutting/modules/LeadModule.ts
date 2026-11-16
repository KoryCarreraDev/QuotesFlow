import { LeadMapper } from '../../application/mappers/LeadMapper.js';
import { GenericListFilteredUseCase } from '../../application/use-case/filter/GenericListFilteredUseCase.js';
import { CreateLeadUseCase } from '../../application/use-case/leads/createLeadUseCase.js';
import { DeleteLeadUseCase } from '../../application/use-case/leads/deleteLeadUseCase.js';
import { GetLeadsUseCase } from '../../application/use-case/leads/getLeadsUseCase.js';
import { ListFilteredLeadsUseCase } from '../../application/use-case/leads/listFilteredLeadsUseCase.js';
import { UpdateLeadUseCase } from '../../application/use-case/leads/updateLeadUseCase.js';
import { leadFilterConfig } from '../../infrastructure/persistence/filters/leadFilterConfig.js';
import { PrismaLeadRepository } from '../../infrastructure/persistence/repositories/PrismaLeadRepository.js';
import { PrismaLeadStatusConfigRepository } from '../../infrastructure/persistence/repositories/PrismaLeadStatusConfig.js';
import { PrismaUserRepository } from '../../infrastructure/persistence/repositories/PrismaUserRepository.js';
import { ModuleDependencies } from './ModuleDependencies.js';

/** Leads: listado, filtrado, alta, modificación y borrado suave. */
export class LeadModule {
  private readonly leadMapper = new LeadMapper();

  constructor(private readonly dependencies: ModuleDependencies) {}

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
    );
  }

  getUpdateLeadUseCase(): UpdateLeadUseCase {
    return new UpdateLeadUseCase(this.createLeadRepository(), this.leadMapper, this.dependencies.tenantContext);
  }

  getDeleteLeadUseCase(): DeleteLeadUseCase {
    return new DeleteLeadUseCase(this.createLeadRepository(), this.dependencies.tenantContext);
  }

  getListFilteredLeadsUseCase(): ListFilteredLeadsUseCase {
    return new GenericListFilteredUseCase(this.createLeadRepository(), this.leadMapper, leadFilterConfig);
  }
}
