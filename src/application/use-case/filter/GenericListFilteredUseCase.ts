import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { PaginatedResult } from '@/application/dtos/PaginatedResultDTO.js';
import { IMapper } from '@/application/ports/mappers/IMapper.js';
import { IFilterableRepository } from '@/application/ports/repositories/IFilterableRepository.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { Action, type Actor, scopeFor } from '@/application/policies/authorizationPolicy.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAXIMUM_LIMIT = 100;
const EQUALS_OPERATOR = 'equals';

/** Listado acotado por responsable: con alcance `own`, solo los registros de los que el actor es responsable. */
export interface OwnershipScope {
  action: Action;
  /** Campo que guarda el responsable (en leads, `assignedToId`). */
  ownerField: string;
}

/**
 * Listado filtrado y paginado de cualquier entidad.
 *
 * Con `ownershipScope`, la política decide qué parte ve el actor (F1-T12; antes lo hacía el controller):
 * con alcance `own` se descarta cualquier filtro sobre el campo del responsable y se fuerza el suyo.
 */
export class GenericListFilteredUseCase<Entity, DTO> {
  constructor(
    private readonly repository: IFilterableRepository<Entity>,
    private readonly mapper: IMapper<Entity, DTO>,
    private readonly filterConfig: IFilterFieldConfig,
    private readonly ownershipScope?: OwnershipScope,
  ) {}

  /**
   * @param actor Obligatorio si el listado tiene `ownershipScope`.
   * @throws {ForbiddenError} Si el listado tiene alcance y el actor no puede ver nada.
   */
  async execute(criteria: FilterCriteriaDTO, actor?: Actor): Promise<PaginatedResult<DTO>> {
    const scopedCriteria = this.applyOwnershipScope(criteria, actor);
    const [data, total] = await Promise.all([
      this.repository.findFiltered(scopedCriteria, this.filterConfig),
      this.repository.countFiltered(scopedCriteria, this.filterConfig),
    ]);

    const page = criteria.page && criteria.page > 0 ? criteria.page : DEFAULT_PAGE;
    const limit =
      criteria.limit && criteria.limit > 0 && criteria.limit <= MAXIMUM_LIMIT ? criteria.limit : DEFAULT_LIMIT;
    return {
      data: data.map((entity) => this.mapper.toDTO(entity)),
      total,
      page,
      limit,
    };
  }

  private applyOwnershipScope(criteria: FilterCriteriaDTO, actor?: Actor): FilterCriteriaDTO {
    if (!this.ownershipScope) return criteria;

    const scope = actor ? scopeFor(actor, this.ownershipScope.action) : { kind: 'none' as const };
    if (scope.kind === 'none') {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }
    if (scope.kind === 'all') return criteria;

    const { ownerField } = this.ownershipScope;
    const filtersWithoutOwner = (criteria.filters ?? []).filter((filter) => filter.field !== ownerField);
    return {
      ...criteria,
      filters: [...filtersWithoutOwner, { field: ownerField, operator: EQUALS_OPERATOR, value: scope.userId }],
    };
  }
}
