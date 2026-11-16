import { ApplicationError } from './ApplicationError.js';
import { ErrorCode } from './ErrorCode.js';

/** No hay sesión válida o las credenciales no son correctas. */
export class UnauthorizedError extends ApplicationError {
  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
  }
}
