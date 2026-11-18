# Matriz de permisos

> Generado por `pnpm docs:permissions` desde `src/application/policies/authorizationPolicy.ts` (F1-T04).
> No se edita a mano: un test falla si este archivo no coincide con el código.

Todo permiso vale solo dentro de la empresa (tenant) de la sesión: un recurso de otra empresa responde 404 sea cual sea el rol (`tests/api/security/tenantIsolation.test.ts`).

- **Sí**: sobre cualquier recurso de su empresa.
- **Solo los suyos**: solo sobre los recursos de los que es responsable (en leads, `assignedToId`).
- **No**: la API responde 403 `INSUFFICIENT_PERMISSIONS`.
- Un rol que no aparece en la matriz no tiene ningún permiso.

| Acción | Qué permite | OWNER | PARTNER | SALES_LEADER | SALES_REP |
|---|---|---|---|---|---|
| `lead:list` | Listar leads (`GET /leads`, `GET /leads/search`) | Sí | Sí | Sí | Solo los suyos |
| `lead:create` | Crear un lead | Sí | Sí | Sí | Sí |
| `lead:assign-to-others` | Al crear, asignar el lead a otro usuario de la empresa | Sí | Sí | Sí | No |
| `lead:update` | Modificar un lead | Sí | Sí | Sí | Solo los suyos |
| `lead:reassign` | Cambiar el responsable de un lead existente | Sí | Sí | Sí | No |
| `lead:delete` | Borrar (suave) un lead | Sí | Sí | Sí | Solo los suyos |
| `lead-status:list` | Listar los estados de lead | Sí | Sí | Sí | Sí |
| `lead-status:create` | Crear un estado de lead | Sí | Sí | Sí | No |
| `lead-status:update` | Modificar o reordenar los estados de lead | Sí | Sí | Sí | No |
| `lead-status:delete` | Borrar (suave) un estado que no es el predeterminado ni tiene leads | Sí | Sí | Sí | No |
| `contact:list` | Listar contactos | Sí | Sí | Sí | Solo los suyos |
| `contact:create` | Crear un contacto | Sí | Sí | Sí | Sí |
| `contact:update` | Modificar un contacto | Sí | Sí | Sí | Solo los suyos |
| `contact:assign-owner` | Elegir o cambiar el comercial responsable de un contacto | Sí | Sí | Sí | No |
| `contact:delete` | Borrar (suave) un contacto | Sí | Sí | Sí | No |
| `company-contact:list` | Listar empresas cliente | Sí | Sí | Sí | Solo los suyos |
| `company-contact:create` | Crear una empresa cliente | Sí | Sí | Sí | Sí |
| `company-contact:update` | Modificar una empresa cliente | Sí | Sí | Sí | Solo los suyos |
| `company-contact:assign-owner` | Elegir o cambiar el comercial responsable de una empresa cliente | Sí | Sí | Sí | No |
| `company-contact:delete` | Borrar (suave) una empresa cliente sin contactos activos | Sí | Sí | Sí | No |
| `session:revoke-own` | Cerrar todas sus propias sesiones (`POST /auth/logout-all`) | Sí | Sí | Sí | Sí |
| `user:list` | Listar los usuarios y las invitaciones pendientes de la empresa | Sí | Sí | Sí | No |
| `user:invite` | Invitar usuarios y revocar invitaciones (solo de los roles que gestiona) | Sí | Sí | Sí | No |
| `user:manage` | Cambiar el rol, desactivar o reactivar usuarios (solo de los roles que gestiona) | Sí | Sí | Sí | No |
| `tenant:view` | Ver el perfil de la empresa y descargar su logo (`GET /tenant`, `GET /tenant/logo`) | Sí | Sí | Sí | Sí |
| `tenant:update` | Cambiar el perfil y la configuración de la empresa, y subir o quitar su logo (`PATCH /tenant`, `PUT` y `DELETE /tenant/logo`) | Sí | Sí | No | No |
| `product:list` | Buscar y consultar el catálogo de productos (`GET /products/search`) | Sí | Sí | Sí | Sí |
| `product:create` | Crear un producto | Sí | Sí | Sí | No |
| `product:update` | Modificar un producto (nombre, precio, fórmula, activo) | Sí | Sí | Sí | No |
| `product:delete` | Borrar (suave) un producto | Sí | Sí | Sí | No |
| `formula:list` | Buscar y consultar las fórmulas de precio y sus variables (`GET /formulas/search`) | Sí | Sí | Sí | Sí |
| `formula:create` | Crear una fórmula de precio | Sí | Sí | Sí | No |
| `formula:update` | Modificar una fórmula de precio | Sí | Sí | Sí | No |
| `formula:delete` | Borrar (suave) una fórmula que ningún producto usa | Sí | Sí | Sí | No |
| `quote:list` | Buscar y consultar cotizaciones (`GET /quotes/search`, `GET /quotes/:id`) | Sí | Sí | Sí | Solo los suyos |
| `quote:create` | Crear una cotización (borrador) | Sí | Sí | Sí | Sí |
| `quote:update` | Modificar un borrador o crear la versión siguiente de una cotización (`POST /quotes/:id/revise`) | Sí | Sí | Sí | Solo los suyos |
| `quote:delete` | Borrar (suave) un borrador | Sí | Sí | Sí | Solo los suyos |
| `quote:send` | Enviar una cotización (`POST /quotes/:id/send`) | Sí | Sí | Sí | Solo los suyos |
| `quote:decide` | Registrar que el cliente aceptó o rechazó (`POST /quotes/:id/accept`, `/reject`) | Sí | Sí | Sí | Solo los suyos |

Comportamientos que la tabla no muestra:

- Un `SALES_REP` que crea un lead queda como su responsable aunque envíe otro `assignedToId`.
- Un `SALES_REP` que modifica su lead no puede cambiar el responsable: el `assignedToId` que envíe se ignora.
- En `GET /api/v1/leads/search`, a un `SALES_REP` se le descarta cualquier filtro por `assignedToId` y se le fuerza el suyo; en los listados de contactos y empresas cliente, lo mismo con `ownerId`.
- Un `SALES_REP` que crea un contacto o una empresa cliente queda como su responsable; solo puede vincular un contacto a una empresa cliente de la que es responsable.
- Los clientes sin responsable (anteriores a F1-T17) solo los ven los roles de gestión hasta que se asignen (Q-005).

## Roles que cada rol invita y gestiona (D-16, D-17)

Además de tener `user:invite` o `user:manage`, el rol de la persona invitada o gestionada (el actual y el nuevo, si cambia) tiene que estar en esta lista. Nadie gestiona al dueño ni su propia cuenta.

| Rol | Gestiona a |
|---|---|
| OWNER | PARTNER, SALES_LEADER, SALES_REP |
| PARTNER | PARTNER, SALES_LEADER, SALES_REP |
| SALES_LEADER | SALES_REP |
| SALES_REP | Ninguno |

Limitación conocida: `lead-status:list` todavía no consulta la política en el código, porque se permite a todos los roles; para esa acción no se cumple aún que un rol desconocido no tenga permisos. Contactos y empresas cliente la consultan desde F1-T17.

Las pruebas de esta matriz contra la API están en `tests/api/security/roles.test.ts`.

## Firma

Aprobado por ______ el ____-__-__
