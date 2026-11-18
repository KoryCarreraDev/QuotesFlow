// Permisos por rol en las rutas del catálogo: productos (F3-T02) y fórmulas de precio (F3-T04).
import { describeRolePermissionCoverage } from '@tests/support/http/rolePermissionCoverage.js';

describeRolePermissionCoverage('catalog');
