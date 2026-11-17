# Perfil de la empresa

## Propósito
Datos de la empresa (tenant) que usan los demás módulos: el nombre que aparece en correos y cotizaciones, el logo de los PDF y la zona horaria con la que se calculan vencimientos, alertas y reportes (F2-T06).

## Reglas de negocio
- Todo el equipo ve el perfil (`tenant:view`). Solo el dueño y el socio lo cambian (`tenant:update`, D-16).
- **Canal de correo (D-57, F3-T10).** `emailDeliveryEnabled` decide si la empresa usa el correo además de las notificaciones del sistema: enviar cotizaciones por correo (F3-T08) y alertas (F4). Empieza en `false`; lo cambian dueño y socio. Los correos de la cuenta (verificación, recuperación de contraseña, invitaciones) no dependen de este ajuste.
- La zona horaria es una zona IANA (`America/Bogota`, `America/Lima`, `UTC`…). Por defecto `America/Bogota`. Las fechas se guardan siempre en UTC; la zona solo decide cómo se muestran y dónde empieza y acaba cada día.
- El logo se subirá con el almacenamiento de archivos de F3-T07; hasta entonces `logoUrl` solo se lee y no se puede cambiar por la API.
- Toda empresa tiene su configuración: se crea al registrarse, y la migración de F2-T06 la creó para las existentes.

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/api/v1/tenant` | Todos | Perfil de la empresa de la sesión |
| PATCH | `/api/v1/tenant` | Dueño, socio | Cambia `name`, `timezone` o `emailDeliveryEnabled` |

## Ejemplos
### Ver el perfil
```http
GET /api/v1/tenant
```
Respuesta `200`:
```json
{ "id": "1f0c…", "name": "Aluminios Andinos SAS", "timezone": "America/Bogota", "emailDeliveryEnabled": false }
```

### Cambiar la zona horaria
```http
PATCH /api/v1/tenant
Content-Type: application/json

{ "timezone": "America/Lima" }
```
Respuesta `200` con el perfil actualizado. Errores: `400 VALIDATION_FAILED` (zona que no es IANA, nombre vacío o cuerpo sin cambios), `403 INSUFFICIENT_PERMISSIONS`.

## Seguridad
- La ruta no lleva id: siempre es la empresa de la sesión (R5); un usuario nunca puede leer ni cambiar otra.
- El cuerpo solo admite `name`, `timezone` y `emailDeliveryEnabled`: el id y el logo que se envíen se descartan.
- Cada cambio queda en auditoría (`TENANT_UPDATED`, con los nombres de los campos cambiados).
