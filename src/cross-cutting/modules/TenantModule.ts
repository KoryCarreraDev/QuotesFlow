import {
  GetTenantLogoUseCase,
  RemoveTenantLogoUseCase,
  UploadTenantLogoUseCase,
} from '../../application/use-case/tenant/TenantLogoUseCases.js';
import {
  GetTenantProfileUseCase,
  UpdateTenantProfileUseCase,
} from '../../application/use-case/tenant/TenantProfileUseCases.js';
import { appLogger } from '../../infrastructure/logging/appLogger.js';
import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { PrismaTenantProfileRepository } from '../../infrastructure/persistence/repositories/PrismaTenantProfileRepository.js';
import { fileStorage } from '../sharedServices.js';
import { ModuleDependencies } from './ModuleDependencies.js';

/** Perfil y configuración de la empresa (F2-T06). */
export class TenantModule {
  constructor(private readonly dependencies: ModuleDependencies) {}

  private createProfileRepository(): PrismaTenantProfileRepository {
    return new PrismaTenantProfileRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  getGetTenantProfileUseCase(): GetTenantProfileUseCase {
    return new GetTenantProfileUseCase(this.createProfileRepository());
  }

  getUpdateTenantProfileUseCase(): UpdateTenantProfileUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new UpdateTenantProfileUseCase(
      this.createProfileRepository(),
      new PrismaTransactionManager(prisma),
      new PrismaAuditLogger(prisma, tenantContext),
    );
  }

  getUploadTenantLogoUseCase(): UploadTenantLogoUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new UploadTenantLogoUseCase(
      this.createProfileRepository(),
      fileStorage,
      tenantContext,
      new PrismaTransactionManager(prisma),
      new PrismaAuditLogger(prisma, tenantContext),
      appLogger,
    );
  }

  getRemoveTenantLogoUseCase(): RemoveTenantLogoUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new RemoveTenantLogoUseCase(
      this.createProfileRepository(),
      fileStorage,
      new PrismaTransactionManager(prisma),
      new PrismaAuditLogger(prisma, tenantContext),
      appLogger,
    );
  }

  getGetTenantLogoUseCase(): GetTenantLogoUseCase {
    return new GetTenantLogoUseCase(this.createProfileRepository(), fileStorage);
  }
}
