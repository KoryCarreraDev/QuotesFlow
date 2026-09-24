export const defaultLeadStatuses = [
  { name: 'Nuevo',      order: 1, isDefault: true,  color: '#3B82F6' },
  { name: 'Contactado', order: 2, isDefault: false, color: '#F59E0B' },
  { name: 'Calificado', order: 3, isDefault: false, color: '#8B5CF6' },
  { name: 'Ganado',     order: 4, isDefault: false, color: '#10B981' },
  { name: 'Perdido',    order: 5, isDefault: false, color: '#EF4444' },
] as const;