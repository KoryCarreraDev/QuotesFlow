import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IProductRepository } from '@/application/ports/repositories/IProductRepository.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Product } from '@/domain/entities/Product.js';
import { paginateInMemory } from './inMemoryPagination.js';

/**
 * Doble en memoria de `IProductRepository`. Solo ve productos del tenant actual y no borrados.
 * `findFiltered` no interpreta los filtros (eso se prueba contra PostgreSQL); solo pagina.
 */
export class InMemoryProductRepository implements IProductRepository {
  private readonly productsById = new Map<string, Product>();
  private readonly deletedProductIds = new Set<string>();
  /** Fórmulas que existen en el tenant actual (las de otros tenants no se registran). */
  readonly existingFormulaIds = new Set<string>();

  constructor(private readonly tenantContext: ITenantContext) {}

  seed(...products: Product[]): void {
    for (const product of products) this.productsById.set(product.id, product);
  }

  /** Registro guardado tal cual, sin filtrar por tenant ni borrado. */
  findStoredById(productId: string): Product | undefined {
    return this.productsById.get(productId);
  }

  isDeleted(productId: string): boolean {
    return this.deletedProductIds.has(productId);
  }

  private visibleProducts(): Product[] {
    return [...this.productsById.values()].filter(
      (product) => product.tenantId === this.tenantContext.getTenantId() && !this.deletedProductIds.has(product.id),
    );
  }

  async create(product: Product): Promise<void> {
    this.productsById.set(product.id, product);
  }

  async findById(productId: string): Promise<Product | null> {
    return this.visibleProducts().find((product) => product.id === productId) ?? null;
  }

  async update(product: Product): Promise<void> {
    this.productsById.set(product.id, product);
  }

  async delete(productId: string): Promise<void> {
    this.deletedProductIds.add(productId);
  }

  async formulaExists(formulaId: string): Promise<boolean> {
    return this.existingFormulaIds.has(formulaId);
  }

  async findFiltered(criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<Product[]> {
    return paginateInMemory(this.visibleProducts(), criteria);
  }

  async countFiltered(_criteria: FilterCriteriaDTO, _config: IFilterFieldConfig): Promise<number> {
    return this.visibleProducts().length;
  }
}
