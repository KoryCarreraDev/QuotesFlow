import { z } from 'zod';

export const createLeadSchema = z.object({
  companyName: z.string().optional(),
  contactName: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  statusId: z.string().uuid().optional(),
  source: z.string().optional(),
  assignedToId: z.string().uuid().optional(),
  estimatedValue: z.number().optional(),
  expectedCloseDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

// Sin `statusId`: el estado cambia solo por `changeLeadStatusSchema`, que deja historial (F1-T13).
export const updateLeadSchema = z.object({
  companyName: z.string().optional(),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  source: z.string().optional(),
  assignedToId: z.string().uuid().optional(),
  estimatedValue: z.number().optional(),
  expectedCloseDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

const MAXIMUM_STATUS_NOTE_LENGTH = 500;

export const changeLeadStatusSchema = z.object({
  statusId: z.string().uuid(),
  note: z.string().max(MAXIMUM_STATUS_NOTE_LENGTH).optional(),
});
