import { FilterCriteriaDTO } from "../../dtos/FilterCriteriaDTO.js";
import { IFilterFieldConfig } from "../services/IFilterFieldConfig.js";

export interface IFilterableRepository<TEntity> {
    findFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<TEntity[]>;
    countFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<number>;
}