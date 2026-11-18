/**
 * Tipo del valor de un campo filtrable. `money` (F3-A11, R8) son importes en pesos: llegan como texto decimal exacto
 * (`"1500000.50"`), nunca como `number`, que pierde centavos; `number` queda para enteros y contadores.
 *
 * Decide decide qué valores acepta un filtro sobre él (F1-T12, H11). */
export type FilterFieldType = 'text' | 'number' | 'money' | 'date' | 'id' | 'boolean';

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
