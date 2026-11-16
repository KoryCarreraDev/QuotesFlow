import { AsyncLocalStorage } from 'async_hooks';
import { ITenantContext } from '../application/ports/services/ITenantContext.js';

//Almacenamiento por petición
const tenantStorage = new AsyncLocalStorage<{ tenantId: string }>();

export class TenantContext implements ITenantContext {
  getTenantId(): string {
    const store = tenantStorage.getStore();
    if (!store?.tenantId) {
      throw new Error('Tenant context is not available');
    }
    return store.tenantId;
  }

  //Metodo para ejecutar un callback con un tenantId especifico
  static run(tenantId: string, fn: () => void): void {
    tenantStorage.run({ tenantId }, fn);
  }
}
