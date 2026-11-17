import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { Action } from '../../application/policies/authorizationPolicy.js';
import { PrismaUserRepository } from '../../infrastructure/persistence/repositories/PrismaUserRepository.js';
import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { CompanyContactMapper } from '../../application/mappers/CompanyContactMapper.js';
import { CreateCompanyContactUseCase } from '../../application/use-case/companyContacts/createCompanyContactUseCase.js';
import { GetCompanyContactsUseCase } from '../../application/use-case/companyContacts/getCompanyContactsUseCase.js';
import { ListFilteredCompanyContactsUseCase } from '../../application/use-case/companyContacts/listFilteredCompanyContactsUseCase.js';
import { UpdateCompanyContactUseCase } from '../../application/use-case/companyContacts/updateCompanyContactUseCase.js';
import { DeleteCompanyContactUseCase } from '../../application/use-case/companyContacts/deleteCompanyContactUseCase.js';
import { PrismaContactRepository } from '../../infrastructure/persistence/repositories/PrismaContactRepository.js';
import { GenericListFilteredUseCase } from '../../application/use-case/filter/GenericListFilteredUseCase.js';
import { companyContactFilterConfig } from '../../infrastructure/persistence/filters/companyContactFilterConfig.js';
import { PrismaCompanyContactRepository } from '../../infrastructure/persistence/repositories/PrismaCompanyContactRepository.js';
import { ModuleDependencies } from './ModuleDependencies.js';

/** Empresas cliente. */
export class CompanyContactModule {
  private readonly companyContactMapper = new CompanyContactMapper();

  constructor(private readonly dependencies: ModuleDependencies) {}

  private createAuditLogger(): PrismaAuditLogger {
    return new PrismaAuditLogger(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createCompanyContactRepository(): PrismaCompanyContactRepository {
    return new PrismaCompanyContactRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  getGetCompanyContactsUseCase(): GetCompanyContactsUseCase {
    return new GetCompanyContactsUseCase(this.createCompanyContactRepository(), this.companyContactMapper);
  }

  getCreateCompanyContactUseCase(): CreateCompanyContactUseCase {
    return new CreateCompanyContactUseCase(
      this.createCompanyContactRepository(),
      this.companyContactMapper,
      this.dependencies.tenantContext,
      this.createAuditLogger(),
      new PrismaUserRepository(this.dependencies.prisma, this.dependencies.tenantContext),
      new PrismaTransactionManager(this.dependencies.prisma),
    );
  }

  getUpdateCompanyContactUseCase(): UpdateCompanyContactUseCase {
    return new UpdateCompanyContactUseCase(
      this.createCompanyContactRepository(),
      this.companyContactMapper,
      this.dependencies.tenantContext,
      this.createAuditLogger(),
      new PrismaUserRepository(this.dependencies.prisma, this.dependencies.tenantContext),
      new PrismaTransactionManager(this.dependencies.prisma),
    );
  }

  getDeleteCompanyContactUseCase(): DeleteCompanyContactUseCase {
    return new DeleteCompanyContactUseCase(
      this.createCompanyContactRepository(),
      new PrismaContactRepository(this.dependencies.prisma, this.dependencies.tenantContext),
      this.createAuditLogger(),
      new PrismaTransactionManager(this.dependencies.prisma),
    );
  }

  getListFilteredCompanyContactsUseCase(): ListFilteredCompanyContactsUseCase {
    return new GenericListFilteredUseCase(
      this.createCompanyContactRepository(),
      this.companyContactMapper,
      companyContactFilterConfig,
      { action: Action.COMPANY_CONTACT_LIST, ownerField: 'ownerId' },
    );
  }
}
