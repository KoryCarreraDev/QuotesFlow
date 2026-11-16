export interface FilterCondition {
  field: string;
  operator: string;
  value: unknown;
}

export type SortDirection = 'asc' | 'desc';

export interface FilterCriteriaDTO {
  filters?: FilterCondition[];
  search?: string;
  page?: number;
  limit?: number;
  /** Campo marcado como `sortable` en la configuración de filtros. Sin él, los más recientes primero. */
  sortBy?: string;
  sortDir?: SortDirection;
}
