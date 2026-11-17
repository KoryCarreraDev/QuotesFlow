// Zona horaria de una empresa (F2-T06). Las fechas se guardan en UTC; la zona decide cómo se muestran y dónde
// cae "hoy" en vencimientos, alertas y reportes.

/** Por defecto Colombia: el mercado del MVP. */
export const DEFAULT_TENANT_TIMEZONE = 'America/Bogota';
const ALWAYS_SUPPORTED_TIMEZONE = 'UTC';

/** Indica si es una zona IANA que conoce el entorno (`America/Bogota`, `Europe/Madrid`, `UTC`). */
export function isSupportedTimezone(timezone: string): boolean {
  return timezone === ALWAYS_SUPPORTED_TIMEZONE || Intl.supportedValuesOf('timeZone').includes(timezone);
}
