import type { RequestHandler } from 'express';
import { ErrorCode } from '../../domain/errors/ErrorCode.js';
import { HttpStatus, buildErrorResponseBody } from '../../infrastructure/web/errors/errorResponse.js';

// Sondas para el orquestador (F1-T08). Públicas: no exigen sesión ni revelan nada interno.
// Se registran directamente en `app.ts` (no en un router) para que el inventario de rutas las vea.

/**
 * `GET /health` (vida): el proceso responde. No toca la base de datos, para que una caída de la base
 * no haga reiniciar todas las instancias a la vez.
 */
export function createLivenessHandler(): RequestHandler {
  return (_request, response) => {
    response.status(HttpStatus.OK).json({ status: 'ok', timestamp: new Date().toISOString() });
  };
}

/**
 * `GET /ready` (listo): además las dependencias responden; si no, 503 y el balanceador deja de
 * enviarle tráfico sin reiniciarla.
 *
 * @param isReady Comprobación de las dependencias; nunca debe lanzar.
 */
export function createReadinessHandler(isReady: () => Promise<boolean>): RequestHandler {
  return async (_request, response) => {
    if (await isReady()) {
      response.status(HttpStatus.OK).json({ status: 'ready' });
      return;
    }
    response
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json(buildErrorResponseBody(ErrorCode.SERVICE_UNAVAILABLE, 'Service is not ready'));
  };
}
