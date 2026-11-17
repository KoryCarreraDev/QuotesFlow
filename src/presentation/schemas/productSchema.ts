import { z } from 'zod';
import { moneyAmountSchema } from './moneySchema.js';

// F3-T02: catálogo de productos. El precio va como texto decimal (F3-T01); la regla "precio fijo o fórmula" la
// comprueba el dominio, también después de una modificación parcial.

const MAXIMUM_NAME_LENGTH = 200;
const MAXIMUM_DESCRIPTION_LENGTH = 2000;

const productName = z.string().trim().min(1).max(MAXIMUM_NAME_LENGTH);
const productDescription = z.string().trim().max(MAXIMUM_DESCRIPTION_LENGTH);

export const createProductSchema = z.object({
  name: productName,
  description: productDescription.optional(),
  basePrice: moneyAmountSchema.optional().describe('Precio unitario antes de IVA'),
  formulaId: z.uuid().optional().describe('Fórmula de precio de la empresa'),
  isActive: z.boolean().optional().describe('Por defecto true'),
});

/** Modificación parcial: `null` en `description`, `basePrice` o `formulaId` los quita. */
export const updateProductSchema = z
  .object({
    name: productName.optional(),
    description: productDescription.nullable().optional(),
    basePrice: moneyAmountSchema.nullable().optional(),
    formulaId: z.uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), 'Send at least one field');
