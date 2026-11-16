import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';

const FIRST_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Misma regla de paginación que `BasePrismaRepository.buildPagination`. */
export function paginateInMemory<TItem>(items: TItem[], criteria: FilterCriteriaDTO): TItem[] {
  const page = criteria.page && criteria.page > 0 ? criteria.page : FIRST_PAGE;
  const pageSize =
    criteria.limit && criteria.limit > 0 && criteria.limit <= MAX_PAGE_SIZE ? criteria.limit : DEFAULT_PAGE_SIZE;
  const firstItemIndex = (page - FIRST_PAGE) * pageSize;

  return items.slice(firstItemIndex, firstItemIndex + pageSize);
}
