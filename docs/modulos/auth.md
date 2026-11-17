# Autenticación

## Propósito
Registrar una empresa nueva con su dueño y abrir sesión. Es la puerta de entrada de cada tenant: el registro crea la empresa y el login entrega la cookie de sesión que usan el resto de rutas.

## Reglas de negocio
- **Registro** (`RegisterCompanyAndOwnerUseCase`): crea la empresa (tenant), su dueño con rol `OWNER` y los 5 estados de lead por defecto (Nuevo, Contactado, Calificado, Ganado `WON`, Perdido `LOST`), todo en una transacción (H8). Si algo falla, no queda nada.
- El correo es único en toda la plataforma. Uno ya registrado responde 409 `EMAIL_ALREADY_IN_USE`, también con dos registros simultáneos (decide la restricción única de la base).
- La contraseña se cifra con bcrypt, coste 12 (D-10), antes de abrir la transacción.
- **Login** (`LoginUseCase`): solo usuarios activos, no borrados y de una empresa no borrada (H3). Cualquier fallo responde igual, 401 `INVALID_CREDENTIALS`, para no revelar qué cuentas existen.
- El login correcto deja la cookie HTTP-only `accessToken` (`SameSite=Strict`, `Secure` en producción) con un JWT que lleva usuario, empresa y rol.

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Público | Registra empresa, dueño y estados por defecto |
| POST | `/api/v1/auth/login` | Público | Inicia sesión y deja la cookie `accessToken` |

## Ejemplos
### Registro
Petición:
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "companyName": "Aluminios Andinos SAS",
  "ownerEmail": "carlos@aluminiosandinos.co",
  "password": "una-contraseña-larga",
  "ownerFirstName": "Carlos",
  "ownerLastName": "Pérez"
}
```
Respuesta `201`:
```json
{ "tenantId": "c0a8012e-…", "ownerId": "7d1f3b9a-…" }
```
Errores: `400 VALIDATION_FAILED` (campos inválidos), `409 EMAIL_ALREADY_IN_USE`, `429 TOO_MANY_REQUESTS`.

### Login
Petición:
```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "carlos@aluminiosandinos.co", "password": "una-contraseña-larga" }
```
Respuesta `200` con cabecera `Set-Cookie: accessToken=…; HttpOnly; SameSite=Strict; Path=/`:
```json
{ "success": true }
```
Errores: `400 VALIDATION_FAILED`, `401 INVALID_CREDENTIALS`, `429 TOO_MANY_REQUESTS`.

## Seguridad
- Límite propio de 10 peticiones por IP cada 15 minutos en `/api/v1/auth` (`RATE_LIMIT_AUTH_MAX_REQUESTS`), además del global (H6). El bloqueo por cuenta llega en F2-T03.
- CSRF (F2-T07): login y registro, como toda petición que modifica datos, responden 403 `ORIGIN_NOT_ALLOWED` si llegan con un `Origin` (o `Referer`) fuera de `CORS_ALLOWED_ORIGINS`. Evita que otra web inicie sesión en nombre del usuario con una cuenta del atacante.
- Se auditan el registro (`COMPANY_REGISTERED`), el login correcto (`LOGIN_SUCCEEDED`) y la contraseña incorrecta de una cuenta existente (`LOGIN_FAILED`). Un correo inexistente no se audita.
- Sesiones (F2-T02, D-09): ver la sección siguiente. H2 y H23 resueltos.
- Contraseñas (F2-T03, D-11, H7): al registrarse (y al cambiarla o aceptar una invitación), de 12 caracteres a 72 bytes, distinta del correo y que no aparezca en filtraciones públicas (Have I Been Pwned, por rango: solo salen 5 caracteres del SHA-1). Errores 400 `VALIDATION_FAILED` en el campo `password`, `PASSWORD_TOO_WEAK` o `PASSWORD_BREACHED`. Si el servicio de filtraciones no responde, se acepta (Q-013).
- Bloqueo (F2-T03): tras 5 contraseñas incorrectas seguidas la cuenta se bloquea 1 minuto; cada fallo siguiente dobla el bloqueo hasta 15 minutos. Mientras dura, ni la contraseña correcta entra. Un acierto pone el contador a cero.
- Respuestas genéricas (H22): correo inexistente, contraseña incorrecta, cuenta bloqueada o desactivada responden lo mismo, 401 `INVALID_CREDENTIALS`, y tardan lo mismo.

## Sesiones (F2-T02)
- El login abre una sesión y deja dos cookies HTTP-only `SameSite=Strict`: `accessToken` (15 min, viaja a toda la API) y `refreshToken` (7 días de vida absoluta, solo viaja a `/api/v1/auth`). La base guarda solo el hash del refresh token.
- Cuando la API responde 401 `SESSION_EXPIRED`, el frontend llama a `POST /api/v1/auth/refresh` y repite la petición. Debe renovar de una en una: dos renovaciones simultáneas con el mismo refresh token se tratan como robo y cierran la sesión.
- `POST /api/v1/auth/refresh`: cookies nuevas (el refresh token cambia en cada renovación). Un refresh token ya usado revoca la sesión entera (`SESSION_REUSE_DETECTED` en auditoría) y responde 401 `INVALID_SESSION`.
- `POST /api/v1/auth/logout`: cierra la sesión del navegador y borra las cookies; siempre 204.
- `POST /api/v1/auth/logout-all` (con sesión): cierra todas las sesiones del usuario; 204.
- Cada petición protegida comprueba en la base que la sesión siga abierta y que el usuario y su empresa sigan activos, y usa el rol actual: desactivar a un usuario o cambiarle el rol surte efecto de inmediato (H2).
