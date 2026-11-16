import cors from 'cors';
import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { ErrorCode } from '../../domain/errors/ErrorCode.js';
import { HttpStatus, buildErrorResponseBody } from './errors/errorResponse.js';

/**
 * CORS con lista blanca (H4). Solo los orígenes de la lista reciben `Access-Control-Allow-Origin`,
 * y con credenciales, porque el frontend envía la cookie de sesión.
 *
 * Un origen fuera de la lista no recibe cabeceras CORS: el navegador bloquea la respuesta.
 * Las peticiones sin `Origin` (servidor a servidor, curl) no son CORS y se atienden igual.
 */
export function createCorsMiddleware(allowedOrigins: readonly string[]): RequestHandler {
  const allowedOriginSet = new Set(allowedOrigins);
  return cors({
    origin: (origin, decide) => decide(null, origin !== undefined && allowedOriginSet.has(origin)),
    credentials: true,
  });
}

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

/**
 * Limitador de peticiones por IP (H6). La IP sale de `request.ip`, que respeta `trust proxy`:
 * sin proxy de confianza, X-Forwarded-For no cambia la IP y no sirve para conseguir cupo nuevo.
 *
 * El contador vive en memoria del proceso: con varias instancias, cada una cuenta por separado
 * (un almacén compartido llegará con el despliegue, F8).
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response) => {
      response
        .status(HttpStatus.TOO_MANY_REQUESTS)
        .json(buildErrorResponseBody(ErrorCode.TOO_MANY_REQUESTS, 'Too many requests, try again later'));
    },
  });
}
