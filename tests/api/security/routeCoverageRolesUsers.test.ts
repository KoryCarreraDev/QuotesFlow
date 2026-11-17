// Permisos por rol en las rutas de usuarios e invitaciones (F2-T05). Grupo propio por el cupo de peticiones.
import { describeRolePermissionCoverage } from '@tests/support/http/rolePermissionCoverage.js';

describeRolePermissionCoverage('users');
