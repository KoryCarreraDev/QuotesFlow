import { z } from 'zod';

export const createLeadStatusConfigSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    order: z.number().nonoptional('Order is required'),
    isDefault: z.boolean().optional(),
    color: z.string().optional()
});

export const updateLeadStatusConfigSchema = z.object({
    name: z.string().optional(),
    order: z.number().optional(),
    isDefault: z.boolean().optional(),
    color: z.string().optional()
});