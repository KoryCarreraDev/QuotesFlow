// Matriz de permisos contra la API en las rutas de leads y estados (R5, F1-T05).
// La lógica está en `tests/support/http/rolePermissionCoverage.ts`; contactos y empresas cliente,
// en `routeCoverageRolesContacts.test.ts`. Los casos de negocio concretos están en `roles.test.ts`.

import { describeRolePermissionCoverage } from '@tests/support/http/rolePermissionCoverage.js';

describeRolePermissionCoverage('leads');
