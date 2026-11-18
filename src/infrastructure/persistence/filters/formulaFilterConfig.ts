import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';

/** Campos filtrables y ordenables de las fórmulas de precio (F3-T04). */
export const formulaFilterConfig: IFilterFieldConfig = {
  id: { type: 'id', allowedOperators: ['equals', 'in'], searchable: false },
  name: { type: 'text', sortable: true, allowedOperators: ['contains', 'equals'], searchable: true },
  createdAt: {
    type: 'date',
    sortable: true,
    allowedOperators: ['equals', 'gt', 'gte', 'lt', 'lte'],
    searchable: false,
  },
};
