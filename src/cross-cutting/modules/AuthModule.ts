import { LoginUseCase } from '../../application/use-case/auth/LoginUseCase.js';
import { RegisterCompanyAndOwnerUseCase } from '../../application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaLeadStatusConfigRepository } from '../../infrastructure/persistence/repositories/PrismaLeadStatusConfig.js';
import { PrismaTenantRepository } from '../../infrastructure/persistence/repositories/PrismaTenantRepository.js';
import { PrismaUserRepository } from '../../infrastructure/persistence/repositories/PrismaUserRepository.js';
import { BcryptHashService } from '../../infrastructure/services/BcryptHashService.js';
import { JwTokenService } from '../../infrastructure/services/JwtTokenService.js';
import { ModuleDependencies } from './ModuleDependencies.js';

/** Registro de empresas e inicio de sesión. */
export class AuthModule {
  private readonly hashService = new BcryptHashService();
  private readonly authTokenService = new JwTokenService();

  constructor(private readonly dependencies: ModuleDependencies) {}

  getRegisterCompanyUseCase(): RegisterCompanyAndOwnerUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new RegisterCompanyAndOwnerUseCase(
      new PrismaTenantRepository(prisma, tenantContext),
      new PrismaUserRepository(prisma, tenantContext),
      this.hashService,
      new PrismaLeadStatusConfigRepository(prisma, tenantContext),
      new PrismaTransactionManager(prisma),
    );
  }

  getLoginUseCase(): LoginUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new LoginUseCase(new PrismaUserRepository(prisma, tenantContext), this.hashService, this.authTokenService);
  }
}
