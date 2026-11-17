import cors from 'cors';
import type { Request, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { ErrorCode } from '../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../domain/errors/ForbiddenError.js';
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

// Métodos que no modifican datos (RFC 9110, 9.2.1): no necesitan protección CSRF.
const SAFE_HTTP_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
// Un navegador envía `Origin: null` desde iframes con sandbox, `data:` o redirecciones entre sitios:
// nunca es el frontend legítimo.
const OPAQUE_ORIGIN = 'null';

/**
 * Origen que declara el navegador: `Origin` y, si falta, el origen de `Referer`.
 * `undefined` si no hay ninguno (cliente que no es un navegador).
 */
function declaredOriginOf(request: Request): string | undefined {
  const origin = request.get('origin');
  if (origin !== undefined) return origin;

  const referer = request.get('referer');
  if (referer === undefined) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return OPAQUE_ORIGIN;
  }
}

/**
 * Protección CSRF por verificación de origen (F2-T07, D-14). Segunda barrera tras la cookie
 * `SameSite=Strict`: una petición que modifica datos (POST, PATCH, PUT, DELETE) desde un origen fuera de
 * `CORS_ALLOWED_ORIGINS` responde 403 `ORIGIN_NOT_ALLOWED` antes de llegar a la ruta.
 *
 * Sin `Origin` ni `Referer` se atiende: los navegadores siempre envían `Origin` en peticiones que modifican
 * entre orígenes, así que una petición sin ninguno viene de un cliente que no es un navegador (curl, otro
 * servidor) y que no puede llevar la cookie de la víctima.
 */
export function createOriginCheckMiddleware(allowedOrigins: readonly string[]): RequestHandler {
  const allowedOriginSet = new Set(allowedOrigins);
  return (request, _response, next) => {
    if (SAFE_HTTP_METHODS.has(request.method)) {
      next();
      return;
    }

    const declaredOrigin = declaredOriginOf(request);
    if (declaredOrigin === undefined || allowedOriginSet.has(declaredOrigin)) {
      next();
      return;
    }
    next(new ForbiddenError(ErrorCode.ORIGIN_NOT_ALLOWED, 'Request origin is not allowed'));
  };
}
