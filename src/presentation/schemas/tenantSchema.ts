import { z } from 'zod';
import { isSupportedTimezone } from '../../domain/value-objects/timezone.js';
import { percentageSchema } from './moneySchema.js';

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
    // F3-T05: configuración de cotizaciones. Q-020: IVA por defecto (`null` lo quita y se pide en cada ítem).
    defaultTaxRate: percentageSchema.nullable().optional(),
    // D-25, Q-019: descuento máximo por rol; dueño y socio no tienen tope.
    maximumDiscountRateSalesRep: percentageSchema.optional(),
    maximumDiscountRateSalesLeader: percentageSchema.optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    error: 'Send at least one field',
  });
