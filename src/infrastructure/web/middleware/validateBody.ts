import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodType } from 'zod';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ValidationError, type ValidationIssue } from '../../../domain/errors/ValidationError.js';
import { sendApplicationError } from '../errors/errorResponse.js';

function toValidationIssues(zodError: ZodError): ValidationIssue[] {
  // Solo ruta y mensaje: el valor recibido no se devuelve, puede ser una contraseña.
  return zodError.issues.map((issue) => ({
    path: issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
    message: issue.message,
  }));
}

/**
 * Valida el cuerpo con el esquema y lo sustituye por el resultado, sin los campos que el esquema no declara.
 * Un cuerpo inválido responde 400 `VALIDATION_FAILED`; cualquier otro error pasa al manejador global (H24).
 */
export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (!(error instanceof ZodError)) {
        next(error);
        return;
      }
      sendApplicationError(
        res,
        new ValidationError(ErrorCode.VALIDATION_FAILED, 'Request body is invalid', toValidationIssues(error)),
      );
    }
  };
}
