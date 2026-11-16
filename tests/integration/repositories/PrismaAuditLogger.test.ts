import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { AuditAction, AuditEntity } from '@/application/ports/services/IAuditLogger.js';
import { runWithRequestContext } from '@/cross-cutting/requestContext.js';
import { PrismaTransactionManager } from '@/infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaAuditLogger } from '@/infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { type TenantWithTeam, persistTenantWithTeam } from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

const entry = { action: AuditAction.LEAD_CREATED, entity: AuditEntity.LEAD, entityId: 'lead-1' };

describe('PrismaAuditLogger', () => {
  let company: TenantWithTeam;
  let otherCompany: TenantWithTeam;
  let auditLogger: PrismaAuditLogger;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    auditLogger = new PrismaAuditLogger(prisma, new FixedTenantContext(company.tenant.id));
  });

  it('toma el autor del contexto de la petición y la empresa del contexto de tenant', async () => {
    await runWithRequestContext({ requestId: 'request-0001', userId: company.salesRep.id }, () =>
      auditLogger.record(entry),
    );

    await expect(prisma.auditLog.findMany()).resolves.toEqual([
      expect.objectContaining({
        tenantId: company.tenant.id,
        userId: company.salesRep.id,
        action: 'LEAD_CREATED',
        entity: 'Lead',
        entityId: 'lead-1',
        metadata: { requestId: 'request-0001' },
      }),
    ]);
  });

  it('la empresa de la sesión manda aunque el contexto de la petición diga otra', async () => {
    await runWithRequestContext(
      { requestId: 'request-0002', userId: company.owner.id, tenantId: otherCompany.tenant.id },
      () => auditLogger.record(entry),
    );

    const [stored] = await prisma.auditLog.findMany();
    expect(stored.tenantId).toBe(company.tenant.id);
  });

  it('en rutas públicas usa el actor indicado (registro, login)', async () => {
    await runWithRequestContext({ requestId: 'request-0003' }, () =>
      auditLogger.record({
        ...entry,
        publicActor: { userId: otherCompany.owner.id, tenantId: otherCompany.tenant.id },
      }),
    );

    const [stored] = await prisma.auditLog.findMany();
    expect(stored).toMatchObject({ userId: otherCompany.owner.id, tenantId: otherCompany.tenant.id });
  });

  it('sin usuario en la petición ni actor público se niega a escribir un registro sin autor', async () => {
    await expect(runWithRequestContext({ requestId: 'request-0004' }, () => auditLogger.record(entry))).rejects.toThrow(
      'Audit entry without an authenticated user',
    );
    await expect(prisma.auditLog.count()).resolves.toBe(0);
  });

  it('dentro de una transacción que se revierte, el registro de auditoría también se revierte', async () => {
    const transactionManager = new PrismaTransactionManager(prisma);

    await expect(
      runWithRequestContext({ requestId: 'request-0005', userId: company.owner.id }, () =>
        transactionManager.runInTransaction(async () => {
          await auditLogger.record(entry);
          throw new Error('operation failed after auditing');
        }),
      ),
    ).rejects.toThrow('operation failed after auditing');

    await expect(prisma.auditLog.count()).resolves.toBe(0);
  });
});
