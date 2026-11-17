import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import {
  MAXIMUM_EXPRESSION_LENGTH,
  MAXIMUM_EXPRESSION_NODES,
  MAXIMUM_VARIABLE_NAME_LENGTH,
  MathjsFormulaEvaluator,
  createHardenedMath,
} from '@/infrastructure/services/MathjsFormulaEvaluator.js';

// F3-T03: el dueño escribe fórmulas que la API evalúa. Una fórmula es código ajeno: solo se acepta una lista
// blanca de nodos (números, variables declaradas, + - * /, paréntesis y unas pocas funciones de redondeo).

const evaluator = new MathjsFormulaEvaluator();
const WINDOW_VARIABLES = ['ancho', 'alto', 'precioM2'];

function expectInvalidFormula(expression: string, declaredVariables: readonly string[] = WINDOW_VARIABLES): void {
  expect(() => evaluator.validate(expression, declaredVariables)).toThrow(
    expect.objectContaining({ code: ErrorCode.INVALID_FORMULA }),
  );
}

describe('MathjsFormulaEvaluator: fórmulas válidas', () => {
  it.each([
    ['ancho * alto * precioM2', { ancho: '1.20', alto: '1.50', precioM2: '180000' }, '324000'],
    ['(ancho + alto) * 2', { ancho: '1.2', alto: '1.5' }, '5.4'],
    ['max(ancho, alto) * 1000', { ancho: '1.2', alto: '1.5' }, '1500'],
    ['min(ancho, alto)', { ancho: '1.2', alto: '1.5' }, '1.2'],
    ['ceil(ancho / 0.5)', { ancho: '1.2' }, '3'],
    ['floor(ancho / 0.5)', { ancho: '1.2' }, '2'],
    ['round(ancho / 3, 2)', { ancho: '10' }, '3.33'],
    ['abs(ancho - alto)', { ancho: '1.2', alto: '1.5' }, '0.3'],
    ['-ancho + 10', { ancho: '4' }, '6'],
    ['2ancho', { ancho: '4' }, '8'],
    ['0.1 + 0.2', {}, '0.3'],
  ])('%s = %s', (expression, values, expected) => {
    evaluator.validate(expression, WINDOW_VARIABLES);

    expect(evaluator.evaluate(expression, values)).toBe(expected);
  });

  it('calcula con decimales exactos, sin los errores de number', () => {
    expect(evaluator.evaluate('ancho * 3', { ancho: '0.1' })).toBe('0.3');
  });

  it('devuelve el resultado completo y deja el redondeo a Money', () => {
    expect(evaluator.evaluate('ancho / 3', { ancho: '10' })).toMatch(/^3\.3{20,}$/);
  });

  it('ignora valores de variables que la fórmula no usa', () => {
    expect(evaluator.evaluate('ancho * 2', { ancho: '3', alto: '99' })).toBe('6');
  });
});

describe('MathjsFormulaEvaluator: inyección y fórmulas no permitidas', () => {
  it.each([
    ['import', 'import({}, {override: true})'],
    ['createUnit', 'createUnit("pulgada")'],
    ['evaluate', 'evaluate("1 + 1")'],
    ['parse', 'parse("1")'],
    ['simplify', 'simplify("ancho")'],
    ['derivative', 'derivative("ancho^2", "ancho")'],
    ['compile', 'compile("1")'],
    ['una función fuera de la lista', 'cos(ancho)'],
    ['acceso a propiedades', 'ancho.constructor'],
    ['acceso por índice', 'ancho["constructor"]'],
    ['cadena de texto', '"texto"'],
    ['asignación', 'ancho = 1'],
    ['definición de función', 'f(x) = x'],
    ['varias expresiones', 'ancho; alto'],
    ['condicional', 'ancho > 1 ? alto : precioM2'],
    ['comparación', 'ancho == alto'],
    ['operador lógico', 'ancho and alto'],
    ['matriz', '[ancho, alto]'],
    ['objeto', '{ a: ancho }'],
    ['rango', '1:3'],
    ['potencia (crecimiento sin límite)', 'ancho ^ 3'],
    ['factorial', 'ancho!'],
    ['módulo', 'ancho mod 2'],
    ['unidades', '5 cm'],
    ['constante de mathjs', 'pi * ancho'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['una variable no declarada', 'ancho * largo'],
    ['un número enorme', '1e999999 * ancho'],
    ['un número con demasiados decimales', 'ancho * 0.0000001'],
    ['vacía', ''],
    ['solo espacios', '   '],
    ['sintaxis rota', 'ancho * (alto'],
    ['una función con la variable como nombre', 'ancho(2)'],
  ])('rechaza %s con INVALID_FORMULA', (_case, expression) => {
    expectInvalidFormula(expression);
  });

  it(`rechaza una fórmula de más de ${MAXIMUM_EXPRESSION_LENGTH} caracteres`, () => {
    expectInvalidFormula(`ancho${' + ancho'.repeat(MAXIMUM_EXPRESSION_LENGTH)}`);
  });

  it(`rechaza una fórmula de más de ${MAXIMUM_EXPRESSION_NODES} nodos aunque sea corta`, () => {
    const manyNodes = Array.from({ length: MAXIMUM_EXPRESSION_NODES }, () => 'a').join('+');

    expectInvalidFormula(manyNodes, ['a']);
  });

  it.each([
    ['empieza por número', '1ancho'],
    ['tiene espacios', 'ancho total'],
    ['tiene guiones', 'ancho-total'],
    ['coincide con una función permitida', 'max'],
    ['es demasiado larga', 'a'.repeat(MAXIMUM_VARIABLE_NAME_LENGTH + 1)],
  ])('rechaza declarar una variable que %s', (_case, variableName) => {
    expect(() => evaluator.validate('1', [variableName])).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_FORMULA_VARIABLE }),
    );
  });
});

describe('MathjsFormulaEvaluator: valores al evaluar', () => {
  it('falla si falta el valor de una variable que la fórmula usa', () => {
    expect(() => evaluator.evaluate('ancho * alto', { ancho: '1' })).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_FORMULA_VARIABLE }),
    );
  });

  it.each([
    ['coma decimal', '1,5'],
    ['negativo', '-1'],
    ['texto', 'uno'],
    ['notación científica', '1e3'],
    ['más de 6 decimales', '1.1234567'],
    ['más de 15 cifras enteras', '1000000000000000'],
  ])('rechaza un valor de variable con %s', (_case, value) => {
    expect(() => evaluator.evaluate('ancho', { ancho: value })).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_FORMULA_VARIABLE }),
    );
  });

  it('una división por cero no devuelve Infinity: falla', () => {
    expect(() => evaluator.evaluate('ancho / alto', { ancho: '1', alto: '0' })).toThrow(
      expect.objectContaining({ code: ErrorCode.FORMULA_EVALUATION_FAILED }),
    );
  });

  it('un error de cálculo (una función sin argumentos) responde FORMULA_EVALUATION_FAILED', () => {
    expect(() => evaluator.evaluate('max()', { ancho: '1' })).toThrow(
      expect.objectContaining({ code: ErrorCode.FORMULA_EVALUATION_FAILED }),
    );
  });

  it('un resultado demasiado grande falla en lugar de escribir millones de cifras', () => {
    const hugeProduct = Array.from({ length: 10 }, () => 'ancho').join(' * ');

    expect(() => evaluator.evaluate(hugeProduct, { ancho: '999999999999999' })).toThrow(
      expect.objectContaining({ code: ErrorCode.FORMULA_EVALUATION_FAILED }),
    );
  });

  it('evaluar también valida la fórmula: una fórmula guardada no se ejecuta sin pasar la lista blanca', () => {
    expect(() => evaluator.evaluate('ancho.constructor', { ancho: '1' })).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_FORMULA }),
    );
  });
});

describe('instancia endurecida de mathjs', () => {
  it.each(['import', 'createUnit', 'evaluate', 'parse', 'simplify', 'derivative', 'compile'])(
    '%s está deshabilitada',
    (functionName) => {
      const math = createHardenedMath();
      const disabledFunction: unknown = new Map(Object.entries(math)).get(functionName);

      expect(typeof disabledFunction).toBe('function');
      expect(() => (disabledFunction as () => unknown)()).toThrow(/disabled/);
    },
  );
});
