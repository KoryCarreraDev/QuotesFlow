import { LeadStatusType } from '../../domain/enums/LeadStatusType.js';
import { z } from 'zod';

export const createLeadStatusConfigSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  order: z.number().nonoptional('Order is required'),
  isDefault: z.boolean().optional(),
  color: z.string().optional(),
  type: z.enum(LeadStatusType).optional(),
});

export const updateLeadStatusConfigSchema = z.object({
  name: z.string().optional(),
  order: z.number().optional(),
  isDefault: z.boolean().optional(),
  color: z.string().optional(),
  type: z.enum(LeadStatusType).optional(),
});

const MAXIMUM_STATUS_COUNT = 100;

export const reorderLeadStatusConfigsSchema = z.object({
  statusIds: z.array(z.uuid()).min(1).max(MAXIMUM_STATUS_COUNT),
});
