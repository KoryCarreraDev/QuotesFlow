import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';

export const leadFilterConfig: IFilterFieldConfig = {
  companyName: {
    type: 'text',
    sortable: true,
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
  contactName: {
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
  statusId: {
    type: 'id',
    allowedOperators: ['equals', 'in'],
    searchable: false,
  },
  source: {
    type: 'text',
    sortable: true,
    allowedOperators: ['contains', 'equals'],
    searchable: false,
  },
  assignedToId: {
    type: 'id',
    allowedOperators: ['equals', 'in'],
    searchable: false,
  },
  estimatedValue: {
    type: 'number',
    sortable: true,
    allowedOperators: ['equals', 'gt', 'gte', 'lt', 'lte'],
    searchable: false,
  },
  expectedCloseDate: {
    type: 'date',
    sortable: true,
    allowedOperators: ['equals', 'gt', 'gte', 'lt', 'lte'],
    searchable: false,
  },
  createdAt: {
    type: 'date',
    sortable: true,
    allowedOperators: ['equals', 'gt', 'gte', 'lt', 'lte'],
    searchable: false,
  },
  notes: {
    type: 'text',
    allowedOperators: ['contains', 'equals'],
    searchable: true,
  },
};
