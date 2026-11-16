import { AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ILogger } from '../../../application/ports/services/ILogger.js';
import { runWithRequestContext } from '../../../cross-cutting/requestContext.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Se acepta el id que mande el balanceador o el frontend solo si es corto y sin caracteres raros:
// va tal cual a los logs, y un valor arbitrario permitiría inyectar líneas o falsificar entradas.
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

function requestIdFrom(incomingRequestId: unknown): string {
  return typeof incomingRequestId === 'string' && SAFE_REQUEST_ID_PATTERN.test(incomingRequestId)
    ? incomingRequestId
    : randomUUID();
}

/**
 * Abre el contexto de la petición (F1-T07): id de petición en la cabecera `X-Request-Id` de la
 * respuesta y disponible para todos los logs de esa petición.
 */
export function createRequestContextMiddleware(): RequestHandler {
  return (request, response, next) => {
    const requestId = requestIdFrom(request.get(REQUEST_ID_HEADER));
    response.setHeader(REQUEST_ID_HEADER, requestId);
    runWithRequestContext({ requestId }, next);
  };
}

/**
 * Una entrada de log por petición al terminar: método, ruta sin query (puede llevar datos
 * personales), código, duración e id de petición. Va después de `createRequestContextMiddleware`.
 */
export function createAccessLogMiddleware(logger: ILogger): RequestHandler {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();
    // `finish` se emite fuera del contexto asíncrono de la petición: bind lo conserva para el log.
    response.on(
      'finish',
      AsyncResource.bind(() => {
        const durationMs = Number((process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_MILLISECOND);
        logger.info('HTTP request completed', {
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs,
        });
      }),
    );
    next();
  };
}
