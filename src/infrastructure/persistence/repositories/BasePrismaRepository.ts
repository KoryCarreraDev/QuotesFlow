import { PrismaClient } from "@prisma/client";
import { ITenantContext } from "../../../application/ports/services/ITenantContext.js";

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
}