import { Action, type Grant, permissionMatrix } from '../../src/application/policies/authorizationPolicy.js';
import { Role } from '../../src/domain/enums/Role.js';

// Genera `docs/security/matriz-permisos.md` a partir de `permissionMatrix` (F1-T04).
// El documento es lo que firma el responsable de seguridad, así que nunca se edita a mano.

const actionDescriptions: Record<Action, string> = {
  [Action.LEAD_LIST]: 'Listar leads (`GET /leads`, `GET /leads/search`)',
  [Action.LEAD_CREATE]: 'Crear un lead',
  [Action.LEAD_ASSIGN_TO_OTHERS]: 'Al crear, asignar el lead a otro usuario de la empresa',
  [Action.LEAD_UPDATE]: 'Modificar un lead',
  [Action.LEAD_REASSIGN]: 'Cambiar el responsable de un lead existente',
  [Action.LEAD_DELETE]: 'Borrar (suave) un lead',
  [Action.LEAD_STATUS_LIST]: 'Listar los estados de lead',
  [Action.LEAD_STATUS_CREATE]: 'Crear un estado de lead',
  [Action.LEAD_STATUS_UPDATE]: 'Modificar o reordenar los estados de lead',
  [Action.LEAD_STATUS_DELETE]: 'Borrar (suave) un estado que no es el predeterminado ni tiene leads',
  [Action.CONTACT_LIST]: 'Listar contactos',
  [Action.CONTACT_CREATE]: 'Crear un contacto',
  [Action.CONTACT_UPDATE]: 'Modificar un contacto',
  [Action.CONTACT_DELETE]: 'Borrar (suave) un contacto',
  [Action.CONTACT_ASSIGN_OWNER]: 'Elegir o cambiar el comercial responsable de un contacto',
  [Action.COMPANY_CONTACT_LIST]: 'Listar empresas cliente',
  [Action.COMPANY_CONTACT_CREATE]: 'Crear una empresa cliente',
  [Action.COMPANY_CONTACT_UPDATE]: 'Modificar una empresa cliente',
  [Action.COMPANY_CONTACT_DELETE]: 'Borrar (suave) una empresa cliente sin contactos activos',
  [Action.COMPANY_CONTACT_ASSIGN_OWNER]: 'Elegir o cambiar el comercial responsable de una empresa cliente',
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
    '- En `GET /api/v1/leads/search`, a un `SALES_REP` se le descarta cualquier filtro por `assignedToId` y se le fuerza el suyo; en los listados de contactos y empresas cliente, lo mismo con `ownerId`.',
    '- Un `SALES_REP` que crea un contacto o una empresa cliente queda como su responsable; solo puede vincular un contacto a una empresa cliente de la que es responsable.',
    '- Los clientes sin responsable (anteriores a F1-T17) solo los ven los roles de gestión hasta que se asignen (Q-005).',
    '',
    'Pendiente de decisiones ya tomadas: la gestión de usuarios por el líder comercial (D-17) llega con F2.',
    '',
    'Limitación conocida: `lead-status:list` todavía no consulta la política en el código, porque se permite a todos los roles; para esa acción no se cumple aún que un rol desconocido no tenga permisos. Contactos y empresas cliente la consultan desde F1-T17.',
    '',
    'Las pruebas de esta matriz contra la API están en `tests/api/security/roles.test.ts`.',
    '',
    '## Firma',
    '',
    'Aprobado por ______ el ____-__-__',
    '',
  ].join('\n');
}
