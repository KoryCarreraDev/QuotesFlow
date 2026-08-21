import { z } from 'zod';

export const createContactSchema = z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    companyId: z.string().uuid().optional(),
})

export const updateContactSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    companyId: z.string().uuid().optional(),
})
