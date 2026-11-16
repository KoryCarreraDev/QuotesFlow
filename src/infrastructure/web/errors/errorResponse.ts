import type { Response } from 'express';
import { ApplicationError } from '../../../domain/errors/ApplicationError.js';
import { ConflictError } from '../../../domain/errors/ConflictError.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';
import { NotFoundError } from '../../../domain/errors/NotFoundError.js';
import { UnauthorizedError } from '../../../domain/errors/UnauthorizedError.js';
import { ValidationError, type ValidationIssue } from '../../../domain/errors/ValidationError.js';

export enum HttpStatus {
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  PAYLOAD_TOO_LARGE = 413,
  INTERNAL_SERVER_ERROR = 500,
}

/** Formato único de toda respuesta de error de la API. */
export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ValidationIssue[];
  };
}

const statusByErrorType: ReadonlyArray<[new (...parameters: never[]) => ApplicationError, HttpStatus]> = [
  [ValidationError, HttpStatus.BAD_REQUEST],
  [UnauthorizedError, HttpStatus.UNAUTHORIZED],
  [ForbiddenError, HttpStatus.FORBIDDEN],
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
];

/** Código HTTP de un error de la aplicación. Un tipo sin correspondencia es un fallo de programación: 500. */
export function httpStatusFor(error: ApplicationError): HttpStatus {
  const match = statusByErrorType.find(([errorType]) => error instanceof errorType);
  return match ? match[1] : HttpStatus.INTERNAL_SERVER_ERROR;
}

export function buildErrorResponseBody(
  code: ErrorCode,
  message: string,
  details?: ValidationIssue[],
): ErrorResponseBody {
  return { error: details && details.length > 0 ? { code, message, details } : { code, message } };
}

/** Responde un error de la aplicación con su código HTTP y el formato único. */
export function sendApplicationError(response: Response, error: ApplicationError): void {
  const details = error instanceof ValidationError ? error.details : undefined;
  response.status(httpStatusFor(error)).json(buildErrorResponseBody(error.code, error.message, details));
}
