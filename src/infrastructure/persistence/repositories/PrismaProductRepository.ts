import type { Prisma } from '@prisma/client';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IProductRepository } from '@/application/ports/repositories/IProductRepository.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { Product } from '@/domain/entities/Product.js';
import { Money } from '@/domain/value-objects/money.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

type ProductRecord = Prisma.ProductGetPayload<object>;

/** Fila de `Product` a entidad. El precio se lee por su texto, nunca por `Number` (F3-T01). */
function toProduct(record: ProductRecord): Product {
  return Product.restore({
    id: record.id,
    tenantId: record.tenantId,
    name: record.name,
    description: record.description ?? undefined,
    basePrice: record.basePrice ? Money.fromDecimalStringRounded(record.basePrice.toFixed()) : undefined,
    formulaId: record.formulaId ?? undefined,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

/** Catálogo de productos sobre Prisma (F3-T02). Toda consulta lleva el tenant y excluye lo borrado (R5). */
export class PrismaProductRepository extends BasePrismaRepository implements IProductRepository {
  async create(product: Product): Promise<void> {
    await this.prisma.product.create({
      data: {
        id: product.id,
        tenantId: this.tenantId,
        name: product.name,
        description: product.description,
        basePrice: product.basePrice?.toDecimalString(),
        formulaId: product.formulaId,
        isActive: product.isActive,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
    });
  }

  async findById(productId: string): Promise<Product | null> {
    const record = await this.prisma.product.findFirst({ where: { id: productId, ...this.tenantWhere() } });
    return record ? toProduct(record) : null;
  }

  async update(product: Product): Promise<void> {
    await this.prisma.product.update({
      where: { id: product.id, ...this.tenantWhere() },
      data: {
        name: product.name,
        description: product.description ?? null,
        basePrice: product.basePrice?.toDecimalString() ?? null,
        formulaId: product.formulaId ?? null,
        isActive: product.isActive,
        updatedAt: product.updatedAt,
      },
    });
  }

  async delete(productId: string): Promise<void> {
    await this.softDeleteRegister(this.prisma.product, productId);
  }

  async formulaExists(formulaId: string): Promise<boolean> {
    const formula = await this.prisma.formula.findFirst({
      where: { id: formulaId, ...this.tenantWhere() },
      select: { id: true },
    });
    return formula !== null;
  }

  async findFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<Product[]> {
    const { skip, take } = this.buildPagination(criteria);
    const records = await this.prisma.product.findMany({
      where: this.buildFilterWhere(criteria, config),
      orderBy: this.buildOrderBy(criteria, config),
      skip,
      take,
    });
    return records.map(toProduct);
  }

  async countFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<number> {
    return this.prisma.product.count({ where: this.buildFilterWhere(criteria, config) });
  }
}
