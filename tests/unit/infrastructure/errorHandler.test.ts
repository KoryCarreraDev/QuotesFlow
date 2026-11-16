import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/domain/errors/ApplicationError.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { UnauthorizedError } from '@/domain/errors/UnauthorizedError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { createErrorHandler, createRouteNotFoundHandler } from '@/infrastructure/web/middleware/errorHandler.js';
import { RecordingLogger } from '@tests/support/doubles/RecordingLogger.js';

// Regresión de H5: sin manejador global, "no encontrado" o "sin permiso" respondían 500 y,
// en desarrollo, la traza del error llegaba al cliente.

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_INTERNAL_SERVER_ERROR = 500;

interface ErrorResponseBody {
  error: { code: string; message: string; details?: unknown };
}

function createResponseDouble(headersSent = false) {
  const response = { headersSent, status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function handle(error: unknown, headersSent = false) {
  const response = createResponseDouble(headersSent);
  const next = vi.fn();
  const logger = new RecordingLogger();
  createErrorHandler(logger)(error, {} as Request, response as unknown as Response, next as NextFunction);
  const [body] = (response.json.mock.calls[0] ?? []) as [ErrorResponseBody | undefined];
  return { response, next, body, logger };
}

/** Error con la forma que lanza el parser de `express.json()` (body-parser). */
function bodyParserError(type: string, status: number): Error {
  return Object.assign(new Error(`body-parser ${type}`), { type, status, expose: true });
}

describe('createErrorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [new NotFoundError(ErrorCode.LEAD_NOT_FOUND, 'Lead not found'), HTTP_NOT_FOUND],
    [new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions'), HTTP_FORBIDDEN],
    [new ConflictError(ErrorCode.EMAIL_ALREADY_IN_USE, 'Email already in use'), HTTP_CONFLICT],
    [new UnauthorizedError(ErrorCode.INVALID_CREDENTIALS, 'Invalid Credentials'), HTTP_UNAUTHORIZED],
    [new ValidationError(ErrorCode.MISSING_REQUIRED_DATA, 'All information is required'), HTTP_BAD_REQUEST],
  ])('responde %s con su código HTTP y el formato único', (error, expectedStatus) => {
    const { response, body } = handle(error);

    expect(response.status).toHaveBeenCalledWith(expectedStatus);
    expect(body).toEqual({ error: { code: error.code, message: error.message } });
  });

  it('incluye el detalle de los campos inválidos de un error de validación', () => {
    const details = [{ path: ['email'], message: 'Invalid email address' }];

    const { body } = handle(new ValidationError(ErrorCode.VALIDATION_FAILED, 'Request body is invalid', details));

    expect(body).toEqual({
      error: { code: ErrorCode.VALIDATION_FAILED, message: 'Request body is invalid', details },
    });
  });

  it('un error inesperado responde 500 genérico, sin su mensaje ni la traza', () => {
    const unexpectedError = new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret');

    const { response, body } = handle(unexpectedError);

    expect(response.status).toHaveBeenCalledWith(HTTP_INTERNAL_SERVER_ERROR);
    expect(body).toEqual({ error: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' } });
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('registra en el servidor el error inesperado para poder diagnosticarlo', () => {
    const unexpectedError = new Error('unexpected failure');

    const { logger } = handle(unexpectedError);

    expect(logger.entries).toEqual([expect.objectContaining({ level: 'error', error: unexpectedError })]);
  });

  it('un valor lanzado que no es un Error también responde 500 genérico', () => {
    const { response, body } = handle('a thrown string');

    expect(response.status).toHaveBeenCalledWith(HTTP_INTERNAL_SERVER_ERROR);
    expect(body?.error.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('un JSON mal formado en el cuerpo responde 400 MALFORMED_JSON', () => {
    const { response, body } = handle(bodyParserError('entity.parse.failed', HTTP_BAD_REQUEST));

    expect(response.status).toHaveBeenCalledWith(HTTP_BAD_REQUEST);
    expect(body?.error.code).toBe(ErrorCode.MALFORMED_JSON);
  });

  it('un cuerpo por encima del límite responde 413 PAYLOAD_TOO_LARGE', () => {
    const { response, body } = handle(bodyParserError('entity.too.large', HTTP_PAYLOAD_TOO_LARGE));

    expect(response.status).toHaveBeenCalledWith(HTTP_PAYLOAD_TOO_LARGE);
    expect(body?.error.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
  });

  it('otro error del parser conserva su código 4xx y responde INVALID_REQUEST_BODY', () => {
    const { response, body } = handle(bodyParserError('encoding.unsupported', HTTP_UNSUPPORTED_MEDIA_TYPE));

    expect(response.status).toHaveBeenCalledWith(HTTP_UNSUPPORTED_MEDIA_TYPE);
    expect(body?.error.code).toBe(ErrorCode.INVALID_REQUEST_BODY);
  });

  it('un ApplicationError sin código HTTP asignado responde 500: es un fallo de programación', () => {
    class UnmappedError extends ApplicationError {
      constructor() {
        super(ErrorCode.INTERNAL_ERROR, 'Unmapped application error');
      }
    }

    const { response } = handle(new UnmappedError());

    expect(response.status).toHaveBeenCalledWith(HTTP_INTERNAL_SERVER_ERROR);
  });

  it('si la respuesta ya empezó a enviarse, delega en Express en lugar de escribir otra', () => {
    const error = new NotFoundError(ErrorCode.LEAD_NOT_FOUND, 'Lead not found');

    const { response, next } = handle(error, true);

    expect(response.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('createRouteNotFoundHandler', () => {
  it('una ruta que no existe responde 404 ROUTE_NOT_FOUND con el formato único', () => {
    const response = createResponseDouble();

    createRouteNotFoundHandler()({} as Request, response as unknown as Response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(HTTP_NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: ErrorCode.ROUTE_NOT_FOUND, message: 'Route not found' },
    });
  });
});
