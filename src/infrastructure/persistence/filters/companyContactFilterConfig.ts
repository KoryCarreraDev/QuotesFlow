import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';

export const companyContactFilterConfig: IFilterFieldConfig = {
  name: {
    type: 'text',
    sortable: true,
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
  industry: {
    type: 'text',
    sortable: true,
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
  taxNumber: {
    type: 'text',
    allowedOperators: ['contains', 'equals'],
    searchable: false,
  },
  phone: {
    type: 'text',
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
  email: {
    type: 'text',
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
  address: {
    type: 'text',
    allowedOperators: ['contains', 'equals'],
    searchable: false,
  },
  city: {
    type: 'text',
    sortable: true,
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
  state: {
    type: 'text',
    sortable: true,
    allowedOperators: ['contains', 'equals'],
    searchable: false,
  },
  zip: {
    type: 'text',
    allowedOperators: ['contains', 'equals'],
    searchable: false,
  },
  country: {
    type: 'text',
    sortable: true,
    allowedOperators: ['contains', 'equals'],
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
