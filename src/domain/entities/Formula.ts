import crypto from 'crypto';
import { ErrorCode } from '../errors/ErrorCode.js';
import { ValidationError } from '../errors/ValidationError.js';

/** Variables máximas de una fórmula: las que el comercial tiene que llenar en cada ítem. */
export const MAXIMUM_FORMULA_VARIABLES = 20;

/** Variable que el comercial llena al cotizar: `name` aparece en la expresión, `label` es lo que ve. */
export interface FormulaVariable {
  name: string;
  label: string;
}

export interface FormulaData {
  name: string;
  /** Expresión validada por `IFormulaEvaluator` (lista blanca de nodos, F3-T03). */
  expression: string;
  variables: readonly FormulaVariable[];
}

/**
 * Fórmula de precio de una empresa (F3-T04). La sintaxis de la expresión la valida el evaluador; la entidad
 * garantiza que las variables no se repiten ni superan el máximo.
 */
export class Formula {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly name: string,
    readonly expression: string,
    readonly variables: readonly FormulaVariable[],
    readonly createdById: string,
    readonly createdAt?: Date,
    readonly updatedAt?: Date,
  ) {}

  /** @throws {ValidationError} `INVALID_FORMULA_VARIABLE` si hay variables repetidas o demasiadas. */
  static create(tenantId: string, createdById: string, data: FormulaData): Formula {
    const now = new Date();
    return Formula.restore({ id: crypto.randomUUID(), tenantId, createdById, ...data, createdAt: now, updatedAt: now });
  }

  /** @throws {ValidationError} `INVALID_FORMULA_VARIABLE` si hay variables repetidas o demasiadas. */
  static restore(
    record: FormulaData & { id: string; tenantId: string; createdById: string; createdAt?: Date; updatedAt?: Date },
  ): Formula {
    const variableNames = record.variables.map((variable) => variable.name);
    if (variableNames.length > MAXIMUM_FORMULA_VARIABLES) {
      throw new ValidationError(ErrorCode.INVALID_FORMULA_VARIABLE, 'Formula has too many variables');
    }
    if (new Set(variableNames).size !== variableNames.length) {
      throw new ValidationError(ErrorCode.INVALID_FORMULA_VARIABLE, 'Formula variable names must be unique');
    }
    return new Formula(
      record.id,
      record.tenantId,
      record.name,
      record.expression,
      record.variables.map((variable) => ({ name: variable.name, label: variable.label })),
      record.createdById,
      record.createdAt,
      record.updatedAt,
    );
  }

  get variableNames(): string[] {
    return this.variables.map((variable) => variable.name);
  }

  /** Fórmula con los cambios aplicados; comprueba otra vez las variables. */
  withChanges(changes: Partial<FormulaData>): Formula {
    return Formula.restore({
      id: this.id,
      tenantId: this.tenantId,
      createdById: this.createdById,
      name: changes.name ?? this.name,
      expression: changes.expression ?? this.expression,
      variables: changes.variables ?? this.variables,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }
}
