import {
  CreateProductUseCase,
  DeleteProductUseCase,
  ListProductsUseCase,
  UpdateProductUseCase,
} from '../../application/use-case/products/ProductUseCases.js';
import { productFilterConfig } from '../../infrastructure/persistence/filters/productFilterConfig.js';
import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { PrismaProductRepository } from '../../infrastructure/persistence/repositories/PrismaProductRepository.js';
import { ModuleDependencies } from './ModuleDependencies.js';

/** Catálogo de productos (F3-T02). */
export class ProductModule {
  constructor(private readonly dependencies: ModuleDependencies) {}

  private createRepository(): PrismaProductRepository {
    return new PrismaProductRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private writeDependencies() {
    const { prisma, tenantContext } = this.dependencies;
    return [new PrismaTransactionManager(prisma), new PrismaAuditLogger(prisma, tenantContext)] as const;
  }

  getListProductsUseCase(): ListProductsUseCase {
    return new ListProductsUseCase(this.createRepository(), productFilterConfig);
  }

  getCreateProductUseCase(): CreateProductUseCase {
    return new CreateProductUseCase(
      this.createRepository(),
      this.dependencies.tenantContext,
      ...this.writeDependencies(),
    );
  }

  getUpdateProductUseCase(): UpdateProductUseCase {
    return new UpdateProductUseCase(this.createRepository(), ...this.writeDependencies());
  }

  getDeleteProductUseCase(): DeleteProductUseCase {
    return new DeleteProductUseCase(this.createRepository(), ...this.writeDependencies());
  }
}
