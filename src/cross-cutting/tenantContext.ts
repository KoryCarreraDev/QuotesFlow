import { AsyncLocalStorage } from 'async_hooks';
import { ITenantContext } from '../application/ports/services/ITenantContext.js';

//Almacenamiento por petición
const als = new AsyncLocalStorage<{ tenantId: string }>();

export class TenantContext implements ITenantContext {
    getTenantId(): string {
        const store = als.getStore();
        if (!store?.tenantId) {
            throw new Error('Contexto Tenant no valido')
        }
        return store.tenantId;
    }

    //Metodo para ejecutar un callback con un tenantId especifico
    static run(tenantId: string, fn: () => void): void{
        als.run({ tenantId }, fn);
    }
}