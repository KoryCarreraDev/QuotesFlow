import { Action, type Grant, permissionMatrix } from '../../src/application/policies/authorizationPolicy.js';
import { Role } from '../../src/domain/enums/Role.js';

// Genera `docs/security/matriz-permisos.md` a partir de `permissionMatrix` (F1-T04).
// El documento es lo que firma el responsable de seguridad, así que nunca se edita a mano.

const actionDescriptions: Record<Action, string> = {
  [Action.LEAD_LIST]: 'Listar leads (`getAll`, `filtered`)',
  [Action.LEAD_CREATE]: 'Crear un lead',
  [Action.LEAD_ASSIGN_TO_OTHERS]: 'Al crear, asignar el lead a otro usuario de la empresa',
  [Action.LEAD_UPDATE]: 'Modificar un lead',
  [Action.LEAD_REASSIGN]: 'Cambiar el responsable de un lead existente',
  [Action.LEAD_DELETE]: 'Borrar (suave) un lead',
  [Action.LEAD_STATUS_LIST]: 'Listar los estados de lead',
  [Action.LEAD_STATUS_CREATE]: 'Crear un estado de lead',
  [Action.LEAD_STATUS_UPDATE]: 'Modificar un estado de lead',
  [Action.CONTACT_LIST]: 'Listar contactos',
  [Action.CONTACT_CREATE]: 'Crear un contacto',
  [Action.CONTACT_UPDATE]: 'Modificar un contacto',
  [Action.COMPANY_CONTACT_LIST]: 'Listar empresas cliente',
  [Action.COMPANY_CONTACT_CREATE]: 'Crear una empresa cliente',
  [Action.COMPANY_CONTACT_UPDATE]: 'Modificar una empresa cliente',
};

const grantLabels = new Map<Grant, string>([
  ['all', 'Sí'],
  ['own', 'Solo los suyos'],
  ['none', 'No'],
]);

const descriptionsByAction = new Map<string, string>(Object.entries(actionDescriptions));

const roleColumns = [Role.OWNER, Role.PARTNER, Role.SALES_LEADER, Role.SALES_REP];

function renderMatrixRow([action, grantsByRole]: [string, Readonly<Record<Role, Grant>>]): string {
  const grants = new Map<string, Grant>(Object.entries(grantsByRole));
  const cells = roleColumns.map((role) => grantLabels.get(grants.get(role) ?? 'none'));
  return `| \`${action}\` | ${descriptionsByAction.get(action)} | ${cells.join(' | ')} |`;
}

/** Contenido completo de `docs/security/matriz-permisos.md`. */
export function renderPermissionMatrixDocument(): string {
  const header = `| Acción | Qué permite | ${roleColumns.join(' | ')} |`;
  const separator = `|---|---|${roleColumns.map(() => '---').join('|')}|`;
  const rows = Object.entries(permissionMatrix).map(renderMatrixRow);

  return [
    '# Matriz de permisos',
    '',
    '> Generado por `pnpm docs:permissions` desde `src/application/policies/authorizationPolicy.ts` (F1-T04).',
    '> No se edita a mano: un test falla si este archivo no coincide con el código.',
    '',
    'Todo permiso vale solo dentro de la empresa (tenant) de la sesión: un recurso de otra empresa responde 404 sea cual sea el rol (`tests/api/security/tenantIsolation.test.ts`).',
    '',
    '- **Sí**: sobre cualquier recurso de su empresa.',
    '- **Solo los suyos**: solo sobre los recursos de los que es responsable (en leads, `assignedToId`).',
    '- **No**: la API responde 403 `INSUFFICIENT_PERMISSIONS`.',
    '- Un rol que no aparece en la matriz no tiene ningún permiso.',
    '',
    header,
    separator,
    ...rows,
    '',
    'Comportamientos que la tabla no muestra:',
    '',
    '- Un `SALES_REP` que crea un lead queda como su responsable aunque envíe otro `assignedToId`.',
    '- Un `SALES_REP` que modifica su lead no puede cambiar el responsable: el `assignedToId` que envíe se ignora.',
    '- En `GET /api/lead/filtered`, a un `SALES_REP` se le descarta cualquier filtro por `assignedToId` y se le fuerza el suyo.',
    '',
    'Pendiente de decisiones ya tomadas: la visibilidad de contactos por responsable (D-18) llega con F1-T17, y la gestión de usuarios por el líder comercial (D-17) con F2.',
    '',
    'Limitación conocida: las acciones `contact:*`, `company-contact:*` y `lead-status:list` todavía no consultan la política en el código, porque hoy se permiten a todos los roles. Para ellas no se cumple aún que un rol desconocido no tenga permisos. Se conectan a la política en F1-T16 y F1-T17, cuando su regla deje de ser la misma para todos.',
    '',
    'Las pruebas de esta matriz contra la API están en `tests/api/security/roles.test.ts`.',
    '',
    '## Firma',
    '',
    'Aprobado por ______ el ____-__-__',
    '',
  ].join('\n');
}
