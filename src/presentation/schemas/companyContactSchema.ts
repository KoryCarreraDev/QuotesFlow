import { z } from 'zod';

export const createCompanyContactSchema = z.object({
    name: z.string(),
    industry: z.string().optional(),
    taxNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
})

export const updateCompanyContactSchema = z.object({
    name: z.string().optional(),
    industry: z.string().optional(),
    taxNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
})
