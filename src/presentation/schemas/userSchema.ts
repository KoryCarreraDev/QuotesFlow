import { z } from 'zod';
import { Role } from '../../domain/enums/Role.js';
import { newPasswordSchema } from './authSchema.js';

// El dueño no se invita ni se asigna: cada empresa conserva el suyo (F2-T05). Que el actor gestione el rol lo
// decide la política en el caso de uso.
const assignableRoles = [Role.PARTNER, Role.SALES_LEADER, Role.SALES_REP] as const;
const MAXIMUM_NAME_LENGTH = 100;
const ACCOUNT_TOKEN_MAXIMUM_LENGTH = 200;

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(assignableRoles),
});

export const updateUserSchema = z
  .object({
    role: z.enum(assignableRoles).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((changes) => changes.role !== undefined || changes.isActive !== undefined, {
    error: 'At least one of role or isActive is required',
  });

export const acceptInvitationSchema = z.object({
  token: z.string().min(1).max(ACCOUNT_TOKEN_MAXIMUM_LENGTH),
  password: newPasswordSchema,
  firstName: z.string().trim().min(1).max(MAXIMUM_NAME_LENGTH),
  lastName: z.string().trim().min(1).max(MAXIMUM_NAME_LENGTH),
});
