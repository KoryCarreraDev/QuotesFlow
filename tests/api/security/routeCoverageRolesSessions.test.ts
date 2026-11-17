// Permisos por rol en las rutas de sesiones (F2-T02). Grupo propio por el cupo de peticiones por archivo.
import { describeRolePermissionCoverage } from '@tests/support/http/rolePermissionCoverage.js';

describeRolePermissionCoverage('sessions');
