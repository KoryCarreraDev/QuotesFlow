import { describe, expect, it } from 'vitest';
import app from '@/app.js';
import { describeRoute, routeInventory } from '@tests/support/http/apiRoutes.js';
import { listRegisteredRoutes } from '@tests/support/http/registeredRoutes.js';

describe('Inventario de rutas (regla R5)', () => {
  it('toda ruta registrada en la aplicación está declarada en tests/support/http/apiRoutes.ts', () => {
    const declaredRoutes = routeInventory.map(describeRoute).sort();
    const knownPaths = routeInventory.map((route) => route.pattern);

    const registeredRoutes = listRegisteredRoutes(app, knownPaths).sort();

    // Si falla: se añadió, quitó o renombró una ruta. Hay que actualizar `routeInventory` y, con ello,
    // la ruta nueva entra sola en las suites de autenticación; añádela también a las de aislamiento y roles.
    expect(registeredRoutes).toEqual(declaredRoutes);
  });

  it('no declara dos veces la misma ruta', () => {
    const declaredRoutes = routeInventory.map(describeRoute);

    expect(new Set(declaredRoutes).size).toBe(declaredRoutes.length);
  });
});
