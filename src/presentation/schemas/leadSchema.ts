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
})