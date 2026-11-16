import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';
import { LeadStatusConfigDTO } from '@/application/dtos/LeadStatusConfigDTO.js';
import { IMapper } from './IMapper.js';

/**
 * Convierte un estado de lead de dominio en el DTO que devuelve la API.
 */
export interface ILeadStatusConfigMapper extends IMapper<LeadStatusConfig, LeadStatusConfigDTO> {
  toDTO(leadStatus: LeadStatusConfig): LeadStatusConfigDTO;
}
