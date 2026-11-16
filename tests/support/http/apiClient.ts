// Ayudas para llamar a la API real con supertest.
//
// OJO con el límite global de peticiones (`src/app.ts`: 100 cada 15 minutos por IP, en memoria):
// cada archivo de test recibe una instancia nueva de la aplicación, así que el contador empieza en cero
// en cada archivo, pero un mismo archivo no puede superar `GLOBAL_RATE_LIMIT_MAX_REQUESTS` peticiones.

import type { Express } from 'express';
import request, { type Test } from 'supertest';
import { JwTokenService } from '@/infrastructure/services/JwtTokenService.js';
import type { HttpMethod } from './apiRoutes.js';

/** Máximo de peticiones por ventana que admite el limitador global de `src/app.ts`. */
export const GLOBAL_RATE_LIMIT_MAX_REQUESTS = 100;

/** Nombre de la cookie de sesión que emite el login. */
export const SESSION_COOKIE_NAME = 'accessToken';

export interface SessionUser {
  id: string;
  tenantId: string;
  role: string;
}

/**
 * Cookie de sesión válida para el usuario, firmada con el servicio real de tokens.
 * Evita hacer login por HTTP en cada test (y gastar peticiones del límite global).
 */
export function sessionCookieFor(user: SessionUser): string {
  const token = new JwTokenService().generateToken({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
  });
  return buildSessionCookie(token);
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
