// F2-T02 (D-09, H2, H23): sesiones con token de acceso corto y refresh token rotatorio, de extremo a extremo.

import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { env } from '@/config/env.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER } from '@/infrastructure/services/JwtTokenService.js';
import {
  TEST_USER_PASSWORD,
  type TenantWithTeam,
  persistTenantWithTeam,
  testSessionIdFor,
} from '@tests/support/database/persistenceFactories.js';
import {
  REFRESH_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  buildSessionCookie,
  refreshCookieFor,
  sessionCookieFor,
} from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_WEEK = 604_800;
const TWO_HOURS_IN_SECONDS = 7_200;
const COOKIE_EXPIRED_IN_THE_PAST = /Expires=Thu, 01 Jan 1970/i;

type SetCookieHeader = string | string[] | undefined;

function cookieNamed(setCookieHeader: SetCookieHeader, name: string): string | undefined {
  const cookies = setCookieHeader === undefined ? [] : [setCookieHeader].flat();
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

/** `nombre=valor` de la cookie, listo para enviarlo de vuelta. */
function cookiePair(setCookieHeader: SetCookieHeader, name: string): string {
  return (cookieNamed(setCookieHeader, name) ?? '').split(';')[0];
}

async function loginAs(email: string) {
  return request(app).post(apiPaths.auth.login).send({ email, password: TEST_USER_PASSWORD });
}

describe('Sesiones (F2-T02)', () => {
  let company: TenantWithTeam;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
  });

  describe('cookies del login', () => {
    // Regresión de H23: la cookie duraba siempre 7 días, dijera lo que dijera JWT_EXPIRATION.
    it('la cookie de acceso caduca a la vez que el token (JWT_EXPIRATION)', async () => {
      const response = await loginAs(company.owner.email);

      const accessCookie = cookieNamed(response.headers['set-cookie'], SESSION_COOKIE_NAME) ?? '';
      expect(env.JWT_EXPIRATION).toBe('1h');
      expect(accessCookie).toMatch(new RegExp(`Max-Age=${SECONDS_PER_HOUR};`));
    });

    it('la cookie del refresh token es HttpOnly, SameSite=Strict, solo para /api/v1/auth y dura la sesión', async () => {
      const response = await loginAs(company.owner.email);

      const refreshCookie = cookieNamed(response.headers['set-cookie'], REFRESH_COOKIE_NAME) ?? '';
      expect(refreshCookie).toMatch(/;\s*HttpOnly/i);
      expect(refreshCookie).toMatch(/;\s*SameSite=Strict/i);
      expect(refreshCookie).toMatch(/;\s*Path=\/api\/v1\/auth/i);
      expect(refreshCookie).toMatch(new RegExp(`Max-Age=${SECONDS_PER_WEEK};`));
    });

    it('el login abre una sesión que guarda el hash del refresh token, nunca el token', async () => {
      const response = await loginAs(company.owner.email);

      const refreshToken = cookiePair(response.headers['set-cookie'], REFRESH_COOKIE_NAME).split('=')[1];
      const [sessionId, secret] = refreshToken.split('.');
      const storedSession = await prisma.userSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(storedSession.userId).toBe(company.owner.id);
      expect(storedSession.refreshTokenHash).not.toContain(secret);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('con el refresh token deja cookies nuevas y el token de acceso nuevo da acceso', async () => {
      const response = await request(app).post(apiPaths.auth.refresh).set('Cookie', refreshCookieFor(company.owner));

      expect(response.status).toBe(HTTP_OK);
      const newAccessCookie = cookiePair(response.headers['set-cookie'], SESSION_COOKIE_NAME);
      const newRefreshCookie = cookiePair(response.headers['set-cookie'], REFRESH_COOKIE_NAME);
      expect(newRefreshCookie).not.toBe(refreshCookieFor(company.owner));
      const protectedResponse = await request(app).get(apiPaths.leads.getAll).set('Cookie', newAccessCookie);
      expect(protectedResponse.status).toBe(HTTP_OK);
    });

    it('un refresh token reutilizado revoca la sesión, lo audita y ya no renueva', async () => {
      const firstRefresh = await request(app)
        .post(apiPaths.auth.refresh)
        .set('Cookie', refreshCookieFor(company.owner));
      const rotatedRefreshCookie = cookiePair(firstRefresh.headers['set-cookie'], REFRESH_COOKIE_NAME);

      const reuse = await request(app).post(apiPaths.auth.refresh).set('Cookie', refreshCookieFor(company.owner));
      const afterReuse = await request(app).post(apiPaths.auth.refresh).set('Cookie', rotatedRefreshCookie);

      expect(reuse.status).toBe(HTTP_UNAUTHORIZED);
      expect(afterReuse.status).toBe(HTTP_UNAUTHORIZED);
      const session = await prisma.userSession.findUniqueOrThrow({ where: { id: testSessionIdFor(company.owner.id) } });
      expect(session.revokedReason).toBe('REFRESH_TOKEN_REUSED');
      await expect(prisma.auditLog.findMany({ where: { action: 'SESSION_REUSE_DETECTED' } })).resolves.toHaveLength(1);
    });

    it('sin refresh token responde 401 INVALID_SESSION y borra las cookies', async () => {
      const response = await request(app).post(apiPaths.auth.refresh);

      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_SESSION);
      expect(cookieNamed(response.headers['set-cookie'], REFRESH_COOKIE_NAME)).toMatch(COOKIE_EXPIRED_IN_THE_PAST);
    });

    it('no usa el cupo estricto de login: renovar no compite con los intentos de contraseña', async () => {
      const response = await request(app).post(apiPaths.auth.refresh).set('Cookie', refreshCookieFor(company.owner));

      expect(response.headers['ratelimit-limit']).toBe(String(env.RATE_LIMIT_GLOBAL_MAX_REQUESTS));
    });
  });

  describe('token de acceso', () => {
    it('un token caducado responde 401 SESSION_EXPIRED, para que el frontend renueve', async () => {
      const issuedTwoHoursAgo = Math.floor(Date.now() / MILLISECONDS_PER_SECOND) - TWO_HOURS_IN_SECONDS;
      const expiredToken = jwt.sign(
        {
          tenantId: company.owner.tenantId,
          sid: testSessionIdFor(company.owner.id),
          iat: issuedTwoHoursAgo,
          exp: issuedTwoHoursAgo + SECONDS_PER_HOUR,
        },
        env.JWT_SECRET,
        { subject: company.owner.id, issuer: ACCESS_TOKEN_ISSUER, audience: ACCESS_TOKEN_AUDIENCE },
      );

      const response = await request(app).get(apiPaths.leads.getAll).set('Cookie', buildSessionCookie(expiredToken));

      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(response.body.error.code).toBe(ErrorCode.SESSION_EXPIRED);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('cierra la sesión: borra las cookies y el token de acceso aún vigente deja de valer', async () => {
      const accessCookie = sessionCookieFor(company.owner);

      const response = await request(app)
        .post(apiPaths.auth.logout)
        .set('Cookie', [accessCookie, refreshCookieFor(company.owner)]);
      const afterLogout = await request(app).get(apiPaths.leads.getAll).set('Cookie', accessCookie);

      expect(response.status).toBe(HTTP_NO_CONTENT);
      expect(cookieNamed(response.headers['set-cookie'], SESSION_COOKIE_NAME)).toMatch(COOKIE_EXPIRED_IN_THE_PAST);
      expect(afterLogout.status).toBe(HTTP_UNAUTHORIZED);
    });

    it('sin sesión responde igual: el frontend siempre puede limpiar', async () => {
      const response = await request(app).post(apiPaths.auth.logout);

      expect(response.status).toBe(HTTP_NO_CONTENT);
    });
  });

  describe('POST /api/v1/auth/logout-all', () => {
    it('cierra todas las sesiones del usuario, también la abierta en otro dispositivo', async () => {
      const otherDeviceLogin = await loginAs(company.salesRep.email);
      const otherDeviceAccess = cookiePair(otherDeviceLogin.headers['set-cookie'], SESSION_COOKIE_NAME);

      const response = await request(app)
        .post(apiPaths.auth.logoutAll)
        .set('Cookie', sessionCookieFor(company.salesRep));
      const otherDeviceAfter = await request(app).get(apiPaths.leads.getAll).set('Cookie', otherDeviceAccess);

      expect(response.status).toBe(HTTP_NO_CONTENT);
      expect(otherDeviceAfter.status).toBe(HTTP_UNAUTHORIZED);
      await expect(prisma.userSession.count({ where: { userId: company.salesRep.id, revokedAt: null } })).resolves.toBe(
        0,
      );
    });

    it('no cierra las sesiones de otros usuarios de la empresa', async () => {
      await request(app).post(apiPaths.auth.logoutAll).set('Cookie', sessionCookieFor(company.salesRep));

      const ownerResponse = await request(app)
        .get(apiPaths.leads.getAll)
        .set('Cookie', sessionCookieFor(company.owner));

      expect(ownerResponse.status).toBe(HTTP_OK);
    });
  });

  // Verificación de extremo a extremo de F2 (sección 10 de PLAN.md): login, refresh, logout.
  it('login → refresh → logout: tras cerrar la sesión, su refresh token ya no renueva', async () => {
    const login = await loginAs(company.owner.email);
    const refresh = await request(app)
      .post(apiPaths.auth.refresh)
      .set('Cookie', cookiePair(login.headers['set-cookie'], REFRESH_COOKIE_NAME));
    const currentRefreshCookie = cookiePair(refresh.headers['set-cookie'], REFRESH_COOKIE_NAME);

    const logout = await request(app).post(apiPaths.auth.logout).set('Cookie', currentRefreshCookie);
    const refreshAfterLogout = await request(app).post(apiPaths.auth.refresh).set('Cookie', currentRefreshCookie);

    expect([login.status, refresh.status, logout.status]).toEqual([HTTP_OK, HTTP_OK, HTTP_NO_CONTENT]);
    expect(refreshAfterLogout.status).toBe(HTTP_UNAUTHORIZED);
  });
});
