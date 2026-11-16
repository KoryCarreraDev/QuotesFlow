import { ITenantContext } from '@/application/ports/services/ITenantContext.js';

/** Contexto de tenant con un valor fijo. Reemplaza al `TenantContext` real (AsyncLocalStorage) en los tests. */
export class FixedTenantContext implements ITenantContext {
  constructor(private readonly tenantId: string) {}

  getTenantId(): string {
    return this.tenantId;
  }
}
