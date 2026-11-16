import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApplicationError } from '../../../domain/errors/ApplicationError.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { HttpStatus, buildErrorResponseBody, sendApplicationError } from '../errors/errorResponse.js';

/** Forma de los errores que lanza el parser de `express.json()` (body-parser). */
interface BodyParserError {
  type: string;
  status: number;
}

const BODY_PARSER_MALFORMED_JSON = 'entity.parse.failed';
const BODY_PARSER_TOO_LARGE = 'entity.too.large';
const LOWEST_CLIENT_ERROR_STATUS = 400;
const LOWEST_SERVER_ERROR_STATUS = 500;

function isBodyParserError(error: unknown): error is BodyParserError {
  if (!(error instanceof Error)) return false;
  const { type, status } = error as Partial<BodyParserError>;
  return (
    typeof type === 'string' &&
    typeof status === 'number' &&
    status >= LOWEST_CLIENT_ERROR_STATUS &&
    status < LOWEST_SERVER_ERROR_STATUS
  );
}

function bodyParserErrorResponse(error: BodyParserError) {
  if (error.type === BODY_PARSER_MALFORMED_JSON) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: buildErrorResponseBody(ErrorCode.MALFORMED_JSON, 'Request body is not valid JSON'),
    };
  }
  if (error.type === BODY_PARSER_TOO_LARGE) {
    return {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      body: buildErrorResponseBody(ErrorCode.PAYLOAD_TOO_LARGE, 'Request body is too large'),
    };
  }
  return {
    status: error.status,
    body: buildErrorResponseBody(ErrorCode.INVALID_REQUEST_BODY, 'Request body could not be read'),
  };
}

/**
 * Manejador global de errores (H5). Se registra el último en `app.ts`.
 *
 * - `ApplicationError`: su código HTTP y `{ error: { code, message, details? } }`.
 * - Errores del parser de JSON: 400 o 413.
 * - Cualquier otro: 500 genérico. Su mensaje y su traza solo se registran en el servidor, porque
 *   pueden llevar datos internos (consultas, direcciones, credenciales de conexión).
 */
export function createErrorHandler(): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    // Con la respuesta a medias solo Express puede cerrarla bien (corta la conexión).
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof ApplicationError) {
      sendApplicationError(response, error);
      return;
    }

    if (isBodyParserError(error)) {
      const { status, body } = bodyParserErrorResponse(error);
      response.status(status).json(body);
      return;
    }

    // Hasta F1-T07 no hay logger estructurado; entonces este registro pasa al puerto ILogger.
    console.error('Unhandled error while processing request:', error);
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(buildErrorResponseBody(ErrorCode.INTERNAL_ERROR, 'Internal server error'));
  };
}

/** Respuesta para las rutas que no existen, con el mismo formato que el resto de errores. */
export function createRouteNotFoundHandler(): RequestHandler {
  return (_request, response) => {
    response.status(HttpStatus.NOT_FOUND).json(buildErrorResponseBody(ErrorCode.ROUTE_NOT_FOUND, 'Route not found'));
  };
}
