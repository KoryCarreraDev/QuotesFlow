// Rutas protegidas con un token falsificado. Va aparte de `authentication.test.ts` porque cada archivo de tests de API
// tiene un cupo de 100 peticiones (limitador global) y el inventario de rutas ya no cabe dos veces en uno.

import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import app from '@/app.js';
import { Role } from '@/domain/enums/Role.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import { buildSessionCookie, sendApiRequest } from '@tests/support/http/apiClient.js';
import { authenticatedRoutes, buildConcretePath, describeRoute } from '@tests/support/http/apiRoutes.js';

const FIRST_ERROR_STATUS = 400;

const protectedRouteCases = authenticatedRoutes.map((route) => ({ routeName: describeRoute(route), route }));

describe('Autenticación de las rutas protegidas: token falsificado', () => {
  it.each(protectedRouteCases)('$routeName no atiende una petición con un token falsificado', async ({ route }) => {
    const forgedToken = jwt.sign(
      { sub: NON_EXISTENT_ID, tenantId: NON_EXISTENT_ID, role: Role.OWNER },
      'secret-that-is-not-the-server-secret',
    );

    const response = await sendApiRequest(app, route.method, buildConcretePath(route, NON_EXISTENT_ID)).set(
      'Cookie',
      buildSessionCookie(forgedToken),
    );

    expect(response.status).toBeGreaterThanOrEqual(FIRST_ERROR_STATUS);
  });
});
