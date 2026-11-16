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
    );
  }

  getUpdateCompanyContactUseCase(): UpdateCompanyContactUseCase {
    return new UpdateCompanyContactUseCase(
      this.createCompanyContactRepository(),
      this.companyContactMapper,
      this.dependencies.tenantContext,
    );
  }

  getDeleteCompanyContactUseCase(): DeleteCompanyContactUseCase {
    return new DeleteCompanyContactUseCase(
      this.createCompanyContactRepository(),
      new PrismaContactRepository(this.dependencies.prisma, this.dependencies.tenantContext),
    );
  }

  getListFilteredCompanyContactsUseCase(): ListFilteredCompanyContactsUseCase {
    return new GenericListFilteredUseCase(
      this.createCompanyContactRepository(),
      this.companyContactMapper,
      companyContactFilterConfig,
    );
  }
}
