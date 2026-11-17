import { z } from 'zod';
import { MAXIMUM_FORMULA_VARIABLES } from '../../domain/entities/Formula.js';

// F3-T04: la forma de la fórmula se valida aquí; la expresión y los nombres de variable los valida el evaluador
// endurecido (F3-T03), que es quien sabe qué es seguro ejecutar.

const MAXIMUM_NAME_LENGTH = 200;
const MAXIMUM_EXPRESSION_LENGTH = 500;
const MAXIMUM_VARIABLE_NAME_LENGTH = 40;
const MAXIMUM_LABEL_LENGTH = 100;

const formulaVariableSchema = z.object({
  name: z.string().min(1).max(MAXIMUM_VARIABLE_NAME_LENGTH).describe('Nombre en la expresión: letras, números y _'),
  label: z.string().trim().min(1).max(MAXIMUM_LABEL_LENGTH).describe('Lo que ve el comercial, por ejemplo "Ancho (m)"'),
});

const formulaName = z.string().trim().min(1).max(MAXIMUM_NAME_LENGTH);
const formulaExpression = z
  .string()
  .min(1)
  .max(MAXIMUM_EXPRESSION_LENGTH)
  .describe('Números, variables, + - * /, paréntesis, min, max, round, ceil, floor y abs');
const formulaVariables = z.array(formulaVariableSchema).max(MAXIMUM_FORMULA_VARIABLES);

export const createFormulaSchema = z.object({
  name: formulaName,
  expression: formulaExpression,
  variables: formulaVariables,
});

export const updateFormulaSchema = z
  .object({
    name: formulaName.optional(),
    expression: formulaExpression.optional(),
    variables: formulaVariables.optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), 'Send at least one field');
