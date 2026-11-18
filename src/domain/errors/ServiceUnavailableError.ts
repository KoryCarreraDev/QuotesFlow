import { ApplicationError } from './ApplicationError.js';
import { ErrorCode } from './ErrorCode.js';

/** Un servicio externo del que depende la acción (por ejemplo, el correo) no la atendió; se puede reintentar. */
export class ServiceUnavailableError extends ApplicationError {
  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
  }
}
