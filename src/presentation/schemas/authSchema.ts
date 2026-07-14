import { z } from 'zod';

export const registerSchema = z.object({
    companyName: z.string().min(1),
    ownerEmail: z.string().email(),
    password: z.string().min(6),
    ownerFirstName: z.string().min(1),
    ownerLastName: z.string().min(1),
});

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});