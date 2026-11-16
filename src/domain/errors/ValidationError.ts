import { ApplicationError } from './ApplicationError.js';
import { ErrorCode } from './ErrorCode.js';

/** Un campo concreto de la entrada que no es válido. */
export interface ValidationIssue {
  /** Ruta del campo dentro del cuerpo, por ejemplo `['items', 0, 'quantity']`. */
  path: Array<string | number>;
  message: string;
}

/** La entrada de la petición no es válida. */
export class ValidationError extends ApplicationError {
  /**
   * @param details Campos inválidos, cuando el error viene de validar un cuerpo o una consulta.
   * @param options `cause` con el error original, que se queda en el servidor.
   */
  constructor(
    code: ErrorCode,
    message: string,
    readonly details: ValidationIssue[] = [],
    options?: ErrorOptions,
  ) {
    super(code, message, options);
  }
}
