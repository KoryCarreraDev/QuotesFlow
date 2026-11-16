import { setTimeout as waitFor } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { TenantContext } from '@/cross-cutting/tenantContext.js';

const SHORT_DELAY_MS = 5;
const LONG_DELAY_MS = 20;

describe('TenantContext', () => {
  it('devuelve el tenant con el que se abrió el contexto', () => {
    let tenantIdSeenInside: string | undefined;

    TenantContext.run('tenant-a', () => {
      tenantIdSeenInside = new TenantContext().getTenantId();
    });

    expect(tenantIdSeenInside).toBe('tenant-a');
  });

  it('lanza error si se consulta fuera de un contexto: nunca hay un tenant por defecto', () => {
    expect(() => new TenantContext().getTenantId()).toThrow();
  });

  it('conserva el tenant a través de operaciones asíncronas', async () => {
    let pendingTenantId: Promise<string> | undefined;

    TenantContext.run('tenant-a', () => {
      pendingTenantId = waitFor(SHORT_DELAY_MS).then(() => new TenantContext().getTenantId());
    });

    await expect(pendingTenantId).resolves.toBe('tenant-a');
  });

  it('no mezcla los tenants de dos peticiones que se ejecutan a la vez', async () => {
    const pendingTenantIds: Array<Promise<string>> = [];

    TenantContext.run('tenant-a', () => {
      pendingTenantIds.push(waitFor(LONG_DELAY_MS).then(() => new TenantContext().getTenantId()));
    });
    TenantContext.run('tenant-b', () => {
      pendingTenantIds.push(waitFor(SHORT_DELAY_MS).then(() => new TenantContext().getTenantId()));
    });

    await expect(Promise.all(pendingTenantIds)).resolves.toEqual(['tenant-a', 'tenant-b']);
  });
});
