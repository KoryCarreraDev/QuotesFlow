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
    // D-57 (F3-T10): usar también el correo para cotizaciones y alertas. Por defecto, solo el sistema.
    emailDeliveryEnabled: z.boolean().optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    error: 'At least one of name, timezone or emailDeliveryEnabled is required',
  });
