# Perfil de la empresa

## Propósito
Datos de la empresa (tenant) que usan los demás módulos: el nombre que aparece en correos y cotizaciones, el logo de los PDF y la zona horaria con la que se calculan vencimientos, alertas y reportes (F2-T06).

## Reglas de negocio
- Todo el equipo ve el perfil (`tenant:view`). Solo el dueño y el socio lo cambian (`tenant:update`, D-16).
- **Canal de correo (D-57, F3-T10).** `emailDeliveryEnabled` decide si la empresa usa el correo además de las notificaciones del sistema: enviar cotizaciones por correo (F3-T08) y alertas (F4). Empieza en `false`; lo cambian dueño y socio. Los correos de la cuenta (verificación, recuperación de contraseña, invitaciones) no dependen de este ajuste.
- La zona horaria es una zona IANA (`America/Bogota`, `America/Lima`, `UTC`…). Por defecto `America/Bogota`. Las fechas se guardan siempre en UTC; la zona solo decide cómo se muestran y dónde empieza y acaba cada día.
- **Cotizaciones (F3-T05).** `defaultTaxRate` es el IVA por defecto de los ítems (`"19"`; `null` lo quita y entonces se pide en cada ítem, Q-020). `maximumDiscountRateSalesRep` (10 por defecto) y `maximumDiscountRateSalesLeader` (20) son los descuentos máximos por rol; dueño y socio no tienen tope (D-25, Q-019). Porcentajes de 0 a 100 como texto con hasta 2 decimales.
- **Logo (F3-T07).** PNG o JPEG de hasta 2 MB y 2000 x 2000 píxeles, en el campo `file` de un `multipart/form-data`. El tipo lo decide el contenido del archivo (sus primeros bytes), nunca el nombre ni el `Content-Type` que declare el cliente; SVG no se admite porque puede llevar scripts. El perfil devuelve `logoUrl: "/api/v1/tenant/logo"` solo si hay logo, y esa ruta sirve la imagen (privada, `Cache-Control: private`); la clave interna de almacenamiento no sale nunca por la API. Reemplazar el logo guarda el archivo nuevo, cambia la clave y solo entonces borra el anterior; si algo falla, el logo anterior sigue. El archivo del logo viaja en el PDF de las cotizaciones (F3-T06).
- **Almacenamiento (Q-017, D-26).** Puerto `IFileStorage`. Mientras dure el desarrollo, `LocalDiskFileStorage` guarda en la carpeta `FILE_STORAGE_DIRECTORY` (por defecto `storage/`, fuera de git). Al desplegar, un adaptador compatible con S3 (Cloudflare R2) implementará el mismo puerto: **pendiente**, junto con la cuenta y las claves (Operaciones, R6). La imagen Docker de producción no tiene una carpeta escribible por defecto: hasta ese adaptador hay que montar un volumen y apuntar `FILE_STORAGE_DIRECTORY` a él.
- Toda empresa tiene su configuración: se crea al registrarse, y la migración de F2-T06 la creó para las existentes.

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/api/v1/tenant` | Todos | Perfil de la empresa de la sesión |
| PATCH | `/api/v1/tenant` | Dueño, socio | Cambia `name`, `timezone`, `emailDeliveryEnabled`, `defaultTaxRate`, `maximumDiscountRateSalesRep` o `maximumDiscountRateSalesLeader` |
| GET | `/api/v1/tenant/logo` | Todos | La imagen del logo; 404 `LOGO_NOT_FOUND` si no hay |
| PUT | `/api/v1/tenant/logo` | Dueño, socio | Sube o reemplaza el logo (`multipart/form-data`, campo `file`); responde el perfil |
| DELETE | `/api/v1/tenant/logo` | Dueño, socio | Quita el logo → 204; sin logo, no hace nada |

## Ejemplos
### Ver el perfil
```http
GET /api/v1/tenant
```
Respuesta `200`:
```json
{
  "id": "1f0c…", "name": "Aluminios Andinos SAS", "logoUrl": "/api/v1/tenant/logo", "timezone": "America/Bogota",
  "emailDeliveryEnabled": false, "defaultTaxRate": "19.00",
  "maximumDiscountRateSalesRep": "10.00", "maximumDiscountRateSalesLeader": "20.00"
}
```

### Cambiar la zona horaria
```http
PATCH /api/v1/tenant
Content-Type: application/json

{ "timezone": "America/Lima" }
```
Respuesta `200` con el perfil actualizado. Errores: `400 VALIDATION_FAILED` (zona que no es IANA, nombre vacío o cuerpo sin cambios), `403 INSUFFICIENT_PERMISSIONS`.

### Subir el logo
```http
PUT /api/v1/tenant/logo
Content-Type: multipart/form-data; boundary=…

--…
Content-Disposition: form-data; name="file"; filename="logo.png"
Content-Type: image/png
…
```
Respuesta `200` con el perfil (`logoUrl` incluido). Errores: `400 INVALID_LOGO_IMAGE` (no es un PNG o JPEG válido, supera el tamaño o las medidas, falta el campo `file` o sobra otro campo), `403 INSUFFICIENT_PERMISSIONS`.

## Seguridad
- La ruta no lleva id: siempre es la empresa de la sesión (R5); un usuario nunca puede leer ni cambiar otra.
- El cuerpo de `PATCH` solo admite los campos de la tabla: el id y el logo que se envíen se descartan.
- Cada cambio queda en auditoría (`TENANT_UPDATED`, con los nombres de los campos cambiados; `TENANT_LOGO_UPDATED` con el formato; `TENANT_LOGO_REMOVED`).
- La clave del logo incluye el id de la empresa y un UUID; el adaptador de disco rechaza cualquier clave con `..`, rutas absolutas o caracteres fuera de `a-z 0-9 _ - .` y comprueba que la ruta resuelta queda dentro de la carpeta raíz.
- La carga se lee en memoria con tope de tamaño (`multer`, un archivo, sin campos de texto); una petición mayor se corta antes de procesarla.
