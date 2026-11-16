# Filtrado genérico

## Propósito
Un mismo motor de búsqueda, filtros, orden y paginación para todos los listados (`/filtered`), con una lista blanca de campos por entidad, para que el frontend pueda construir tablas y buscadores sin un endpoint por combinación.

## Reglas de negocio
- Parámetros: `search`, `filters` (JSON), `page`, `limit`, `sortBy`, `sortDir`.
- `filters` es una lista JSON de `{ field, operator, value }`, como mucho 20. Solo valen los campos y operadores de la configuración de la entidad (`src/infrastructure/persistence/filters/*FilterConfig.ts`).
- Cada campo declara su tipo y el valor tiene que serlo (H11): `text` (texto de 200 caracteres como máximo), `number`, `date` (`2026-01-31` o ISO con zona) o `id` (uuid). `in` exige una lista de 1 a 100 valores.
- Operadores: `contains` (sin distinguir mayúsculas), `equals`, `in`, `gt`, `gte`, `lt`, `lte`.
- `search` busca con `contains` en los campos marcados como buscables (200 caracteres como máximo).
- `page` por defecto 1; `limit` por defecto 20 y como mucho 100. Un valor inválido vuelve al de por defecto.
- Orden: `sortBy` solo sobre campos `sortable`; `sortDir` `asc` o `desc`. Sin `sortBy`, los más recientes primero (`createdAt desc`, desempate por `id`).
- El alcance por rol se aplica siempre después de los filtros del cliente: a un comercial se le descarta cualquier filtro sobre el responsable (`assignedToId` en leads, `ownerId` en clientes) y se le fuerza el suyo.

| Entidad | Campos (✔ buscable) |
|---|---|
| Lead | companyName✔, contactName✔, email✔, phone✔, notes✔, source · statusId, assignedToId (`id`) · estimatedValue (`number`) · expectedCloseDate, createdAt (`date`) |
| Contacto | firstName✔, lastName✔, email✔, phone✔ · companyId, ownerId (`id`) · documentNumber (`equals`) · createdAt |
| Empresa cliente | name✔, industry✔, phone✔, email✔, city✔ · taxNumber, address, state, zip, country · ownerId · documentNumber · createdAt |

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/api/v1/leads/search` | Todos (alcance por rol) | Leads |
| GET | `/api/v1/contacts/search` | Todos (alcance por rol) | Contactos |
| GET | `/api/v1/company-contacts/search` | Todos (alcance por rol) | Empresas cliente |

## Ejemplos
### Leads de un estado con valor mínimo, más recientes primero
Petición (los parámetros van codificados en la URL):
```http
GET /api/v1/leads/search?search=vidrio&filters=[{"field":"statusId","operator":"equals","value":"id-de-contactado"},{"field":"estimatedValue","operator":"gte","value":1000000}]&page=1&limit=20&sortBy=createdAt&sortDir=desc
```
Respuesta `200`:
```json
{ "data": [ { "id": "…", "contactName": "Ana Gómez", "estimatedValue": 2500000 } ], "total": 1, "page": 1, "limit": 20 }
```
Errores: `400 INVALID_FILTERS_FORMAT` (no es una lista JSON, parámetro repetido), `400 FILTER_FIELD_NOT_ALLOWED`, `400 FILTER_OPERATOR_NOT_ALLOWED`, `400 INVALID_FILTER_VALUE` (con `details[].path = ["filters", i, "value"]`), `400 SORT_FIELD_NOT_ALLOWED`.

## Seguridad
- Siempre se añaden el tenant de la sesión y `deleted = INUSE`; ningún filtro del cliente los puede quitar.
- Los valores se validan por tipo antes de llegar a Prisma: un objeto como `{ "not": "" }` no se interpreta como operador.
- Campos internos (`tenantId`, `deleted`, contraseñas) no están en ninguna lista blanca.
