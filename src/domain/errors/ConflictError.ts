import { ApplicationError } from './ApplicationError.js';
import { ErrorCode } from './ErrorCode.js';

/** La acción choca con el estado actual de los datos (por ejemplo, un correo ya registrado). */
export class ConflictError extends ApplicationError {
  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
  }
}
