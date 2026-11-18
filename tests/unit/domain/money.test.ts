import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { Money, Percentage, isNonNegativeMoneyText, isPercentageText } from '@/domain/value-objects/money.js';

// F3-T01 (H21, R8): el dinero nunca pasa por `number`. Pesos colombianos (D-21) con dos decimales.

const THREE_UNITS = 3;
const FRACTIONAL_QUANTITY = 1.5;

describe('Money', () => {
  it.each([
    ['1500000', '1500000.00'],
    ['1500000.5', '1500000.50'],
    ['0.01', '0.01'],
    ['0', '0.00'],
    ['-250.75', '-250.75'],
    ['999999999999999.99', '999999999999999.99'],
  ])('lee "%s" exacto y lo escribe como "%s"', (text, expected) => {
    expect(Money.fromDecimalString(text).toDecimalString()).toBe(expected);
  });

  it.each([
    ['más de dos decimales', '10.001'],
    ['separador de miles', '1.500.000'],
    ['coma decimal', '1500,50'],
    ['notación científica', '1e6'],
    ['texto', 'mil pesos'],
    ['vacío', ''],
    ['espacios', ' 100 '],
    ['más de 15 cifras enteras', '1000000000000000'],
  ])('rechaza %s con INVALID_MONEY_AMOUNT', (_case, text) => {
    expect(() => Money.fromDecimalString(text)).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_MONEY_AMOUNT }),
    );
  });

  it('suma sin perder centavos donde number los pierde', () => {
    const total = Money.fromDecimalString('0.10').add(Money.fromDecimalString('0.20'));

    expect(total.toDecimalString()).toBe('0.30');
  });

  it('resta y detecta resultados negativos', () => {
    const balance = Money.fromDecimalString('100').subtract(Money.fromDecimalString('100.01'));

    expect(balance.toDecimalString()).toBe('-0.01');
    expect(balance.isNegative()).toBe(true);
  });

  it('multiplica por una cantidad entera', () => {
    expect(Money.fromDecimalString('33333.33').multiply(THREE_UNITS).toDecimalString()).toBe('99999.99');
  });

  it.each([FRACTIONAL_QUANTITY, -1, Number.NaN])(
    'rechaza multiplicar por una cantidad que no es un entero no negativo (%s)',
    (quantity) => {
      expect(() => Money.fromDecimalString('10').multiply(quantity)).toThrow(
        expect.objectContaining({ code: ErrorCode.INVALID_QUANTITY }),
      );
    },
  );

  it.each([
    ['1000000', '19', '190000.00'],
    ['100.05', '19', '19.01'], // 19.0095 → 19.01 (mitad hacia arriba)
    ['0.50', '5', '0.03'], // 0.025 → 0.03
    ['0.10', '5', '0.01'], // 0.005 → 0.01
    ['0.09', '5', '0.00'], // 0.0045 → 0.00
    ['-0.50', '5', '-0.03'], // el redondeo se aleja del cero también en negativos
    ['1234.56', '0', '0.00'],
    ['1234.56', '100', '1234.56'],
    ['200', '12.5', '25.00'],
  ])('%s × %s %% = %s, redondeando la mitad hacia arriba', (amount, rate, expected) => {
    const portion = Money.fromDecimalString(amount).percentage(Percentage.fromDecimalString(rate));

    expect(portion.toDecimalString()).toBe(expected);
  });

  it.each([
    ['2.344', '2.34'],
    ['2.345', '2.35'],
    ['2.3449999', '2.34'],
    ['-2.345', '-2.35'],
    ['1500000', '1500000.00'],
    ['0.005', '0.01'],
  ])('redondea "%s" a "%s" cuando el valor viene calculado (fórmulas)', (text, expected) => {
    expect(Money.fromDecimalStringRounded(text).toDecimalString()).toBe(expected);
  });

  it('el redondeo también rechaza lo que no es un número decimal', () => {
    expect(() => Money.fromDecimalStringRounded('Infinity')).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_MONEY_AMOUNT }),
    );
  });

  it('compara importes', () => {
    const small = Money.fromDecimalString('10');
    const large = Money.fromDecimalString('10.01');

    expect(small.compareTo(large)).toBe(-1);
    expect(large.compareTo(small)).toBe(1);
    expect(small.compareTo(Money.fromDecimalString('10.00'))).toBe(0);
    expect(small.equals(Money.fromDecimalString('10.00'))).toBe(true);
    expect(Money.zero().isZero()).toBe(true);
  });
});

describe('Percentage', () => {
  it.each([
    ['19', '19.00'],
    ['5', '5.00'],
    ['0', '0.00'],
    ['12.5', '12.50'],
    ['100', '100.00'],
  ])('lee "%s" y lo escribe como "%s"', (text, expected) => {
    expect(Percentage.fromDecimalString(text).toDecimalString()).toBe(expected);
  });

  it.each([
    ['mayor que 100', '100.01'],
    ['negativo', '-1'],
    ['más de dos decimales', '19.005'],
    ['con signo de porcentaje', '19%'],
    ['vacío', ''],
  ])('rechaza un porcentaje %s con INVALID_PERCENTAGE', (_case, text) => {
    expect(() => Percentage.fromDecimalString(text)).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_PERCENTAGE }),
    );
  });

  it('compara porcentajes', () => {
    expect(Percentage.fromDecimalString('20').isGreaterThan(Percentage.fromDecimalString('10'))).toBe(true);
    expect(Percentage.fromDecimalString('10').isGreaterThan(Percentage.fromDecimalString('10.00'))).toBe(false);
  });
});

describe('validación del texto que llega de la API', () => {
  it.each([
    ['2500000', true],
    ['99.90', true],
    ['0', true],
    ['-1', false],
    ['1.001', false],
    ['1,5', false],
  ])('importe "%s": %s', (text, expected) => {
    expect(isNonNegativeMoneyText(text)).toBe(expected);
  });

  it.each([
    ['19', true],
    ['12.5', true],
    ['100', true],
    ['100.01', false],
    ['-5', false],
    ['abc', false],
  ])('porcentaje "%s": %s', (text, expected) => {
    expect(isPercentageText(text)).toBe(expected);
  });
});
