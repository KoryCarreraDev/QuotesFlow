import { LeadStatusChange } from '../../../domain/entities/LeadStatusChange.js';

/** Historial de cambios de estado de los leads, acotado al tenant de la sesión. */
export interface ILeadStatusHistoryRepository {
  /** Guarda un cambio. El tenant que se guarda es siempre el de la sesión, no el que diga el cambio. */
  create(change: LeadStatusChange): Promise<void>;

  /** Cambios de un lead del tenant actual, del más antiguo al más reciente. */
  findByLead(leadId: string): Promise<LeadStatusChange[]>;
}
