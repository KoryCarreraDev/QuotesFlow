import { z } from 'zod';
import { MAXIMUM_ITEM_QUANTITY, MAXIMUM_QUOTE_ITEMS } from '../../domain/entities/Quote.js';
import { isCalendarDate } from '../../domain/value-objects/calendarDate.js';
import { moneyAmountSchema, percentageSchema } from './moneySchema.js';

// F3-T05: cotizaciones. Importes y porcentajes viajan como texto decimal (F3-T01). El precio de cada ítem lo
// calcula el servidor; `unitPrice` solo sirve para un ítem sin producto o para cambiar el calculado con motivo
// (D-24). El dominio comprueba el resto (cliente obligatorio, topes de descuento, estado).

const MAXIMUM_DESCRIPTION_LENGTH = 500;
const MAXIMUM_REASON_LENGTH = 500;
const MAXIMUM_NOTES_LENGTH = 2000;
const MAXIMUM_EMAIL_LENGTH = 254;
const MAXIMUM_VARIABLE_NAME_LENGTH = 40;
const MAXIMUM_VARIABLE_VALUE_LENGTH = 30;
const MAXIMUM_VARIABLES_PER_ITEM = 20;

const calendarDateSchema = z
  .string()
  .refine(isCalendarDate, 'Must be a date as YYYY-MM-DD')
  .meta({ description: 'Fecha sin hora, AAAA-MM-DD', example: '2026-12-31' });

const quoteItemSchema = z.object({
  productId: z.uuid().optional().describe('Producto del catálogo; su precio o fórmula fija el precio calculado'),
  description: z
    .string()
    .trim()
    .min(1)
    .max(MAXIMUM_DESCRIPTION_LENGTH)
    .optional()
    .describe('Obligatoria sin producto; con él, por defecto su nombre'),
  quantity: z.number().int().min(1).max(MAXIMUM_ITEM_QUANTITY),
  variables: z
    .record(z.string().min(1).max(MAXIMUM_VARIABLE_NAME_LENGTH), z.string().min(1).max(MAXIMUM_VARIABLE_VALUE_LENGTH))
    .refine((variables) => Object.keys(variables).length <= MAXIMUM_VARIABLES_PER_ITEM, 'Too many variables')
    .optional()
    .describe('Valores de las variables de la fórmula del producto, como texto decimal'),
  unitPrice: moneyAmountSchema
    .optional()
    .describe('Precio unitario antes de IVA. Sin producto es obligatorio; con él, cambia el calculado (D-24)'),
  priceOverrideReason: z
    .string()
    .trim()
    .min(1)
    .max(MAXIMUM_REASON_LENGTH)
    .optional()
    .describe('Obligatorio si unitPrice difiere del precio calculado'),
  discountRate: percentageSchema.optional().describe('Descuento del ítem, por defecto 0'),
  taxRate: percentageSchema.optional().describe('IVA del ítem; por defecto el de la empresa, si lo configuró'),
});

const quoteItems = z.array(quoteItemSchema).min(1).max(MAXIMUM_QUOTE_ITEMS);
const quoteNotes = z.string().trim().max(MAXIMUM_NOTES_LENGTH);

export const createQuoteSchema = z.object({
  leadId: z.uuid().optional(),
  contactId: z.uuid().optional(),
  companyContactId: z.uuid().optional(),
  validUntil: calendarDateSchema.optional().describe('Por defecto, 30 días desde hoy'),
  discountRate: percentageSchema.optional().describe('Descuento global, después del de cada ítem. Por defecto 0'),
  notes: quoteNotes.optional(),
  items: quoteItems,
});

/** Modificación parcial de un borrador: `null` quita el cliente o las notas; `items` reemplaza todos los ítems. */
export const updateQuoteSchema = z
  .object({
    leadId: z.uuid().nullable().optional(),
    contactId: z.uuid().nullable().optional(),
    companyContactId: z.uuid().nullable().optional(),
    validUntil: calendarDateSchema.optional(),
    discountRate: percentageSchema.optional(),
    notes: quoteNotes.nullable().optional(),
    items: quoteItems.optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), 'Send at least one field');

/**
 * Datos opcionales al enviar una cotización (F3-T08). El cuerpo puede faltar del todo: sin cuerpo, Express no deja
 * `req.body`, y se trata como vacío.
 */
export const sendQuoteSchema = z
  .object({
    recipientEmail: z
      .email()
      .max(MAXIMUM_EMAIL_LENGTH)
      .optional()
      .describe('Con el correo activado, a quién se envía; por defecto el correo del cliente'),
  })
  .optional()
  .transform((body) => body ?? {});
