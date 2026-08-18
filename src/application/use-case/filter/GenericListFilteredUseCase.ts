import { FilterCriteriaDTO } from "@/application/dtos/FilterCriteriaDTO.js";
import { PaginatedResult } from "@/application/dtos/PaginatedResultDTO.js";
import { IMapper } from "@/application/ports/mappers/IMapper.js";
import { IFilterableRepository } from "@/application/ports/repositories/IFilterableRepository.js";
import { IFilterFieldConfig } from "@/application/ports/services/IFilterFieldConfig.js";


export class GenericListFilteredUseCase<Entity, DTO> {
    constructor(
        private readonly repository: IFilterableRepository<Entity>,
        private readonly mapper: IMapper<Entity, DTO>,
        private readonly filterConfig: IFilterFieldConfig
    ) {}

    async execute(criteria: FilterCriteriaDTO): Promise<PaginatedResult<DTO>> {
        const [data, total] = await Promise.all([
            this.repository.findFiltered(criteria, this.filterConfig),
            this.repository.countFiltered(criteria, this.filterConfig),
        ]);

        const page = criteria.page && criteria.page > 0 ? criteria.page: 1;
        const limit = criteria.limit && criteria.limit > 0 && criteria.limit <= 100 ? criteria.limit: 20;
        return {
            data: data.map(entity => this.mapper.toDTO(entity)),
            total,
            page,
            limit,
        };
    }
}