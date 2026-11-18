/**
 * Valores de las variables de una fórmula, como texto decimal no negativo (`"1.20"`), nunca como number.
 * La clave es el nombre de la variable.
 */
export type FormulaVariableValues = Readonly<Record<string, string>>;

/**
 * Evalúa las fórmulas de precio que escribe cada empresa (F3-T03). Una fórmula es código ajeno: el adaptador
 * solo acepta números, las variables declaradas, `+ - * /`, paréntesis y unas pocas funciones de redondeo.
 */
export interface IFormulaEvaluator {
  /**
   * Comprueba una fórmula al guardarla.
   *
   * @param declaredVariables Nombres de las variables que la fórmula puede usar.
   * @throws {ValidationError} `INVALID_FORMULA` si usa algo fuera de la lista blanca, una variable no declarada o
   * supera los límites; `INVALID_FORMULA_VARIABLE` si un nombre de variable no es válido.
   */
  validate(expression: string, declaredVariables: readonly string[]): void;

  /**
   * Calcula la fórmula con decimales exactos. Vuelve a aplicar la lista blanca antes de calcular.
   *
   * @returns El resultado como texto decimal, sin redondear (lo redondea `Money`).
   * @throws {ValidationError} `INVALID_FORMULA` si la fórmula no es válida; `INVALID_FORMULA_VARIABLE` si falta el
   * valor de una variable o no es un decimal no negativo; `FORMULA_EVALUATION_FAILED` si el resultado no es un
   * número finito dentro del rango de un importe (división por cero, desbordamiento).
   */
  evaluate(expression: string, values: FormulaVariableValues): string;
}
