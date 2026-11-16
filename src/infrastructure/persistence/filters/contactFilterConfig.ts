import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';

export const contactFilterConfig: IFilterFieldConfig = {
  firstName: {
    type: 'text',
    sortable: true,
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
  lastName: {
    type: 'text',
    sortable: true,
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
  email: {
    type: 'text',
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
  phone: {
    type: 'text',
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
  companyId: {
    type: 'id',
    allowedOperators: ['equals', 'in'],
    searchable: false,
  },
  createdAt: {
    type: 'date',
    sortable: true,
    allowedOperators: ['equals', 'gt', 'gte', 'lt', 'lte'],
    searchable: false,
  },
  ownerId: {
    type: 'id',
    allowedOperators: ['equals', 'in'],
    searchable: false,
  },
  documentNumber: {
    type: 'text',
    allowedOperators: ['equals'],
    searchable: false,
  },
};
