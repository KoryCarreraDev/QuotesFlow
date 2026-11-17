import type { CookieOptions, Request, Response } from 'express';
import type { IssuedSession } from '../../application/services/SessionIssuer.js';
import { durationToMilliseconds, env } from '../../config/env.js';

/** Cookie del token de acceso corto; viaja a toda la API. */
export const ACCESS_TOKEN_COOKIE = 'accessToken';
/** Cookie del refresh token; solo viaja a `/api/v1/auth`, donde se renueva o se cierra la sesión. */
export const REFRESH_TOKEN_COOKIE = 'refreshToken';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';
const ACCESS_TOKEN_COOKIE_PATH = '/';

// H23 (F2-T02): cada cookie caduca a la vez que su token, no a un plazo fijo.
const accessTokenLifetimeMs = durationToMilliseconds(env.JWT_EXPIRATION);
const refreshTokenLifetimeMs = durationToMilliseconds(env.REFRESH_TOKEN_EXPIRATION);

/** Vida absoluta de una sesión, para la política de sesiones. */
export const SESSION_LIFETIME_MS = refreshTokenLifetimeMs;

function baseCookieOptions(path: string): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    // D-14: frontend y API en el mismo sitio; ninguna petición de otro sitio lleva la sesión.
    sameSite: 'strict',
    path,
  };
}

/** Deja en el navegador los dos tokens de una sesión recién abierta o renovada. */
export function setSessionCookies(response: Response, session: IssuedSession): void {
  response.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, {
    ...baseCookieOptions(ACCESS_TOKEN_COOKIE_PATH),
    maxAge: accessTokenLifetimeMs,
  });
  response.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, {
    ...baseCookieOptions(REFRESH_TOKEN_COOKIE_PATH),
    maxAge: refreshTokenLifetimeMs,
  });
}

/** Borra las dos cookies de sesión (mismo `path` con el que se crearon, o el navegador no las borra). */
export function clearSessionCookies(response: Response): void {
  response.clearCookie(ACCESS_TOKEN_COOKIE, baseCookieOptions(ACCESS_TOKEN_COOKIE_PATH));
  response.clearCookie(REFRESH_TOKEN_COOKIE, baseCookieOptions(REFRESH_TOKEN_COOKIE_PATH));
}

function readCookie(request: Request, name: string): string | undefined {
  const cookies: unknown = request.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value: unknown = new Map(Object.entries(cookies)).get(name);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function readAccessTokenCookie(request: Request): string | undefined {
  return readCookie(request, ACCESS_TOKEN_COOKIE);
}

export function readRefreshTokenCookie(request: Request): string | undefined {
  return readCookie(request, REFRESH_TOKEN_COOKIE);
}
