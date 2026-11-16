import { z } from 'zod';

// H7 pide 12 caracteres y rechazar contraseñas filtradas (D-11); se corrige en F2-T03.
const MINIMUM_PASSWORD_LENGTH = 6;

export const registerSchema = z.object({
  companyName: z.string().min(1),
  ownerEmail: z.string().email(),
  password: z.string().min(MINIMUM_PASSWORD_LENGTH),
  ownerFirstName: z.string().min(1),
  ownerLastName: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(MINIMUM_PASSWORD_LENGTH),
});
