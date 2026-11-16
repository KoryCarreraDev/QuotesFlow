import { ILeadStatusConfigRepository } from '@/application/ports/repositories/ILeadStatusConfigRepository.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';

const NO_LEADS = 0;
const ORDER_WHEN_MISSING = 0;

/**
 * Doble en memoria de `ILeadStatusConfigRepository`.
 * Respeta las reglas de `PrismaLeadStatusConfigRepository`: tenant actual y estados no borrados.
 */
export class InMemoryLeadStatusConfigRepository implements ILeadStatusConfigRepository {
  private readonly statusesById = new Map<string, LeadStatusConfig>();
  private readonly leadCountByStatusId = new Map<string, number>();

  constructor(private readonly tenantContext: ITenantContext) {}

  /** Carga datos iniciales sin pasar por ningún caso de uso. */
  seed(...statuses: LeadStatusConfig[]): void {
    for (const status of statuses) {
      this.statusesById.set(status.id, status);
    }
  }

  /** Define cuántos leads usan un estado, para `countLeadByStatus`. */
  setLeadCount(statusId: string, leadCount: number): void {
    this.leadCountByStatusId.set(statusId, leadCount);
  }

  /** Devuelve el registro tal como está guardado, sin filtrar por tenant ni por borrado. */
  findStoredById(id: string): LeadStatusConfig | undefined {
    return this.statusesById.get(id);
  }

  /** Todos los registros guardados, de cualquier tenant y estado. */
  listStored(): LeadStatusConfig[] {
    return [...this.statusesById.values()];
  }

  async create(status: LeadStatusConfig): Promise<void> {
    this.statusesById.set(status.id, status);
  }

  async update(statusId: string, data: LeadStatusConfig): Promise<void> {
    const storedStatus = this.statusesById.get(statusId);
    if (!storedStatus || storedStatus.tenantId !== this.tenantContext.getTenantId()) {
      throw new Error('Record to update not found');
    }

    this.statusesById.set(
      statusId,
      new LeadStatusConfig(
        storedStatus.id,
        data.name ?? storedStatus.name,
        data.order ?? storedStatus.order,
        data.isDefault ?? storedStatus.isDefault,
        data.updatedAt ?? storedStatus.updatedAt,
        data.createdAt ?? storedStatus.createdAt,
        data.color ?? storedStatus.color,
        storedStatus.tenantId,
        storedStatus.deleted,
        data.type ?? storedStatus.type,
      ),
    );
  }

  async delete(statusId: string): Promise<void> {
    const storedStatus = this.statusesById.get(statusId);
    if (!storedStatus || storedStatus.tenantId !== this.tenantContext.getTenantId()) {
      throw new Error('Record to delete not found');
    }
    const tenantOrders = this.listStored()
      .filter((status) => status.tenantId === storedStatus.tenantId)
      .map((status) => status.order ?? ORDER_WHEN_MISSING);
    const freedOrder = Math.min(...tenantOrders, ORDER_WHEN_MISSING) - 1;
    this.statusesById.set(statusId, this.copyWith(storedStatus, { order: freedOrder, deleted: DeletedState.INACTIVE }));
  }

  async reorder(statusIdsInOrder: string[]): Promise<void> {
    statusIdsInOrder.forEach((statusId, index) => {
      const storedStatus = this.statusesById.get(statusId);
      if (!storedStatus) throw new Error('Record to update not found');
      this.statusesById.set(statusId, this.copyWith(storedStatus, { order: index + 1 }));
    });
  }

  private copyWith(status: LeadStatusConfig, changes: { order?: number; deleted?: DeletedState }): LeadStatusConfig {
    return new LeadStatusConfig(
      status.id,
      status.name,
      changes.order ?? status.order,
      status.isDefault,
      status.updatedAt,
      status.createdAt,
      status.color,
      status.tenantId,
      changes.deleted ?? status.deleted,
      status.type,
    );
  }

  async findAllByTenant(assignedTenant: string): Promise<LeadStatusConfig[]> {
    return this.listStored()
      .filter((status) => status.tenantId === assignedTenant && this.isNotDeleted(status))
      .sort((first, second) => (first.order ?? ORDER_WHEN_MISSING) - (second.order ?? ORDER_WHEN_MISSING));
  }

  async findById(id: string): Promise<LeadStatusConfig | null> {
    const status = this.statusesById.get(id);
    const isVisible =
      status !== undefined && status.tenantId === this.tenantContext.getTenantId() && this.isNotDeleted(status);
    return isVisible ? status : null;
  }

  async countLeadByStatus(statusId: string): Promise<number> {
    return this.leadCountByStatusId.get(statusId) ?? NO_LEADS;
  }

  async findDefaultByTenant(assignedTenant: string): Promise<LeadStatusConfig | null> {
    const defaultStatus = this.listStored().find(
      (status) => status.tenantId === assignedTenant && this.isNotDeleted(status) && status.isDefault === true,
    );
    return defaultStatus ?? null;
  }

  private isNotDeleted(status: LeadStatusConfig): boolean {
    return status.deleted !== DeletedState.INACTIVE;
  }
}
