import { ErrorCode } from '../errors/ErrorCode.js';
import { ValidationError } from '../errors/ValidationError.js';

/** Decimales del peso colombiano (D-21): los importes se guardan y se muestran en centavos. */
export const MONEY_DECIMAL_PLACES = 2;
/** Cifras enteras máximas de un importe: hasta 999 billones de pesos, de sobra para una cotización. */
export const MONEY_MAXIMUM_INTEGER_DIGITS = 15;
/** Cifras enteras máximas de un porcentaje (100). */
const PERCENTAGE_MAXIMUM_INTEGER_DIGITS = 3;

const ZERO = 0n;
const ONE = 1n;
const MINOR_UNITS_PER_UNIT = 100n;
const BASIS_POINTS_PER_UNIT = 10_000n;
const HALF_BASIS_POINTS_PER_UNIT = 5_000n;
const MAXIMUM_PERCENTAGE_BASIS_POINTS = 10_000;
// Dígito a partir del cual el primer decimal descartado redondea hacia arriba (mitad hacia arriba).
const ROUND_UP_FROM_DIGIT = 5;

const DIGITS_ONLY_PATTERN = /^\d+$/;
const DECIMAL_SEPARATOR = '.';
const MINUS_SIGN = '-';

/** Número decimal escrito como texto, separado en sus partes. */
interface DecimalText {
  isNegative: boolean;
  integerDigits: string;
  decimalDigits: string;
}

interface DecimalTextLimits {
  maximumIntegerDigits: number;
  /** `undefined`: cualquier número de decimales (valores calculados que se redondean). */
  maximumDecimalDigits: number | undefined;
  allowsNegative: boolean;
}

/**
 * Lee un decimal escrito como texto: signo opcional, cifras, y opcionalmente un punto y más cifras.
 * Sin separadores de miles, sin coma decimal, sin espacios y sin notación científica.
 * `undefined` si no tiene ese formato o supera los límites.
 */
function parseDecimalText(text: string, limits: DecimalTextLimits): DecimalText | undefined {
  const isNegative = text.startsWith(MINUS_SIGN);
  if (isNegative && !limits.allowsNegative) return undefined;
  const unsignedText = isNegative ? text.slice(MINUS_SIGN.length) : text;
  const [integerDigits, decimalDigits, ...extraParts] = unsignedText.split(DECIMAL_SEPARATOR);

  const hasValidInteger =
    DIGITS_ONLY_PATTERN.test(integerDigits) && integerDigits.length <= limits.maximumIntegerDigits;
  const hasValidDecimals =
    decimalDigits === undefined ||
    (DIGITS_ONLY_PATTERN.test(decimalDigits) &&
      (limits.maximumDecimalDigits === undefined || decimalDigits.length <= limits.maximumDecimalDigits));
  if (extraParts.length > 0 || !hasValidInteger || !hasValidDecimals) return undefined;

  return { isNegative, integerDigits, decimalDigits: decimalDigits ?? '' };
}

const EXACT_MONEY_LIMITS: DecimalTextLimits = {
  maximumIntegerDigits: MONEY_MAXIMUM_INTEGER_DIGITS,
  maximumDecimalDigits: MONEY_DECIMAL_PLACES,
  allowsNegative: true,
};
const CALCULATED_MONEY_LIMITS: DecimalTextLimits = { ...EXACT_MONEY_LIMITS, maximumDecimalDigits: undefined };
const PERCENTAGE_LIMITS: DecimalTextLimits = {
  maximumIntegerDigits: PERCENTAGE_MAXIMUM_INTEGER_DIGITS,
  maximumDecimalDigits: MONEY_DECIMAL_PLACES,
  allowsNegative: false,
};

/** Parte decimal escrita con exactamente dos cifras ("5" → "50", "" → "00"). */
function twoDecimalDigits(decimalDigits: string): string {
  return decimalDigits.slice(0, MONEY_DECIMAL_PLACES).padEnd(MONEY_DECIMAL_PLACES, '0');
}

function invalidAmount(): ValidationError {
  return new ValidationError(ErrorCode.INVALID_MONEY_AMOUNT, 'Money amount must be a decimal with up to 2 places');
}

function invalidPercentage(): ValidationError {
  return new ValidationError(ErrorCode.INVALID_PERCENTAGE, 'Percentage must be between 0 and 100 with up to 2 places');
}

/** `true` si el texto es un importe válido para la API: no negativo y con como mucho dos decimales. */
export function isNonNegativeMoneyText(text: string): boolean {
  return parseDecimalText(text, { ...EXACT_MONEY_LIMITS, allowsNegative: false }) !== undefined;
}

/** `true` si el texto es un porcentaje entre 0 y 100 con como mucho dos decimales. */
export function isPercentageText(text: string): boolean {
  try {
    Percentage.fromDecimalString(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Porcentaje exacto entre 0 y 100, con dos decimales (IVA, descuentos). Se guarda en centésimas de punto
 * (puntos básicos): 19 % son 1900.
 */
export class Percentage {
  private constructor(readonly basisPoints: number) {}

  /**
   * @throws {ValidationError} `INVALID_PERCENTAGE` si no es un número entre 0 y 100 con como mucho dos decimales.
   */
  static fromDecimalString(text: string): Percentage {
    const parsed = parseDecimalText(text, PERCENTAGE_LIMITS);
    if (!parsed) throw invalidPercentage();
    const basisPoints = Number(`${parsed.integerDigits}${twoDecimalDigits(parsed.decimalDigits)}`);
    if (basisPoints > MAXIMUM_PERCENTAGE_BASIS_POINTS) throw invalidPercentage();
    return new Percentage(basisPoints);
  }

  isGreaterThan(other: Percentage): boolean {
    return this.basisPoints > other.basisPoints;
  }

  /** Texto con dos decimales, como lo devuelve la API: `"19.00"`. */
  toDecimalString(): string {
    const digits = String(this.basisPoints).padStart(MONEY_DECIMAL_PLACES + 1, '0');
    return `${digits.slice(0, -MONEY_DECIMAL_PLACES)}${DECIMAL_SEPARATOR}${digits.slice(-MONEY_DECIMAL_PLACES)}`;
  }
}

/**
 * Importe exacto en pesos colombianos (F3-T01, H21, R8). Nunca pasa por `number`: guarda centavos en un
 * `bigint` y entra y sale de la API y de la base de datos como texto decimal (`"1500000.00"`).
 *
 * Redondeo: mitad hacia arriba, alejándose del cero (0,005 → 0,01), el redondeo comercial habitual.
 */
export class Money {
  private constructor(readonly minorUnits: bigint) {}

  static zero(): Money {
    return new Money(ZERO);
  }

  /**
   * Importe escrito por una persona o guardado en la base de datos: exacto, con como mucho dos decimales.
   *
   * @throws {ValidationError} `INVALID_MONEY_AMOUNT` si no tiene ese formato.
   */
  static fromDecimalString(text: string): Money {
    const parsed = parseDecimalText(text, EXACT_MONEY_LIMITS);
    if (!parsed) throw invalidAmount();
    const magnitude = BigInt(`${parsed.integerDigits}${twoDecimalDigits(parsed.decimalDigits)}`);
    return new Money(parsed.isNegative ? -magnitude : magnitude);
  }

  /**
   * Importe calculado (por ejemplo, el resultado de una fórmula) con más decimales de los que tiene el peso:
   * se redondea a dos, mitad hacia arriba.
   *
   * @throws {ValidationError} `INVALID_MONEY_AMOUNT` si no es un número decimal finito.
   */
  static fromDecimalStringRounded(text: string): Money {
    const parsed = parseDecimalText(text, CALCULATED_MONEY_LIMITS);
    if (!parsed) throw invalidAmount();
    const truncated = BigInt(`${parsed.integerDigits}${twoDecimalDigits(parsed.decimalDigits)}`);
    const firstDroppedDigit = Number(parsed.decimalDigits.charAt(MONEY_DECIMAL_PLACES) || '0');
    const magnitude = firstDroppedDigit >= ROUND_UP_FROM_DIGIT ? truncated + ONE : truncated;
    return new Money(parsed.isNegative ? -magnitude : magnitude);
  }

  add(other: Money): Money {
    return new Money(this.minorUnits + other.minorUnits);
  }

  subtract(other: Money): Money {
    return new Money(this.minorUnits - other.minorUnits);
  }

  /**
   * Importe por una cantidad de unidades.
   *
   * @throws {ValidationError} `INVALID_QUANTITY` si la cantidad no es un entero mayor o igual que cero.
   */
  multiply(quantity: number): Money {
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new ValidationError(ErrorCode.INVALID_QUANTITY, 'Quantity must be a non-negative integer');
    }
    return new Money(this.minorUnits * BigInt(quantity));
  }

  /** Porción del importe que representa un porcentaje (IVA, descuento), redondeada a centavos. */
  percentage(rate: Percentage): Money {
    const portion = (this.magnitude() * BigInt(rate.basisPoints) + HALF_BASIS_POINTS_PER_UNIT) / BASIS_POINTS_PER_UNIT;
    return new Money(this.isNegative() ? -portion : portion);
  }

  isZero(): boolean {
    return this.minorUnits === ZERO;
  }

  isNegative(): boolean {
    return this.minorUnits < ZERO;
  }

  /** -1 si es menor que `other`, 0 si es igual, 1 si es mayor. */
  compareTo(other: Money): -1 | 0 | 1 {
    if (this.minorUnits === other.minorUnits) return 0;
    return this.minorUnits < other.minorUnits ? -1 : 1;
  }

  equals(other: Money): boolean {
    return this.compareTo(other) === 0;
  }

  /** Texto con dos decimales, como lo devuelve la API y como lo guarda la base de datos: `"1500000.00"`. */
  toDecimalString(): string {
    const units = this.magnitude() / MINOR_UNITS_PER_UNIT;
    const cents = String(this.magnitude() % MINOR_UNITS_PER_UNIT).padStart(MONEY_DECIMAL_PLACES, '0');
    return `${this.isNegative() ? MINUS_SIGN : ''}${units}${DECIMAL_SEPARATOR}${cents}`;
  }

  private magnitude(): bigint {
    return this.isNegative() ? -this.minorUnits : this.minorUnits;
  }
}
