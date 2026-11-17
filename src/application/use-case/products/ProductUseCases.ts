import { CreateProductDTO, ProductDTO, UpdateProductDTO } from '@/application/dtos/ProductDTOs.js';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { PaginatedResult } from '@/application/dtos/PaginatedResultDTO.js';
import { ProductMapper } from '@/application/mappers/ProductMapper.js';
import { IProductRepository } from '@/application/ports/repositories/IProductRepository.js';
import {
  AuditAction,
  AuditEntity,
  IAuditLogger,
  changedFieldNames,
} from '@/application/ports/services/IAuditLogger.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { Action, Actor, can } from '@/application/policies/authorizationPolicy.js';
import { GenericListFilteredUseCase } from '@/application/use-case/filter/GenericListFilteredUseCase.js';
import { Product, ProductChanges } from '@/domain/entities/Product.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { Money } from '@/domain/value-objects/money.js';

// F3-T02: catálogo de productos. Lo consulta todo el equipo para cotizar; lo gestionan dueño, socio y líder.

const productMapper = new ProductMapper();

function assertAllowed(actor: Actor, action: Action): void {
  if (!can(actor, action)) throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
}

function productNotFound(): NotFoundError {
  return new NotFoundError(ErrorCode.PRODUCT_NOT_FOUND, 'Product not found');
}

/** Comprueba que la fórmula indicada es de la empresa y no está borrada. */
async function assertFormulaBelongsToTenant(repository: IProductRepository, formulaId: string | null | undefined) {
  if (typeof formulaId !== 'string') return;
  if (!(await repository.formulaExists(formulaId))) {
    throw new ValidationError(ErrorCode.INVALID_PRODUCT_FORMULA, 'Formula does not exist in this company');
  }
}

function moneyOrNullFrom(text: string | null | undefined): Money | null | undefined {
  return typeof text === 'string' ? Money.fromDecimalString(text) : text;
}

/** Busca, filtra, ordena y pagina el catálogo. Lo ve todo el equipo. */
export class ListProductsUseCase {
  private readonly listFiltered: GenericListFilteredUseCase<Product, ProductDTO>;

  constructor(repository: IProductRepository, filterConfig: IFilterFieldConfig) {
    this.listFiltered = new GenericListFilteredUseCase(repository, productMapper, filterConfig);
  }

  async execute(actor: Actor, criteria: FilterCriteriaDTO): Promise<PaginatedResult<ProductDTO>> {
    assertAllowed(actor, Action.PRODUCT_LIST);
    return this.listFiltered.execute(criteria);
  }
}

/**
 * Crea un producto. Necesita precio fijo, fórmula de la empresa o ambos.
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {ValidationError} `PRODUCT_PRICE_REQUIRED`, `INVALID_PRODUCT_FORMULA`.
 */
export class CreateProductUseCase {
  constructor(
    private readonly repository: IProductRepository,
    private readonly tenantContext: ITenantContext,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, input: CreateProductDTO): Promise<ProductDTO> {
    assertAllowed(actor, Action.PRODUCT_CREATE);
    const product = Product.create(this.tenantContext.getTenantId(), {
      name: input.name,
      description: input.description,
      basePrice: input.basePrice === undefined ? undefined : Money.fromDecimalString(input.basePrice),
      formulaId: input.formulaId,
      isActive: input.isActive ?? true,
    });
    await assertFormulaBelongsToTenant(this.repository, product.formulaId);

    await this.transactionManager.runInTransaction(async () => {
      await this.repository.create(product);
      await this.auditLogger.record({
        action: AuditAction.PRODUCT_CREATED,
        entity: AuditEntity.PRODUCT,
        entityId: product.id,
      });
    });
    return productMapper.toDTO(product);
  }
}

/**
 * Modifica parte de un producto. El resultado tiene que seguir teniendo precio fijo o fórmula.
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {NotFoundError} `PRODUCT_NOT_FOUND` (también si es de otra empresa).
 * @throws {ValidationError} `PRODUCT_PRICE_REQUIRED`, `INVALID_PRODUCT_FORMULA`.
 */
export class UpdateProductUseCase {
  constructor(
    private readonly repository: IProductRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, productId: string, input: UpdateProductDTO): Promise<ProductDTO> {
    assertAllowed(actor, Action.PRODUCT_UPDATE);
    const storedProduct = await this.repository.findById(productId);
    if (!storedProduct) throw productNotFound();

    const changes: ProductChanges = { ...input, basePrice: moneyOrNullFrom(input.basePrice) };
    const updatedProduct = storedProduct.withChanges(changes);
    await assertFormulaBelongsToTenant(this.repository, input.formulaId);

    await this.transactionManager.runInTransaction(async () => {
      await this.repository.update(updatedProduct);
      await this.auditLogger.record({
        action: AuditAction.PRODUCT_UPDATED,
        entity: AuditEntity.PRODUCT,
        entityId: productId,
        metadata: { changedFields: changedFieldNames(input) },
      });
    });
    return productMapper.toDTO(updatedProduct);
  }
}

/**
 * Borra (suave) un producto. Las cotizaciones que ya lo usan no cambian: guardan su propia copia del ítem.
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {NotFoundError} `PRODUCT_NOT_FOUND` (también si es de otra empresa).
 */
export class DeleteProductUseCase {
  constructor(
    private readonly repository: IProductRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, productId: string): Promise<void> {
    assertAllowed(actor, Action.PRODUCT_DELETE);
    if (!(await this.repository.findById(productId))) throw productNotFound();

    await this.transactionManager.runInTransaction(async () => {
      await this.repository.delete(productId);
      await this.auditLogger.record({
        action: AuditAction.PRODUCT_DELETED,
        entity: AuditEntity.PRODUCT,
        entityId: productId,
      });
    });
  }
}
