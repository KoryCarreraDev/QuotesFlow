import { z } from 'zod';
import { isSupportedTimezone } from '../../domain/value-objects/timezone.js';

const MAXIMUM_COMPANY_NAME_LENGTH = 200;

export const updateTenantProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(MAXIMUM_COMPANY_NAME_LENGTH).optional(),
    timezone: z
      .string()
      .refine(isSupportedTimezone, { error: 'Must be an IANA time zone, e.g. America/Bogota' })
      .optional(),
  })
  .refine((changes) => changes.name !== undefined || changes.timezone !== undefined, {
    error: 'At least one of name or timezone is required',
  });
