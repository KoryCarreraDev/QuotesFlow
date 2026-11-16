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
- Se auditan el registro (`COMPANY_REGISTERED`), el login correcto (`LOGIN_SUCCEEDED`) y la contraseña incorrecta de una cuenta existente (`LOGIN_FAILED`). Un correo inexistente no se audita.
- Pendiente en F2: contraseña mínima de 12 caracteres (H7), tiempo de respuesta igual exista o no el correo (H22), sesión corta con refresh (H2, D-09) y caducidad real de la cookie (H23).
