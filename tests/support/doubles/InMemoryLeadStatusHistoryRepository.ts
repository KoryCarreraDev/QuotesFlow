import { ILeadStatusHistoryRepository } from '@/application/ports/repositories/ILeadStatusHistoryRepository.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { LeadStatusChange } from '@/domain/entities/LeadStatusChange.js';

/** Doble en memoria de `ILeadStatusHistoryRepository`: como el de Prisma, solo ve el tenant actual. */
export class InMemoryLeadStatusHistoryRepository implements ILeadStatusHistoryRepository {
  private readonly changes: LeadStatusChange[] = [];

  constructor(private readonly tenantContext: ITenantContext) {}

  /** Todos los cambios guardados, de cualquier tenant. */
  listStored(): LeadStatusChange[] {
    return [...this.changes];
  }

  async create(change: LeadStatusChange): Promise<void> {
    this.changes.push(change);
  }

  async findByLead(leadId: string): Promise<LeadStatusChange[]> {
    const tenantId = this.tenantContext.getTenantId();
    return this.changes.filter((change) => change.leadId === leadId && change.tenantId === tenantId);
  }
}
