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
| `lead:list` | Listar leads (`getAll`, `filtered`) | Sí | Sí | Sí | Solo los suyos |
| `lead:create` | Crear un lead | Sí | Sí | Sí | Sí |
| `lead:assign-to-others` | Al crear, asignar el lead a otro usuario de la empresa | Sí | Sí | Sí | No |
| `lead:update` | Modificar un lead | Sí | Sí | Sí | Solo los suyos |
| `lead:reassign` | Cambiar el responsable de un lead existente | Sí | Sí | Sí | No |
| `lead:delete` | Borrar (suave) un lead | Sí | Sí | Sí | Solo los suyos |
| `lead-status:list` | Listar los estados de lead | Sí | Sí | Sí | Sí |
| `lead-status:create` | Crear un estado de lead | Sí | Sí | Sí | No |
| `lead-status:update` | Modificar o reordenar los estados de lead | Sí | Sí | Sí | No |
| `lead-status:delete` | Borrar (suave) un estado que no es el predeterminado ni tiene leads | Sí | Sí | Sí | No |
| `contact:list` | Listar contactos | Sí | Sí | Sí | Sí |
| `contact:create` | Crear un contacto | Sí | Sí | Sí | Sí |
| `contact:update` | Modificar un contacto | Sí | Sí | Sí | Sí |
| `contact:delete` | Borrar (suave) un contacto | Sí | Sí | Sí | No |
| `company-contact:list` | Listar empresas cliente | Sí | Sí | Sí | Sí |
| `company-contact:create` | Crear una empresa cliente | Sí | Sí | Sí | Sí |
| `company-contact:update` | Modificar una empresa cliente | Sí | Sí | Sí | Sí |
| `company-contact:delete` | Borrar (suave) una empresa cliente sin contactos activos | Sí | Sí | Sí | No |

Comportamientos que la tabla no muestra:

- Un `SALES_REP` que crea un lead queda como su responsable aunque envíe otro `assignedToId`.
- Un `SALES_REP` que modifica su lead no puede cambiar el responsable: el `assignedToId` que envíe se ignora.
- En `GET /api/lead/filtered`, a un `SALES_REP` se le descarta cualquier filtro por `assignedToId` y se le fuerza el suyo.

Pendiente de decisiones ya tomadas: la visibilidad de contactos por responsable (D-18) llega con F1-T17, y la gestión de usuarios por el líder comercial (D-17) con F2.

Limitación conocida: `contact:list`, `contact:create`, `contact:update`, sus equivalentes `company-contact:*` y `lead-status:list` todavía no consultan la política en el código, porque hoy se permiten a todos los roles. Para ellas no se cumple aún que un rol desconocido no tenga permisos. Se conectan en F1-T17, cuando la visibilidad por responsable (D-18) cambie su regla. Los borrados (`contact:delete`, `company-contact:delete`) sí consultan la política desde F1-T16.

Las pruebas de esta matriz contra la API están en `tests/api/security/roles.test.ts`.

## Firma

Aprobado por ______ el ____-__-__
