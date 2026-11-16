import { Lead } from '../../../domain/entities/Lead.js';
import { LeadDTO } from '../../../application/dtos/LeadDTO.js';
import { IMapper } from './IMapper.js';

/**
 * Convierte un lead de dominio en el DTO que devuelve la API.
 */
export interface ILeadMapper extends IMapper<Lead, LeadDTO> {
  toDTO(lead: Lead): LeadDTO;
}
