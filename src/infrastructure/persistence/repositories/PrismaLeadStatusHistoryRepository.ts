import { ILeadStatusHistoryRepository } from '../../../application/ports/repositories/ILeadStatusHistoryRepository.js';
import { LeadStatusChange } from '../../../domain/entities/LeadStatusChange.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

export class PrismaLeadStatusHistoryRepository extends BasePrismaRepository implements ILeadStatusHistoryRepository {
  async create(change: LeadStatusChange): Promise<void> {
    await this.prisma.leadStatusHistory.create({
      data: {
        id: change.id,
        // El tenant sale de la sesión (R5), no del objeto recibido.
        tenantId: this.tenantId,
        leadId: change.leadId,
        oldStatusId: change.oldStatusId ?? null,
        newStatusId: change.newStatusId,
        changedById: change.changedById,
        note: change.note ?? null,
        changedAt: change.changedAt,
      },
    });
  }

  async findByLead(leadId: string): Promise<LeadStatusChange[]> {
    const records = await this.prisma.leadStatusHistory.findMany({
      where: { ...this.tenantWhere(), leadId },
      orderBy: { changedAt: 'asc' },
    });
    return records.map(
      (record) =>
        new LeadStatusChange(
          record.id,
          record.tenantId,
          record.leadId,
          record.oldStatusId ?? undefined,
          record.newStatusId,
          record.changedById,
          record.note ?? undefined,
          record.changedAt,
        ),
    );
  }
}
