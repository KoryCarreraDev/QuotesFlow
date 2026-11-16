# Leads

## Propósito
Registrar y seguir las oportunidades comerciales de la empresa: quién es el cliente potencial, en qué estado está, quién es su comercial responsable y cuánto podría valer.

## Reglas de negocio
| Acción | `SALES_REP` | `OWNER`, `PARTNER`, `SALES_LEADER` |
|---|---|---|
| Listar y filtrar | Solo los asignados a él | Todos los de la empresa |
| Crear | Queda como responsable, aunque envíe otro `assignedToId` | Puede asignarlo a un usuario activo de la empresa |
| Modificar | Solo los suyos; el `assignedToId` que envíe se ignora | Cualquiera; puede reasignar a un usuario activo |
| Cambiar de estado | Solo los suyos | Cualquiera |
| Borrar (suave) | Solo los suyos | Cualquiera |

- Sin `statusId`, un lead nuevo toma el estado predeterminado de la empresa (409 `DEFAULT_LEAD_STATUS_MISSING` si no hay). Un `statusId` de otra empresa responde 400 `INVALID_LEAD_STATUS`.
- Un responsable que no es un usuario activo de la empresa responde 400 `ASSIGNED_USER_NOT_FOUND` (H9).
- El estado solo cambia por `PATCH /api/lead/status/:id`, que actualiza el lead y escribe `LeadStatusHistory` (estado anterior, nuevo, quién y nota) en una transacción. Pedir el estado que ya tiene no escribe nada. `PATCH /update/:id` no acepta `statusId`.
- Un lead borrado deja de listarse y no se puede modificar (404); la fila se conserva.

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/api/lead/getAll` | Todos (alcance por rol) | Leads visibles para el usuario |
| GET | `/api/lead/filtered` | Todos (alcance por rol) | Listado filtrado y paginado ([filtrado](filtrado.md)) |
| POST | `/api/lead/create` | Todos | Crea un lead |
| PATCH | `/api/lead/update/:id` | Todos (comercial: solo los suyos) | Modifica datos del lead |
| PATCH | `/api/lead/status/:id` | Todos (comercial: solo los suyos) | Cambia el estado y lo registra en el historial |
| POST | `/api/lead/delete/:id` | Todos (comercial: solo los suyos) | Borrado suave |

## Ejemplos
### Crear un lead
Petición:
```http
POST /api/lead/create
Content-Type: application/json

{
  "contactName": "Ana Gómez",
  "companyName": "Vidrios del Norte",
  "email": "ana.gomez@vidriosdelnorte.co",
  "estimatedValue": 2500000,
  "expectedCloseDate": "2026-12-15"
}
```
Respuesta `201`:
```json
{
  "id": "5b0e2f4c-…",
  "contactName": "Ana Gómez",
  "companyName": "Vidrios del Norte",
  "email": "ana.gomez@vidriosdelnorte.co",
  "statusId": "id-del-estado-predeterminado",
  "assignedToId": "id-del-comercial",
  "estimatedValue": 2500000,
  "expectedCloseDate": "2026-12-15T00:00:00.000Z"
}
```
Errores: `400 VALIDATION_FAILED`, `400 INVALID_LEAD_STATUS`, `400 ASSIGNED_USER_NOT_FOUND`, `409 DEFAULT_LEAD_STATUS_MISSING`.

### Cambiar el estado
Petición:
```http
PATCH /api/lead/status/5b0e2f4c-…
Content-Type: application/json

{ "statusId": "id-de-contactado", "note": "Pidió una cotización" }
```
Respuesta `200`: el lead con el `statusId` nuevo.
Errores: `400 VALIDATION_FAILED` (nota de más de 500 caracteres), `400 INVALID_LEAD_STATUS`, `403 INSUFFICIENT_PERMISSIONS`, `404 LEAD_NOT_FOUND`.

## Seguridad
- Todo queda acotado al tenant de la sesión: un lead de otra empresa responde 404, igual que uno inexistente (`tests/api/security/`).
- Toda modificación se audita (`LEAD_CREATED`, `LEAD_UPDATED` con los nombres de los campos cambiados, `LEAD_STATUS_CHANGED`, `LEAD_DELETED`).
- `estimatedValue` aún se maneja como número; el dinero exacto con decimales llega en F3-T01 (H21).
