import { randomUUID } from 'node:crypto';
import { EmailLogEntry, IEmailLogRepository } from '../../../application/ports/repositories/IEmailLogRepository.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

/**
 * Adaptador de `IEmailLogRepository` sobre la tabla `EmailLog`. El tenant llega en la entrada y no del contexto:
 * el registro y la recuperación de contraseña envían correos sin sesión.
 */
export class PrismaEmailLogRepository extends BasePrismaRepository implements IEmailLogRepository {
  async record(entry: EmailLogEntry): Promise<void> {
    await this.prisma.emailLog.create({
      data: {
        id: randomUUID(),
        tenantId: entry.tenantId,
        userId: entry.userId,
        template: entry.template,
        recipient: entry.recipient,
        status: entry.status,
        providerMessageId: entry.providerMessageId,
        failureReason: entry.failureReason,
      },
    });
  }
}
