import { DeletedState as StoredDeletedState } from '@prisma/client';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { PrismaClient } from '@prisma/client';
import { type PrismaDatabaseClient, currentTransactionClient } from '../prisma/PrismaTransactionManager.js';
import { ITenantContext } from '../../../application/ports/services/ITenantContext.js';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IFilterFieldConfig } from '../../../application/ports/services/IFilterFieldConfig.js';

const DEFAULT_PAGE_SIZE = 20;
const MAXIMUM_PAGE_SIZE = 100;

/** Lo que necesita el borrado suave genérico de un delegado de Prisma (`prisma.lead`, `prisma.contact`…). */
interface SoftDeletableDelegate {
  update(arguments_: {
    where: { id: string; tenantId: string };
    data: { deleted: typeof StoredDeletedState.DELETED; updatedAt: Date };
  }): Promise<unknown>;
}

export abstract class BasePrismaRepository {
  constructor(
    private readonly rootClient: PrismaClient,
    protected readonly tenantContext: ITenantContext,
  ) {}

  /** Cliente para las consultas: el de la transacción abierta (`ITransactionManager`) o el raíz. */
  protected get prisma(): PrismaDatabaseClient {
    return currentTransactionClient() ?? this.rootClient;
  }

  //Obtiene el tenantId actual obteiniendolo del contexto
  //Siendo funcional para construir filtros
  protected get tenantId(): string {
    return this.tenantContext.getTenantId();
  }

  //Genera un filtro (Where) con el tenantID
  //para usasrse en cualquier consulta con el campo tenantId
  protected tenantWhere(): { tenantId: string; deleted: typeof StoredDeletedState.INUSE } {
    return { tenantId: this.tenantId, deleted: StoredDeletedState.INUSE };
  }

  //Helper para añadir el filtro a un objeto where ya existente
  protected withTenant<T extends Record<string, unknown>>(additionalWhere: T): T & { tenantId: string } {
    return { ...additionalWhere, tenantId: this.tenantId };
  }

  //Verifica que un registro pertenece al tenant actual.
  //Si no es asi, lanza un error.
  protected validateTenant(record: { tenantId?: string }): void {
    if (record.tenantId !== this.tenantId) {
      throw new NotFoundError(ErrorCode.RECORD_NOT_FOUND, 'Record not found');
    }
  }

  //Construye la condicion where de prisma a partir de criterios genericos
  //Siempre incluye el filtro de tenant actual
  protected buildFilterWhere(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Record<string, unknown> {
    //Inicializa el array de condiciones
    const conditions: Array<Record<string, unknown>> = [];

    //Añade el tenantId
    conditions.push({ tenantId: this.tenantId });
    //Añade el deleted en INUSE
    conditions.push({ deleted: StoredDeletedState.INUSE });

    //Filtros especificos
    for (const filter of criteria.filters ?? []) {
      const fieldConfig = config[filter.field];
      if (!fieldConfig) {
        throw new ValidationError(
          ErrorCode.FILTER_FIELD_NOT_ALLOWED,
          `Field is not allowed in filters: ${filter.field}`,
        );
      }
      if (!fieldConfig.allowedOperators.includes(filter.operator)) {
        throw new ValidationError(
          ErrorCode.FILTER_OPERATOR_NOT_ALLOWED,
          `Operator ${filter.operator} is not allowed for field ${filter.field}`,
        );
      }

      const condition: Record<string, unknown> = {};
      if (filter.operator === 'contains') {
        condition[filter.field] = {
          contains: filter.value,
          mode: 'insensitive',
        };
      } else if (filter.operator === 'in') {
        condition[filter.field] = { in: filter.value };
      } else if (filter.operator === 'equals') {
        condition[filter.field] = { equals: filter.value };
      } else if (filter.operator === 'gt') {
        condition[filter.field] = { gt: filter.value };
      } else if (filter.operator === 'gte') {
        condition[filter.field] = { gte: filter.value };
      } else if (filter.operator === 'lt') {
        condition[filter.field] = { lt: filter.value };
      } else if (filter.operator === 'lte') {
        condition[filter.field] = { lte: filter.value };
      }
      conditions.push(condition);
    }

    //Busqueda global
    if (criteria.search) {
      const searchableFields = Object.entries(config)
        .filter(([, cfg]) => cfg.searchable)
        .map(([fieldName]) => fieldName);

      if (searchableFields.length > 0) {
        const orConditions = searchableFields.map((fieldName) => ({
          [fieldName]: {
            contains: criteria.search,
            mode: 'insensitive',
          },
        }));
        conditions.push({ OR: orConditions });
      }
    }

    //Combinar condiciones
    if (conditions.length === 1) {
      return conditions[0];
    }
    return { AND: conditions };
  }

  /**
   * Orden de un listado filtrado. Sin `sortBy`, los más recientes primero; el id desempata para que la
   * paginación no repita ni salte registros. El campo se vuelve a comprobar contra la lista blanca.
   */
  protected buildOrderBy(
    criteria: FilterCriteriaDTO,
    config: IFilterFieldConfig,
  ): Array<Record<string, 'asc' | 'desc'>> {
    const direction = criteria.sortDir ?? 'desc';
    if (!criteria.sortBy) return [{ createdAt: direction }, { id: 'asc' }];

    const fieldConfig = new Map(Object.entries(config)).get(criteria.sortBy);
    if (!fieldConfig?.sortable) {
      throw new ValidationError(
        ErrorCode.SORT_FIELD_NOT_ALLOWED,
        `Field is not allowed for sorting: ${criteria.sortBy}`,
      );
    }
    return [{ [criteria.sortBy]: direction }, { id: 'asc' }];
  }

  //Calcula la paginación con valores seguros por defecto
  protected buildPagination(criteria: FilterCriteriaDTO): { skip: number; take: number } {
    const page = criteria.page && criteria.page > 0 ? criteria.page : 1;
    const limit =
      criteria.limit && criteria.limit > 0 && criteria.limit <= MAXIMUM_PAGE_SIZE ? criteria.limit : DEFAULT_PAGE_SIZE;

    return {
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  //Softdelete generico
  protected async softDeleteRegister(model: SoftDeletableDelegate, id: string): Promise<void> {
    if (!id) throw new Error('Id is required');

    await model.update({
      where: { id, tenantId: this.tenantId },
      data: { deleted: StoredDeletedState.DELETED, updatedAt: new Date() },
    });
  }
}
