import { PrismaClient } from "@prisma/client";
import { ITenantContext } from "../../../application/ports/services/ITenantContext.js";
import { FilterCriteriaDTO } from "@/application/dtos/FilterCriteriaDTO.js";
import { IFilterFieldConfig } from "../../../application/ports/services/IFilterFieldConfig.js";

export abstract class BasePrismaRepository {

    constructor (
        protected readonly prisma: PrismaClient,
        protected readonly tenantContext: ITenantContext
    ) {}

    //Obtiene el tenantId actual obteiniendolo del contexto
    //Siendo funcional para construir filtros
    protected get tenantId(): string {
        return this.tenantContext.getTenantId();
    }

    //Genera un filtro (Where) con el tenantID
    //para usasrse en cualquier consulta con el campo tenantId
    protected tenantWhere(): { tenantId: string } {
        return { tenantId: this.tenantId };
    }

    //Helper para añadir el filtro a un objeto where ya existente
    protected withTenant<T extends Record<string, unknown>>(
        additionalWhere: T
    ): T & { tenantId: string } {
        return { ...additionalWhere, tenantId: this.tenantId };
    }

    //Verifica que un registro pertenece al tenant actual.
    //Si no es asi, lanza un error.
    protected validateTenant(record: { tenantId?: string }): void {
        if (record.tenantId !== this.tenantId) {
            throw new Error('Acceso denegado: el registro no pertenece al tenant actual');
        }
    }

    //Construye la condicion where de prisma a partir de criterios genericos
    //Siempre incluye el filtro de tenant actual    
    protected buildFilterWhere(
        criteria: FilterCriteriaDTO,
        config: IFilterFieldConfig,
    ): Record<string, unknown> {
        //Inicializa el array de condiciones
        let conditions: Array<Record<string, unknown>> = [];

        //Añade el tenantId
        conditions.push({ tenantId: this.tenantId });

        //Filtros especificos
        for (const filter of criteria.filters ?? []) {
            const fieldConfig = config[filter.field];
            if (!fieldConfig) {
                throw new Error(`Campo no permitido para el filtro: ${filter.field}`)
            }
            if (!fieldConfig.allowedOperators.includes(filter.operator)) {
                throw new Error(`Operador no permitido para el campo ${filter.field}: ${filter.operator}`)
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
                condition[filter.field] = { equals: filter.value }
            } else if (filter.operator === 'gt') {
                condition[filter.field] = { gt: filter.value }
            } else if (filter.operator === 'gte') {
                condition[filter.field] = { gte: filter.value }
            } else if (filter.operator === 'lt') {
                condition[filter.field] = { lt: filter.value }
            } else if (filter.operator === 'lte') {
                condition[filter.field] = { lte: filter.value }
            }
            conditions.push(condition);
        }

        //Busqueda global
        if (criteria.search) {
            const searchableFields = Object.entries(config)
            .filter(([, cfg]) => cfg.searchable)
            .map(([fieldName]) => fieldName);

            if(searchableFields.length > 0) {
                const orConditions = searchableFields.map((fieldName) => ({
                    [fieldName]: {
                        contains: criteria.search,
                        mode: 'insensitive'
                    }
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

    //Calcula la paginación con valores seguros por defecto
    protected buildPagination(criteria: FilterCriteriaDTO): { skip: number; take: number;} {
        const page = criteria.page && criteria.page > 0 ? criteria.page: 1;
        const limit = criteria.limit && criteria.limit > 0 && criteria.limit <= 100 ? criteria.limit : 20;

        return {
            skip: (page -1) * limit,
            take: limit,
        };
    }
}