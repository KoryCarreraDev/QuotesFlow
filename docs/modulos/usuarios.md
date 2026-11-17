# Usuarios de la empresa

## Propósito
Que el dueño y su equipo de gestión incorporen a sus comerciales sin compartir contraseñas: se invita por correo, la persona elige su contraseña al aceptar, y gestión puede cambiar roles o quitar el acceso cuando alguien sale de la empresa (F2-T05).

## Reglas de negocio
- Listar, invitar y gestionar usuarios es de gestión (dueño, socio, líder comercial). Un comercial no ve ni gestiona usuarios.
- Cada rol solo invita y gestiona ciertos roles (D-16, D-17):

  | Rol | Invita y gestiona a |
  |---|---|
  | Dueño | Socios, líderes comerciales y comerciales |
  | Socio | Socios, líderes comerciales y comerciales |
  | Líder comercial | Comerciales |
  | Comercial | Nadie |

- Nadie gestiona al dueño: no se puede invitar ni asignar el rol `OWNER`. Nadie cambia su propio rol ni se desactiva (403 `CANNOT_MANAGE_OWN_ACCOUNT`).
- Al cambiar el rol, el actor tiene que gestionar el rol actual y el nuevo: un líder no asciende a un comercial a líder.
- Desactivar a alguien cierra todas sus sesiones al momento. Un cambio de rol vale desde su siguiente petición. Sus leads y clientes siguen a su nombre hasta que gestión los reasigne.
- La invitación vence a los 7 días y sirve una vez. Reinvitar al mismo correo anula la anterior. Un correo que ya tiene cuenta en QuotesFlow no se puede invitar (el correo es único en la plataforma).
- Al aceptar, la cuenta nace con el correo verificado (el enlace llegó a ese buzón) y la sesión abierta. La contraseña cumple la política de F2-T03.
- El límite de usuarios por plan (D-34) llega con las suscripciones (F5-T03).

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/api/v1/users` | Gestión | Usuarios de la empresa |
| PATCH | `/api/v1/users/:id` | Gestión (según roles gestionables) | Cambia `role` o `isActive` |
| GET | `/api/v1/users/invitations` | Gestión | Invitaciones pendientes |
| POST | `/api/v1/users/invitations` | Gestión (según roles gestionables) | Invita y envía el enlace |
| DELETE | `/api/v1/users/invitations/:id` | Gestión (según roles gestionables) | Revoca una invitación pendiente |
| POST | `/api/v1/auth/invitations/accept` | Pública | Acepta la invitación y abre la sesión |

## Ejemplos
### Invitar
Petición:
```http
POST /api/v1/users/invitations
Content-Type: application/json

{ "email": "ana.ruiz@example.com", "role": "SALES_REP" }
```
Respuesta `201`:
```json
{ "id": "6f1c…", "email": "ana.ruiz@example.com", "role": "SALES_REP", "invitedById": "2b9e…", "expiresAt": "2026-11-24T15:00:00.000Z", "createdAt": "2026-11-17T15:00:00.000Z" }
```
Errores: `400 VALIDATION_FAILED` (rol `OWNER` o correo inválido), `403 INSUFFICIENT_PERMISSIONS`, `409 EMAIL_ALREADY_IN_USE`.

La persona recibe `https://<app>/accept-invitation#token=…`. El frontend lee el token del fragmento y llama:

```http
POST /api/v1/auth/invitations/accept
Content-Type: application/json

{ "token": "6f1c….Zm9v…", "password": "Una-Contraseña-Larga-1", "firstName": "Ana", "lastName": "Ruiz" }
```
Respuesta `201` `{ "success": true }` con las cookies de sesión. Errores: `400 INVALID_ACCOUNT_TOKEN`, `400 PASSWORD_TOO_WEAK` / `PASSWORD_BREACHED`, `409 EMAIL_ALREADY_IN_USE`.

### Desactivar
```http
PATCH /api/v1/users/2b9e…
Content-Type: application/json

{ "isActive": false }
```
Respuesta `200` con el usuario (`isActive: false`). Errores: `403 INSUFFICIENT_PERMISSIONS`, `403 CANNOT_MANAGE_OWN_ACCOUNT`, `404 USER_NOT_FOUND`.

## Seguridad
- Todo dentro de la empresa de la sesión (R5): un usuario o una invitación de otra empresa responde 404 y no se toca.
- El listado de usuarios nunca lleva el hash de la contraseña ni el estado del bloqueo; las invitaciones nunca llevan el token ni su hash. La base guarda solo el SHA-256 del secreto del enlace.
- Se auditan las invitaciones (enviada, revocada, aceptada) y cada cambio de rol o de estado.
- Aceptar una invitación usa el cupo estricto por IP de `/api/v1/auth`.
