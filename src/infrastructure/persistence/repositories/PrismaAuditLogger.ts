import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuditEntry, IAuditLogger } from '../../../application/ports/services/IAuditLogger.js';
import { currentRequestContext } from '../../../cross-cutting/requestContext.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

/** Adaptador de `IAuditLogger` que escribe en la tabla `AuditLog` (usa la transacción abierta si la hay). */
export class PrismaAuditLogger extends BasePrismaRepository implements IAuditLogger {
  /** @throws {Error} Si no hay sesión ni actor público: un registro de auditoría siempre tiene autor. */
  async record(entry: AuditEntry): Promise<void> {
    const { userId, tenantId } = entry.publicActor ?? this.sessionActor();
    const requestId = currentRequestContext()?.requestId;

    await this.prisma.auditLog.create({
      data: {
        id: randomUUID(),
        tenantId,
        userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        // El id de petición enlaza el registro de auditoría con los logs técnicos de esa petición.
        metadata: { ...entry.metadata, requestId } as Prisma.InputJsonObject,
      },
    });
  }

  private sessionActor(): { userId: string; tenantId: string } {
    const userId = currentRequestContext()?.userId;
    if (!userId) throw new Error('Audit entry without an authenticated user');
    // El tenant sale del contexto de tenant (R5), igual que en el resto de repositorios.
    return { userId, tenantId: this.tenantId };
  }
}
