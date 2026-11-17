// Ayudas para llamar a la API real con supertest.
//
// OJO con el límite global de peticiones (`src/app.ts`: 100 cada 15 minutos por IP, en memoria):
// cada archivo de test recibe una instancia nueva de la aplicación, así que el contador empieza en cero
// en cada archivo, pero un mismo archivo no puede superar `GLOBAL_RATE_LIMIT_MAX_REQUESTS` peticiones.

import type { Express } from 'express';
import request, { type Test } from 'supertest';
import { JwtTokenService } from '@/infrastructure/services/JwtTokenService.js';
import { testRefreshTokenFor, testSessionIdFor } from '@tests/support/database/persistenceFactories.js';
import type { HttpMethod } from './apiRoutes.js';

/** Máximo de peticiones por ventana que admite el limitador global de `src/app.ts`. */
export const GLOBAL_RATE_LIMIT_MAX_REQUESTS = 100;

/** Nombre de la cookie de sesión que emite el login. */
export const SESSION_COOKIE_NAME = 'accessToken';
/** Cookie del refresh token (F2-T02); solo viaja a /api/v1/auth. */
export const REFRESH_COOKIE_NAME = 'refreshToken';

export interface SessionUser {
  id: string;
  tenantId: string;
  role: string;
}

/**
 * Cookie de sesión válida para el usuario, firmada con el servicio real de tokens, sobre la sesión que
 * `persistUser` dejó abierta (F2-T02). Evita hacer login por HTTP en cada test (y gastar peticiones del
 * límite global). El rol no viaja en el token: lo lee la API de la base en cada petición.
 */
export function sessionCookieFor(user: SessionUser): string {
  const token = new JwtTokenService().generateToken({
    sub: user.id,
    tenantId: user.tenantId,
    sid: testSessionIdFor(user.id),
  });
  return buildSessionCookie(token);
}

/** Cookie con el refresh token de la sesión de test del usuario. */
export function refreshCookieFor(user: Pick<SessionUser, 'id'>): string {
  return `${REFRESH_COOKIE_NAME}=${testRefreshTokenFor(user.id)}`;
}

export function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}`;
}

/** Lanza una petición con el método indicado. Permite recorrer el inventario de rutas en bucle. */
export function sendApiRequest(app: Express, method: HttpMethod, path: string): Test {
  const agent = request(app);
  switch (method) {
    case 'GET':
      return agent.get(path);
    case 'POST':
      return agent.post(path);
    case 'PATCH':
      return agent.patch(path);
    case 'PUT':
      return agent.put(path);
    case 'DELETE':
      return agent.delete(path);
  }
}

/** Valor del parámetro `filters` del motor de filtrado, ya serializado. */
export function serializeFilters(filters: Array<{ field: string; operator: string; value: unknown }>): string {
  return JSON.stringify(filters);
}
