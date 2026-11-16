import { FilterCriteriaDTO } from '../../dtos/FilterCriteriaDTO.js';
import { IFilterFieldConfig } from '../services/IFilterFieldConfig.js';

/**
 * Repositorio con listado filtrado y paginado según una lista blanca de campos (`IFilterFieldConfig`).
 */
export interface IFilterableRepository<TEntity> {
  findFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<TEntity[]>;
  countFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<number>;
}
