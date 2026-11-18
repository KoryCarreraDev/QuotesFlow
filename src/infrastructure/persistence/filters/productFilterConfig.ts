import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';

/** Campos filtrables y ordenables del catálogo de productos (F3-T02). */
export const productFilterConfig: IFilterFieldConfig = {
  id: { type: 'id', allowedOperators: ['equals', 'in'], searchable: false },
  name: { type: 'text', sortable: true, allowedOperators: ['contains', 'equals'], searchable: true },
  description: { type: 'text', allowedOperators: ['contains'], searchable: true },
  basePrice: {
    type: 'money',
    sortable: true,
    allowedOperators: ['equals', 'gt', 'gte', 'lt', 'lte'],
    searchable: false,
  },
  formulaId: { type: 'id', allowedOperators: ['equals', 'in'], searchable: false },
  isActive: { type: 'boolean', allowedOperators: ['equals'], searchable: false },
  createdAt: {
    type: 'date',
    sortable: true,
    allowedOperators: ['equals', 'gt', 'gte', 'lt', 'lte'],
    searchable: false,
  },
};
