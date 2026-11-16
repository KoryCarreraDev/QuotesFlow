import { ApplicationError } from './ApplicationError.js';
import { ErrorCode } from './ErrorCode.js';

/** El recurso no existe o pertenece a otro tenant (la respuesta es la misma para no revelar cuál de los dos). */
export class NotFoundError extends ApplicationError {
  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
  }
}
