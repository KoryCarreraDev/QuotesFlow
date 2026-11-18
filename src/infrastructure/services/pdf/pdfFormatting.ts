// Formato de números y texto para el PDF de cotizaciones (F3-T06). Todo parte de texto decimal exacto: nunca se
// convierte un importe a `number`, para no perder centavos (F3-T01).

const THOUSANDS_SEPARATOR = '.';
const DECIMAL_SEPARATOR = ',';
const THOUSANDS_GROUP_LENGTH = 3;
const DECIMAL_POINT = '.';
const CENTS_DIGITS = 2;
const TRAILING_ZEROS_PATTERN = /0+$/;
const NEGATIVE_SIGN = '-';

function groupThousands(integerDigits: string): string {
  const groups: string[] = [];
  for (let end = integerDigits.length; end > 0; end -= THOUSANDS_GROUP_LENGTH) {
    groups.unshift(integerDigits.slice(Math.max(0, end - THOUSANDS_GROUP_LENGTH), end));
  }
  return groups.join(THOUSANDS_SEPARATOR);
}

/** Importe en pesos al estilo colombiano: `"1234567.5"` → `"$ 1.234.567,50"`. */
export function formatPesos(decimalText: string): string {
  const isNegative = decimalText.startsWith(NEGATIVE_SIGN);
  const unsigned = isNegative ? decimalText.slice(1) : decimalText;
  const [integerPart, decimalPart = ''] = unsigned.split(DECIMAL_POINT);
  const cents = decimalPart.padEnd(CENTS_DIGITS, '0').slice(0, CENTS_DIGITS);
  return `${isNegative ? '-' : ''}$ ${groupThousands(integerPart)}${DECIMAL_SEPARATOR}${cents}`;
}

/** Porcentaje sin ceros inútiles: `"19.00"` → `"19 %"`, `"12.50"` → `"12,5 %"`. */
export function formatPercentage(decimalText: string): string {
  const [integerPart, decimalPart = ''] = decimalText.split(DECIMAL_POINT);
  const significantDecimals = decimalPart.replace(TRAILING_ZEROS_PATTERN, '');
  return `${integerPart}${significantDecimals ? DECIMAL_SEPARATOR + significantDecimals : ''} %`;
}

/** Cantidad entera con separador de miles: `1500` → `"1.500"`. */
export function formatQuantity(quantity: number): string {
  return groupThousands(String(quantity));
}

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha `AAAA-MM-DD` como `DD/MM/AAAA`; si no tiene esa forma, se deja igual. */
export function formatCalendarDate(calendarDate: string): string {
  const parts = CALENDAR_DATE_PATTERN.exec(calendarDate);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : calendarDate;
}

const REPLACEMENT_CHARACTER = '?';
const TAB_REPLACEMENT = '    ';
const LINE_BREAK_PATTERN = /\r\n|\r|\n/;

/**
 * Líneas de texto que la fuente estándar del PDF puede dibujar. Las fuentes estándar solo codifican WinAnsi
 * (español incluido: tildes, ñ, ¿, ¡); cualquier otro carácter, o un control, haría fallar el dibujo, así que se
 * cambia por `?`. Los saltos de línea del texto se conservan como líneas separadas.
 */
export function toDrawableLines(text: string, isSupportedCodePoint: (codePoint: number) => boolean): string[] {
  return text.split(LINE_BREAK_PATTERN).map((line) =>
    Array.from(line.replaceAll('\t', TAB_REPLACEMENT))
      .map((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return isSupportedCodePoint(codePoint) ? character : REPLACEMENT_CHARACTER;
      })
      .join(''),
  );
}
