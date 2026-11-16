import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';

export interface ILeadStatusConfigRepository {
  create(Status: LeadStatusConfig): Promise<void>;
  update(Statusid: string, data: LeadStatusConfig): Promise<void>;
  findAllByTenant(assignedTenant: string): Promise<LeadStatusConfig[]>;
  findById(id: string): Promise<LeadStatusConfig | null>;
  countLeadByStatus(statusId: string): Promise<number>;
  findDefaultByTenant(assignedTenant: string): Promise<LeadStatusConfig | null>;
  /**
   * Borrado suave. Libera su `order` (lo mueve a un valor negativo) para que otro estado pueda usarlo:
   * la restricción única `(tenantId, order)` incluye los estados borrados.
   */
  delete(statusId: string): Promise<void>;
  /** Asigna los órdenes 1..n en el orden de la lista. Debe ejecutarse dentro de una transacción. */
  reorder(statusIdsInOrder: string[]): Promise<void>;
}
