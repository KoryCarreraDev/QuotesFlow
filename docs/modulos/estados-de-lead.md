# Estados de lead

## Propósito
Cada empresa define las etapas por las que pasan sus leads (su embudo de ventas): nombre, orden, color, cuál reciben los leads nuevos y si la etapa significa abierto, ganado o perdido. Las analíticas (F7) usan ese tipo para calcular conversión.

## Reglas de negocio
- Al registrarse, la empresa recibe 5 estados: Nuevo (predeterminado), Contactado, Calificado, Ganado (`WON`) y Perdido (`LOST`).
- `type`: `OPEN`, `WON` o `LOST` (D-51); por defecto `OPEN`. El predeterminado tiene que ser `OPEN`, porque un lead no nace ganado ni perdido (400 `DEFAULT_LEAD_STATUS_MUST_BE_OPEN`).
- Hay un solo predeterminado por empresa. Marcar uno nuevo desmarca el anterior en la misma transacción. No se puede desmarcar el actual sin otro (409 `DEFAULT_LEAD_STATUS_REQUIRED`).
- `order` es único por empresa: uno repetido responde 409 `LEAD_STATUS_ORDER_TAKEN`.
- Borrar (suave): no se borra el predeterminado (409 `DEFAULT_LEAD_STATUS_CANNOT_BE_DELETED`) ni uno con leads (409 `LEAD_STATUS_IN_USE`). Al borrar, su orden queda libre para otro estado.
- Reordenar: se envía la lista completa de estados activos en el orden nuevo y quedan numerados 1..n, todos o ninguno. Si falta, sobra o se repite alguno, 400 `LEAD_STATUS_LIST_MISMATCH`.
- Solo gestión (`OWNER`, `PARTNER`, `SALES_LEADER`) crea, modifica, reordena y borra; todos los roles listan.

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/api/leadStatusConfig/getAll` | Todos | Estados de la empresa, por orden |
| POST | `/api/leadStatusConfig/create` | Gestión | Crea un estado |
| PATCH | `/api/leadStatusConfig/update/:id` | Gestión | Modifica un estado |
| PATCH | `/api/leadStatusConfig/reorder` | Gestión | Reordena todos los estados |
| POST | `/api/leadStatusConfig/delete/:id` | Gestión | Borrado suave |

## Ejemplos
### Crear un estado
Petición:
```http
POST /api/leadStatusConfig/create
Content-Type: application/json

{ "name": "Negociación", "order": 6, "color": "#F97316", "type": "OPEN" }
```
Respuesta `201`:
```json
{ "id": "a1b2…", "name": "Negociación", "order": 6, "isDefault": false, "color": "#F97316", "type": "OPEN" }
```
Errores: `400 VALIDATION_FAILED`, `400 DEFAULT_LEAD_STATUS_MUST_BE_OPEN`, `403 INSUFFICIENT_PERMISSIONS`, `409 LEAD_STATUS_ORDER_TAKEN`.

### Reordenar
Petición:
```http
PATCH /api/leadStatusConfig/reorder
Content-Type: application/json

{ "statusIds": ["id-calificado", "id-nuevo", "id-contactado", "id-ganado", "id-perdido"] }
```
Respuesta `200`: la lista de estados con `order` 1..5 en ese orden.
Errores: `400 LEAD_STATUS_LIST_MISMATCH`, `403 INSUFFICIENT_PERMISSIONS`.

## Seguridad
- Acotado al tenant de la sesión: una lista con estados de otra empresa responde 400 y no cambia nada.
- Se auditan creación, modificación, borrado y reordenamiento.
