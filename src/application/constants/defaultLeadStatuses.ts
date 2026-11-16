import { LeadStatusType } from '../../domain/enums/LeadStatusType.js';

export const defaultLeadStatuses = [
  { name: 'Nuevo', order: 1, isDefault: true, color: '#3B82F6', type: LeadStatusType.OPEN },
  { name: 'Contactado', order: 2, isDefault: false, color: '#F59E0B', type: LeadStatusType.OPEN },
  { name: 'Calificado', order: 3, isDefault: false, color: '#8B5CF6', type: LeadStatusType.OPEN },
  { name: 'Ganado', order: 4, isDefault: false, color: '#10B981', type: LeadStatusType.WON },
  { name: 'Perdido', order: 5, isDefault: false, color: '#EF4444', type: LeadStatusType.LOST },
] as const;
