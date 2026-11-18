import {
  GetTenantLogoUseCase,
  RemoveTenantLogoUseCase,
  UploadTenantLogoUseCase,
} from '../../application/use-case/tenant/TenantLogoUseCases.js';
import {
  GetTenantProfileUseCase,
  UpdateTenantProfileUseCase,
} from '../../application/use-case/tenant/TenantProfileUseCases.js';
import { env } from '../../config/env.js';
import { appLogger } from '../../infrastructure/logging/appLogger.js';
import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { PrismaTenantProfileRepository } from '../../infrastructure/persistence/repositories/PrismaTenantProfileRepository.js';
import { LocalDiskFileStorage } from '../../infrastructure/services/LocalDiskFileStorage.js';
import { ModuleDependencies } from './ModuleDependencies.js';

// Q-017: en desarrollo los logos van a disco; un adaptador compatible con S3 lo reemplazará al desplegar.
const fileStorage = new LocalDiskFileStorage(env.FILE_STORAGE_DIRECTORY);

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
