import { z } from 'zod';
import { MAXIMUM_PASSWORD_BYTES, MINIMUM_PASSWORD_LENGTH } from '../../application/services/PasswordPolicy.js';

// Una contraseña de login no tiene mínimo: las cuentas anteriores a D-11 pueden tener contraseñas de 6
// caracteres y deben poder entrar para cambiarla. El máximo solo evita cuerpos absurdos.
const MAXIMUM_LOGIN_PASSWORD_LENGTH = 1_024;

/**
 * Contraseña nueva (D-11, H7, F2-T03): de 12 caracteres a 72 bytes (lo que bcrypt usa). Que no esté filtrada
 * lo comprueba `PasswordPolicy` en el caso de uso.
 */
export const newPasswordSchema = z
  .string()
  .min(MINIMUM_PASSWORD_LENGTH)
  .refine((password) => Buffer.byteLength(password, 'utf8') <= MAXIMUM_PASSWORD_BYTES, {
    error: `Password must have at most ${MAXIMUM_PASSWORD_BYTES} bytes`,
  });

export const registerSchema = z.object({
  companyName: z.string().min(1),
  ownerEmail: z.string().email(),
  password: newPasswordSchema,
  ownerFirstName: z.string().min(1),
  ownerLastName: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(MAXIMUM_LOGIN_PASSWORD_LENGTH),
});
