import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import app from '@/app.js';
import { env } from '@/config/env.js';
import { Role } from '@/domain/enums/Role.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import { persistTenantWithTeam } from '@tests/support/database/persistenceFactories.js';
import { buildSessionCookie, sendApiRequest, sessionCookieFor } from '@tests/support/http/apiClient.js';
import {
  type RouteInventoryEntry,
  apiPaths,
  authenticatedRoutes,
  buildConcretePath,
  describeRoute,
} from '@tests/support/http/apiRoutes.js';
import { itKnownDefect } from '@tests/support/knownDefect.js';

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const FIRST_ERROR_STATUS = 400;
const ONE_HOUR_IN_SECONDS = 3600;

// Cada ruta protegida se recorre en bucle: una ruta nueva en el inventario queda cubierta sin escribir nada más.
const protectedRouteCases = authenticatedRoutes.map((route) => ({ routeName: describeRoute(route), route }));

function requestProtectedRoute(route: RouteInventoryEntry) {
  return sendApiRequest(app, route.method, buildConcretePath(route, NON_EXISTENT_ID));
}

describe('Autenticación de las rutas protegidas', () => {
  it.each(protectedRouteCases)('$routeName responde 401 sin cookie de sesión', async ({ route }) => {
    const response = await requestProtectedRoute(route);

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
  });

  it.each(protectedRouteCases)('$routeName no atiende una petición con un token falsificado', async ({ route }) => {
    const forgedToken = jwt.sign(
      { sub: NON_EXISTENT_ID, tenantId: NON_EXISTENT_ID, role: Role.OWNER },
      'secret-that-is-not-the-server-secret',
    );

    const response = await requestProtectedRoute(route).set('Cookie', buildSessionCookie(forgedToken));

    expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
  });

  it('no atiende una petición con un token caducado', async () => {
    const company = await persistTenantWithTeam();
    const issuedTwoHoursAgo = Math.floor(Date.now() / 1000) - 2 * ONE_HOUR_IN_SECONDS;
    const expiredToken = jwt.sign(
      {
        sub: company.owner.id,
        tenantId: company.tenant.id,
        role: company.owner.role,
        iat: issuedTwoHoursAgo,
        exp: issuedTwoHoursAgo + ONE_HOUR_IN_SECONDS,
      },
      env.JWT_SECRET,
    );

    const response = await sendApiRequest(app, 'GET', apiPaths.leads.getAll).set(
      'Cookie',
      buildSessionCookie(expiredToken),
    );

    expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
  });

  it('no acepta el token en la cabecera Authorization: la sesión solo viaja en la cookie HttpOnly', async () => {
    const company = await persistTenantWithTeam();
    const [, sessionToken] = sessionCookieFor(company.owner).split('=');

    const response = await sendApiRequest(app, 'GET', apiPaths.leads.getAll).set(
      'Authorization',
      `Bearer ${sessionToken}`,
    );

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
  });

  it('atiende una petición con una cookie de sesión válida', async () => {
    const company = await persistTenantWithTeam();

    const response = await sendApiRequest(app, 'GET', apiPaths.leads.getAll).set(
      'Cookie',
      sessionCookieFor(company.owner),
    );

    expect(response.status).toBe(HTTP_OK);
  });

  itKnownDefect('H5', 'un token falsificado recibe 401, no un error interno', async () => {
    const forgedToken = jwt.sign(
      { sub: NON_EXISTENT_ID, tenantId: NON_EXISTENT_ID, role: Role.OWNER },
      'secret-that-is-not-the-server-secret',
    );

    const response = await sendApiRequest(app, 'GET', apiPaths.leads.getAll).set(
      'Cookie',
      buildSessionCookie(forgedToken),
    );

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
  });

  itKnownDefect('H2', 'un usuario desactivado después de iniciar sesión pierde el acceso', async () => {
    const company = await persistTenantWithTeam();
    const sessionCookie = sessionCookieFor(company.salesRep);
    const { default: prisma } = await import('@/config/database.js');
    await prisma.user.update({ where: { id: company.salesRep.id }, data: { isActive: false } });

    const response = await sendApiRequest(app, 'GET', apiPaths.leads.getAll).set('Cookie', sessionCookie);

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
  });
});
