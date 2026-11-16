import { Lead } from '../../../domain/entities/Lead.js';
import { IFilterableRepository } from './IFilterableRepository.js';

/**
 * Persistencia de leads. Toda operación queda acotada al tenant de la sesión y a leads no borrados (R5).
 */
export interface ILeadRepository extends IFilterableRepository<Lead> {
  findByTenant(ownerUserId?: string | undefined): Promise<Lead[]>;
  create(lead: Lead): Promise<void>;
  findById(id: string): Promise<Lead | null>;
  /** Modifica los datos del lead. No cambia su estado: eso solo lo hace `updateStatus`. */
  update(leadId: string, data: Lead): Promise<void>;
  /** Cambia el estado del lead del tenant actual. Lo usa solo `ChangeLeadStatusUseCase`, que deja historial. */
  updateStatus(leadId: string, statusId: string): Promise<void>;
  delete(id: string): Promise<void>;
}
