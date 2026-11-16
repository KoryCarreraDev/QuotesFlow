// Matriz de permisos contra la API en las rutas de contactos y empresas cliente (R5, F1-T05).
// Está separada de `routeCoverageRoles.test.ts` por el cupo de 100 peticiones por archivo.

import { describeRolePermissionCoverage } from '@tests/support/http/rolePermissionCoverage.js';

describeRolePermissionCoverage('contacts');
