import { ApplicationError } from './ApplicationError.js';
import { ErrorCode } from './ErrorCode.js';

/** El usuario está identificado pero su rol no le permite la acción. */
export class ForbiddenError extends ApplicationError {
  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
  }
}
