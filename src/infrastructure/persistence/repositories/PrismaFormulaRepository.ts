import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IFormulaRepository } from '@/application/ports/repositories/IFormulaRepository.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { Formula } from '@/domain/entities/Formula.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

type FormulaRecord = Prisma.FormulaGetPayload<object>;

// `variables` es una columna JSON: se valida al leerla en lugar de confiar en su forma.
const storedVariablesSchema = z.array(z.object({ name: z.string(), label: z.string() }));

function toFormula(record: FormulaRecord): Formula {
  return Formula.restore({
    id: record.id,
    tenantId: record.tenantId,
    createdById: record.createdById,
    name: record.name,
    expression: record.expression,
    variables: storedVariablesSchema.parse(record.variables),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function storedVariablesOf(formula: Formula): Prisma.InputJsonValue {
  return formula.variables.map((variable) => ({ name: variable.name, label: variable.label }));
}

/** Fórmulas de precio sobre Prisma (F3-T04). Toda consulta lleva el tenant y excluye lo borrado (R5). */
export class PrismaFormulaRepository extends BasePrismaRepository implements IFormulaRepository {
  async create(formula: Formula): Promise<void> {
    await this.prisma.formula.create({
      data: {
        id: formula.id,
        tenantId: this.tenantId,
        createdById: formula.createdById,
        name: formula.name,
        expression: formula.expression,
        variables: storedVariablesOf(formula),
        createdAt: formula.createdAt,
        updatedAt: formula.updatedAt,
      },
    });
  }

  async findById(formulaId: string): Promise<Formula | null> {
    const record = await this.prisma.formula.findFirst({ where: { id: formulaId, ...this.tenantWhere() } });
    return record ? toFormula(record) : null;
  }

  async update(formula: Formula): Promise<void> {
    await this.prisma.formula.update({
      where: { id: formula.id, ...this.tenantWhere() },
      data: {
        name: formula.name,
        expression: formula.expression,
        variables: storedVariablesOf(formula),
        updatedAt: formula.updatedAt,
      },
    });
  }

  async delete(formulaId: string): Promise<void> {
    await this.softDeleteRegister(this.prisma.formula, formulaId);
  }

  async lockForDeletion(formulaId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Formula"
      WHERE "id" = ${formulaId} AND "tenantId" = ${this.tenantId} AND "deleted" = 'INUSE'::"DeletedState"
      FOR UPDATE`;
    return rows.length === 1;
  }

  async isUsedByProducts(formulaId: string): Promise<boolean> {
    const product = await this.prisma.product.findFirst({
      where: { formulaId, ...this.tenantWhere() },
      select: { id: true },
    });
    return product !== null;
  }

  async findFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<Formula[]> {
    const { skip, take } = this.buildPagination(criteria);
    const records = await this.prisma.formula.findMany({
      where: this.buildFilterWhere(criteria, config),
      orderBy: this.buildOrderBy(criteria, config),
      skip,
      take,
    });
    return records.map(toFormula);
  }

  async countFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<number> {
    return this.prisma.formula.count({ where: this.buildFilterWhere(criteria, config) });
  }
}
