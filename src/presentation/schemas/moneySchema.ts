import { z } from 'zod';
import { isNonNegativeMoneyText, isPercentageText } from '../../domain/value-objects/money.js';

// F3-T01 (H21, R8): el dinero y los porcentajes viajan en la API como texto decimal, nunca como number,
// para no perder centavos. La validación es la misma que usa el dominio.

/** Importe en pesos (D-21), mayor o igual que cero, con como mucho dos decimales: `"2500000"`, `"99.90"`. */
export const moneyAmountSchema = z
  .string()
  .refine(isNonNegativeMoneyText, 'Must be a non-negative decimal amount with up to 2 places, as text')
  .meta({ description: 'Importe en pesos como texto decimal, con hasta 2 decimales', example: '2500000.00' });

/** Porcentaje entre 0 y 100 con como mucho dos decimales, como texto: `"19"`, `"12.5"`. */
export const percentageSchema = z
  .string()
  .refine(isPercentageText, 'Must be a percentage from 0 to 100 with up to 2 places, as text')
  .meta({ description: 'Porcentaje de 0 a 100 como texto decimal, con hasta 2 decimales', example: '19' });
