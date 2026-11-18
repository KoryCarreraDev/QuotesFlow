import { all, create, type BigNumber, type MathJsInstance, type MathNode } from 'mathjs';
import type { FormulaVariableValues, IFormulaEvaluator } from '../../application/ports/services/IFormulaEvaluator.js';
import { ErrorCode } from '../../domain/errors/ErrorCode.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

// F3-T03: evaluador de fórmulas endurecido. Una fórmula la escribe el dueño de cada empresa y la API la ejecuta,
// así que se trata como código ajeno: nunca se llama a `evaluate` sobre el texto; se analiza, se recorre el árbol
// con una lista blanca de nodos y solo entonces se calcula, con BigNumber (decimales exactos).

/** Longitud máxima del texto de una fórmula. */
export const MAXIMUM_EXPRESSION_LENGTH = 500;
/** Nodos máximos del árbol: limita el coste de una fórmula corta pero muy anidada. */
export const MAXIMUM_EXPRESSION_NODES = 100;
/** Longitud máxima del nombre de una variable. */
export const MAXIMUM_VARIABLE_NAME_LENGTH = 40;

// Precisión de BigNumber: muy por encima de las 15 cifras enteras y 6 decimales que admite una variable.
const BIG_NUMBER_PRECISION = 64;
// Constantes y variables: hasta 15 cifras enteras (como un importe, F3-T01) y 6 decimales (medidas).
const MAXIMUM_INTEGER_DIGITS = 15;
const MAXIMUM_DECIMAL_DIGITS = 6;
const MAXIMUM_MAGNITUDE_TEXT = '1e15';

const VARIABLE_NAME_PATTERN = /^[A-Za-z_]\w*$/;
const DIGITS_ONLY_PATTERN = /^\d+$/;
const DECIMAL_SEPARATOR = '.';

// Operadores permitidos, por el nombre de la función de mathjs que ejecutan. Sin potencia ni factorial: con ellos
// una fórmula corta produce números de millones de cifras.
const ALLOWED_OPERATOR_FUNCTIONS: ReadonlySet<string> = new Set([
  'add',
  'subtract',
  'multiply',
  'divide',
  'unaryMinus',
  'unaryPlus',
]);
// Funciones permitidas: solo comparar y redondear.
const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set(['min', 'max', 'round', 'ceil', 'floor', 'abs']);

// Funciones de mathjs que permiten ejecutar código, redefinir el entorno o volver a analizar texto. Se deshabilitan
// en la instancia aunque la lista blanca ya impide llamarlas (defensa en profundidad, guía de seguridad de mathjs).
const DISABLED_FUNCTIONS = ['import', 'createUnit', 'evaluate', 'parse', 'simplify', 'derivative', 'compile'];

function invalidFormula(reason: string): ValidationError {
  return new ValidationError(ErrorCode.INVALID_FORMULA, `Formula is not allowed: ${reason}`);
}

function invalidVariable(reason: string): ValidationError {
  return new ValidationError(ErrorCode.INVALID_FORMULA_VARIABLE, `Formula variable is not valid: ${reason}`);
}

function evaluationFailed(reason: string): ValidationError {
  return new ValidationError(ErrorCode.FORMULA_EVALUATION_FAILED, `Formula could not be evaluated: ${reason}`);
}

/** `true` si el texto es un decimal no negativo con como mucho 15 cifras enteras y 6 decimales. */
function isAllowedDecimalText(text: string): boolean {
  const [integerDigits, decimalDigits, ...extraParts] = text.split(DECIMAL_SEPARATOR);
  const hasValidInteger = DIGITS_ONLY_PATTERN.test(integerDigits) && integerDigits.length <= MAXIMUM_INTEGER_DIGITS;
  const hasValidDecimals =
    decimalDigits === undefined ||
    (DIGITS_ONLY_PATTERN.test(decimalDigits) && decimalDigits.length <= MAXIMUM_DECIMAL_DIGITS);
  return extraParts.length === 0 && hasValidInteger && hasValidDecimals;
}

/**
 * Instancia propia de mathjs con BigNumber y sin las funciones peligrosas. Se exporta para poder comprobar en los
 * tests que siguen deshabilitadas.
 */
export function createHardenedMath(): MathJsInstance {
  const math = create(all, { number: 'BigNumber', precision: BIG_NUMBER_PRECISION });
  const disabledFunctions = Object.fromEntries(
    DISABLED_FUNCTIONS.map((functionName) => [
      functionName,
      () => {
        throw new Error(`Function ${functionName} is disabled`);
      },
    ]),
  );
  math.import(disabledFunctions, { override: true });
  return math;
}

/** Recorre el árbol de una fórmula y rechaza todo lo que no esté en la lista blanca. */
class FormulaTreeValidator {
  private visitedNodes = 0;
  readonly usedVariables = new Set<string>();

  constructor(
    private readonly math: MathJsInstance,
    private readonly isAllowedVariable: (name: string) => boolean,
  ) {}

  validate(node: MathNode): void {
    this.visitedNodes += 1;
    if (this.visitedNodes > MAXIMUM_EXPRESSION_NODES) throw invalidFormula('too many terms');

    if (this.math.isConstantNode(node)) return this.validateConstant(node.value);
    if (this.math.isSymbolNode(node)) return this.validateVariable(node.name);
    if (this.math.isParenthesisNode(node)) return this.validate(node.content);
    if (this.math.isOperatorNode(node)) {
      if (!ALLOWED_OPERATOR_FUNCTIONS.has(node.fn)) throw invalidFormula(`operator ${node.op}`);
      return node.args.forEach((argument) => this.validate(argument));
    }
    if (this.math.isFunctionNode(node)) {
      const functionName = this.math.isSymbolNode(node.fn) ? node.fn.name : undefined;
      if (functionName === undefined || !ALLOWED_FUNCTIONS.has(functionName)) {
        throw invalidFormula(`function ${functionName ?? 'expression'}`);
      }
      return node.args.forEach((argument) => this.validate(argument));
    }
    throw invalidFormula(node.type);
  }

  private validateConstant(value: unknown): void {
    const isBigNumber = this.math.isBigNumber(value);
    if (!isBigNumber || !isAllowedDecimalText(value.toFixed())) throw invalidFormula('number out of range');
  }

  private validateVariable(name: string): void {
    if (!this.isAllowedVariable(name)) throw invalidFormula(`unknown variable ${name}`);
    this.usedVariables.add(name);
  }
}

/** Adaptador de `IFormulaEvaluator` sobre mathjs (F3-T03). */
export class MathjsFormulaEvaluator implements IFormulaEvaluator {
  private readonly math = createHardenedMath();
  // `parse` se toma de una instancia aparte: en `this.math` está deshabilitada.
  private readonly parseExpression = create(all, {
    number: 'BigNumber',
    precision: BIG_NUMBER_PRECISION,
  }).parse;

  validate(expression: string, declaredVariables: readonly string[]): void {
    declaredVariables.forEach(assertValidVariableName);
    const declared = new Set(declaredVariables);
    this.analyze(expression, (name) => declared.has(name));
  }

  evaluate(expression: string, values: FormulaVariableValues): string {
    const valueByName = new Map(Object.entries(values));
    const { tree, usedVariables } = this.analyze(expression, isValidVariableName);

    const scope = new Map<string, BigNumber>();
    for (const name of usedVariables) {
      const value = valueByName.get(name);
      if (value === undefined) throw invalidVariable(`missing value for ${name}`);
      if (!isAllowedDecimalText(value)) throw invalidVariable(`value of ${name} must be a non-negative decimal`);
      scope.set(name, this.math.bignumber(value));
    }

    return this.toResultText(this.compute(tree, scope));
  }

  private analyze(
    expression: string,
    isAllowedVariable: (name: string) => boolean,
  ): { tree: MathNode; usedVariables: ReadonlySet<string> } {
    if (expression.trim() === '') throw invalidFormula('empty formula');
    if (expression.length > MAXIMUM_EXPRESSION_LENGTH) throw invalidFormula('formula is too long');

    let tree: MathNode;
    try {
      tree = this.parseExpression(expression);
    } catch {
      throw invalidFormula('syntax error');
    }
    const validator = new FormulaTreeValidator(this.math, isAllowedVariable);
    validator.validate(tree);
    return { tree, usedVariables: validator.usedVariables };
  }

  private compute(tree: MathNode, scope: Map<string, BigNumber>): unknown {
    try {
      return tree.compile().evaluate(scope);
    } catch {
      throw evaluationFailed('calculation error');
    }
  }

  private toResultText(result: unknown): string {
    if (!this.math.isBigNumber(result) || !result.isFinite()) throw evaluationFailed('result is not a finite number');
    if (result.abs().greaterThanOrEqualTo(MAXIMUM_MAGNITUDE_TEXT)) throw evaluationFailed('result is too large');
    return result.toFixed();
  }
}

function isValidVariableName(name: string): boolean {
  return (
    name.length <= MAXIMUM_VARIABLE_NAME_LENGTH && VARIABLE_NAME_PATTERN.test(name) && !ALLOWED_FUNCTIONS.has(name)
  );
}

function assertValidVariableName(name: string): void {
  if (!isValidVariableName(name)) throw invalidVariable(`invalid name ${name}`);
}
