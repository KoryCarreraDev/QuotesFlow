import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';

/**
 * Persistencia de los estados de lead configurables por empresa, acotada al tenant de la sesión (R5).
 */
export interface ILeadStatusConfigRepository {
  create(status: LeadStatusConfig): Promise<void>;
  update(statusId: string, data: LeadStatusConfig): Promise<void>;
  findAllByTenant(tenantId: string): Promise<LeadStatusConfig[]>;
  findById(id: string): Promise<LeadStatusConfig | null>;
  countLeadByStatus(statusId: string): Promise<number>;
  findDefaultByTenant(tenantId: string): Promise<LeadStatusConfig | null>;
  /**
   * Borrado suave. Libera su `order` (lo mueve a un valor negativo) para que otro estado pueda usarlo:
   * la restricción única `(tenantId, order)` incluye los estados borrados.
   */
  delete(statusId: string): Promise<void>;
  /** Asigna los órdenes 1..n en el orden de la lista. Debe ejecutarse dentro de una transacción. */
  reorder(statusIdsInOrder: string[]): Promise<void>;
}
