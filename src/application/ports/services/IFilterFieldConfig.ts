/** Tipo del valor de un campo filtrable: decide qué valores acepta un filtro sobre él (F1-T12, H11). */
export type FilterFieldType = 'text' | 'number' | 'date' | 'id';

/** Lista blanca de campos filtrables de una entidad: lo que no está aquí no se puede filtrar ni ordenar. */
export interface IFilterFieldConfig {
  [FieldName: string]: {
    type: FilterFieldType;
    allowedOperators: string[];
    /** Entra en la búsqueda libre (`search`). */
    searchable: boolean;
    /** Se puede usar como `sortBy`. */
    sortable?: boolean;
  };
}
