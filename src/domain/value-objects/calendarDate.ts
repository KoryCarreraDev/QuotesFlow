// Fechas de calendario sin hora (vigencia de una cotización, D-23), escritas `AAAA-MM-DD`. Se comparan como texto:
// con ese formato el orden alfabético es el cronológico.

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_LENGTH = 10;

/** Indica si el texto es una fecha `AAAA-MM-DD` que existe (rechaza `2026-02-30`). */
export function isCalendarDate(text: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, ISO_DATE_LENGTH) === text;
}

/** Fecha de hoy en una zona horaria IANA (`America/Bogota`), como `AAAA-MM-DD`. */
export function calendarDateIn(timezone: string, instant: Date): string {
  // en-CA escribe las fechas como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Fecha de calendario de un `Date` guardado como fecha sin hora (medianoche UTC). */
export function calendarDateOfStoredDate(storedDate: Date): string {
  return storedDate.toISOString().slice(0, ISO_DATE_LENGTH);
}

const MILLISECONDS_PER_DAY = 86_400_000;

/** La fecha de calendario que cae `days` días después (o antes, si es negativo). */
export function addDaysToCalendarDate(calendarDate: string, days: number): string {
  const shifted = new Date(new Date(`${calendarDate}T00:00:00.000Z`).getTime() + days * MILLISECONDS_PER_DAY);
  return shifted.toISOString().slice(0, ISO_DATE_LENGTH);
}
