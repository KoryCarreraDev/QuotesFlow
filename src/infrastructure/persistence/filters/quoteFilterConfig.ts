import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';

/**
 * Campos filtrables y ordenables de las cotizaciones (F3-T05). `status` es el estado guardado: una enviada vencida
 * (`EXPIRED`, Q-016) sigue siendo `SENT` aquí; la vigencia se filtra con `validUntil`.
 */
export const quoteFilterConfig: IFilterFieldConfig = {
  id: { type: 'id', allowedOperators: ['equals', 'in'], searchable: false },
  number: { type: 'number', sortable: true, allowedOperators: ['equals', 'gt', 'gte', 'lt', 'lte'], searchable: false },
  status: { type: 'text', sortable: true, allowedOperators: ['equals', 'in'], searchable: false },
  leadId: { type: 'id', allowedOperators: ['equals', 'in'], searchable: false },
  contactId: { type: 'id', allowedOperators: ['equals', 'in'], searchable: false },
  companyContactId: { type: 'id', allowedOperators: ['equals', 'in'], searchable: false },
  createdById: { type: 'id', allowedOperators: ['equals', 'in'], searchable: false },
  total: { type: 'money', sortable: true, allowedOperators: ['gt', 'gte', 'lt', 'lte'], searchable: false },
  validUntil: {
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
};
