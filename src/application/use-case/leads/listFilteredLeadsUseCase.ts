import { GenericListFilteredUseCase } from '../filter/GenericListFilteredUseCase.js';
import { Lead } from '@/domain/entities/Lead.js';
import { LeadDTO } from '@/application/dtos/LeadDTO.js';

/**
 * Listado filtrado y paginado de leads, acotado por responsable (`assignedToId`).
 */
export type ListFilteredLeadsUseCase = GenericListFilteredUseCase<Lead, LeadDTO>;
