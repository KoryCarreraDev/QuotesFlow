# Informe de seguridad de la fase F2

| Campo | Valor |
|---|---|
| Alcance | Diff de F2: ramas `feat/F2-T10` … `feat/F2-T06` (merges 26 a 35), apiladas sobre `develop` con F0 y F1 fusionadas |
| Fecha | 2026-11-17 |
| Autor | Opus (Claude Code) |
| Marcos | OWASP Top 10:2025, OWASP API Security Top 10:2023 |
| Estado | **Pendiente de firma humana** (R10) |

F2 añade identidad, sesiones y usuarios: correo transaccional, sesiones cortas con refresh rotatorio, política de contraseñas y bloqueo, verificación de correo, recuperación, invitaciones, gestión de usuarios y perfil de la empresa. Además cierra los hallazgos F1-S1, F1-S2 y F1-S5 del informe de F1.

## Metodología

1. Lectura del diff de cada rama de F2 contra la anterior: casos de uso, repositorios, middleware, configuración, migraciones, plantillas y esquemas.
2. Comprobación ejecutable: cada corrección convirtió su `itKnownDefect` en test de regresión (H2, H7); ya no queda ninguno. Las suites de seguridad recorren todo el inventario de rutas (aislamiento, roles, auditoría y, desde F2-T08, atomicidad de la auditoría) y fallan si una ruta queda sin escenario; F2 añadió las operaciones `self` y `readOwn` para cubrir sesiones y perfil.
3. Herramientas: ESLint con `eslint-plugin-security`, `dependency-cruiser`, `pnpm audit`, `prisma migrate diff` contra una base desechable (sin diferencias en las 6 migraciones nuevas), la migración del índice parcial probada sobre una base con duplicados, y la prueba de extremo a extremo de la sección 4 con la imagen de producción.
4. Resultado de la suite: 1352 tests en verde, 0 defectos conocidos, cobertura 97,95 % de sentencias y 92,91 % de ramas (umbrales: 80 % global, 90 % en `domain` y `application`).

## 1. Hallazgos resueltos en F2

| # | Hallazgo | Tarea | Evidencia |
|---|---|---|---|
| H2 | Token de 7 días sin revocación, algoritmo no fijado, rol congelado en el token | F2-T02 | Acceso de 15 min con `sid`, HS256 fijo, emisor y audiencia; sesión y rol comprobados en la base en cada petición. Los 2 defectos conocidos pasaron a regresión |
| H7 | Contraseña de 6 caracteres, sin verificación ni recuperación | F2-T03, F2-T04 | `PasswordPolicy` (12 caracteres a 72 bytes, filtradas vía HIBP con k-anonimato); verificación de correo y recuperación con tokens de un solo uso |
| H8 (resto) | El registro revelaba si un correo existía | F2-T04 | Respuesta 202 idéntica, mismo bcrypt, aviso al dueño del correo; registros simultáneos responden igual |
| H22 | El login tardaba menos si el correo no existía | F2-T03 | `compareWithoutHash`: bcrypt real del mismo coste con cuenta inexistente o bloqueada |
| H23 | Cookie de 7 días fija | F2-T02 | Cada cookie caduca con su token (`durationToMilliseconds`); test de `Max-Age` |
| H6 (cuenta) | Sin límite por cuenta | F2-T03 | Bloqueo progresivo: 5 fallos → 1 min, doblando hasta 15 min, contador atómico |
| F1-S1 | Auditoría fuera de la transacción | F2-T08 | 9 casos de uso pasan a `runInTransaction`; `auditAtomicity.test.ts` sobre todo el inventario (sin el cambio fallaban 9) |
| F1-S2 | Unicidad del documento solo en la aplicación | F2-T09 | Índice único parcial en la base; test con dos altas simultáneas |
| F1-S5 | Las sondas consumían el cupo global | F2-T10 | `/health` y `/ready` antes del limitador |

Sigue abierto de la línea base: **H21** (dinero como `number`, F3-T01) y la parte de **H6** de los contadores compartidos entre instancias (F8).

## 2. Qué se revisó en el diff de F2

| Área | Comprobación | Resultado |
|---|---|---|
| Control de acceso (A01, API1, API5) | Matriz con `session:revoke-own`, `user:*` y `tenant:*`; roles gestionables por rol (D-16, D-17) con denegación por defecto; nadie gestiona al dueño ni su propia cuenta. Usuarios, invitaciones y perfil siempre dentro del tenant: un recurso ajeno responde 404 y no se toca (suites de cobertura) | Correcto |
| Autenticación (A07, API2) | Sesión revocable y rotatoria; reutilización de refresh revoca la sesión y se audita; login con bloqueo, respuestas y tiempos iguales; verificación de correo obligatoria (D-12); cambiar la contraseña o desactivar revoca todas las sesiones | Correcto |
| CSRF (A01) | `createOriginCheckMiddleware`: POST/PATCH/PUT/DELETE con `Origin`/`Referer` ajeno → 403, también login (CSRF de inicio de sesión); `SameSite=Strict` en las dos cookies; la de refresh solo en `/api/v1/auth` | Correcto |
| Criptografía (A04) | Tokens opacos de 256 bits; en la base solo SHA-256; comparación en tiempo constante; canje atómico (comparar y cambiar) en sesiones, tokens de cuenta e invitaciones. bcrypt coste 12 y límite de 72 bytes | Correcto |
| Datos sensibles (A02, API3) | Los DTO de usuario e invitación no llevan hashes, bloqueo ni tokens; `EmailLog` no guarda el cuerpo; los enlaces llevan el token en el fragmento (`#token=`), que no viaja al servidor ni en `Referer`; el aviso técnico de un correo fallido no lleva el destinatario | Correcto |
| Configuración (A05) | En producción `EMAIL_PROVIDER` solo `resend`, con clave y remitente, y `APP_BASE_URL` en https; `RESEND_API_KEY` sin valor por defecto; `PASSWORD_BREACH_CHECK` explícito | Correcto |
| Inyección (A05) | Datos de usuario escapados en el HTML de los correos; asunto sin saltos de línea; zona horaria validada contra la lista IANA del entorno; cuerpos validados con Zod (el registro descarta rol y tenant, el perfil descarta id y logo) | Correcto |
| Integridad (A08) | Escritura y auditoría en la misma transacción en todo caso de uso que modifica; registro, aceptación de invitación y recuperación atómicos; 6 migraciones verificadas con `prisma migrate diff`, con relleno de datos existentes | Correcto |
| Consumo de APIs externas (API10) | Resend y HIBP con URL fija, plazo (10 s y 3 s), sin redirecciones y respuesta validada; el error de axios no se adjunta (lleva la cabecera `Authorization`) | Correcto |
| Abuso de flujos (API6) | Cupo estricto por IP en registro, login, verificación, recuperación y aceptación; como mucho un correo de verificación o recuperación por minuto y cuenta | Correcto |
| Logs y auditoría (A09) | Se auditan login, bloqueo, logout, reutilización de sesión, verificación, recuperación, invitaciones, gestión de usuarios y perfil; nunca contraseñas ni tokens | Correcto |

## 3. Hallazgos nuevos del diff de F2

| # | Hallazgo | Severidad | Acción |
|---|---|---|---|
| F2-S1 | Dos renovaciones simultáneas con el mismo refresh token (dos pestañas) cuentan como reutilización y cierran la sesión | Baja (operativa) | El frontend debe renovar de una en una (documentado en `docs/modulos/auth.md`). Revisar con datos reales; una ventana de gracia se puede añadir sin cambiar el contrato |
| F2-S2 | Cualquiera puede bloquear la cuenta de otro probando contraseñas (bloqueo por cuenta) | Baja | Tope de 15 min a propósito; el límite por IP lo frena. Los contadores compartidos entre instancias llegan en F8 |
| F2-S3 | Si Have I Been Pwned no responde, se acepta la contraseña | Baja | Decisión pendiente en Q-013 |
| F2-S4 | Invitar un correo que ya tiene cuenta responde 409: un usuario de gestión puede saber si un correo está registrado en otra empresa | Baja | Inherente al correo único global; solo para usuarios autenticados de gestión y con límite de tasa. Revisar si se permite un correo en varias empresas (fuera del MVP) |
| F2-S5 | La comprobación de la sesión añade una consulta por petición autenticada | Informativa | Es el precio de H2 (revocación y rol inmediatos). Consulta por clave primaria con dos uniones |
| F2-S6 | La función preview `partialIndexes` de Prisma declara el índice del documento | Baja | Si Prisma cambia la sintaxis al estabilizarla, revisar `schema.prisma` al actualizar (el test de `migrate diff` lo detectaría) |
| F2-S7 | `pnpm audit --audit-level high`: `picomatch` ≤ 4.0.7 (GHSA-fc5q-39xc-vjpf, ReDoS) sin versión corregida, vía `vitest`/`vite` (solo desarrollo, ya en `develop`). El job `dependency-audit` falla en todas las ramas | Media (proceso) | No introducido por F2 y no llega a la imagen (`pnpm audit --prod` sin avisos). Decisión pendiente en Q-014; la CI no se ha tocado (R2) |
| F2-S8 | Siete migraciones nuevas pendientes en producción (`add_partial_unique_document_index`, `add_email_log`, `add_user_session`, `add_login_lockout_to_user`, `add_email_verification_and_account_tokens`, `add_user_invitation`, `add_timezone_to_tenant_settings`) | — | Operaciones, con la imagen `migrator` (R6). La del índice parcial se detiene si hay duplicados |
| F2-S9 | Los correos salen con una clave de Resend de ejemplo hasta que se compre y verifique el dominio | — (operativa) | Operaciones: dominio con SPF, DKIM y DMARC y `RESEND_API_KEY` real en el gestor de secretos. Mientras tanto los envíos quedan como `FAILED` en `EmailLog` y nadie puede verificar su correo en producción |
| F2-S10 | En GitHub, gitleaks marcó 6 falsos positivos de `generic-api-key` en tests de F2-T03, F2-T04 y F2-T05 (contraseñas `*-Horse-Battery-*` y secretos de token `c2VjcmV0…` inventados) | Baja (proceso) | Corregido en F2-T03 con `.gitleaks.toml`: reglas por defecto y exención solo de esos patrones, solo bajo `tests/` y solo para esa regla. Verificado en local con gitleaks 8.30.1 sobre todo el historial; una clave real dentro de `tests/` se sigue detectando. Revisar la exención en el PR de F2-T03 |

Ninguno es crítico ni alto.

## 4. Verificación de extremo a extremo (sección 10 de `PLAN.md`)

Ejecutada el 2026-11-17 contra la imagen de producción (`docker build --target runtime` y `migrator`), con PostgreSQL 15 en contenedor, `NODE_ENV=production`, `EMAIL_PROVIDER=resend` con la clave de ejemplo y `PASSWORD_BREACH_CHECK=hibp` contra Have I Been Pwned real. El recorrido de F2 desde una sola IP se hizo con `RATE_LIMIT_AUTH_MAX_REQUESTS=50`; con el valor por defecto (10) la petición número 11 a `/api/v1/auth` respondió 429, como debe.

| Comprobación | Resultado |
|---|---|
| Migraciones con la imagen `migrator` | Todas aplicadas |
| `/health` y `/ready` con el cupo global agotado (cupo 2) | Ruta normal 429; `/health` 200 y `/ready` 200 (F2-T10) |
| Registro nuevo y registro repetido con el mismo correo | Los dos 202 `{ "status": "PENDING_EMAIL_VERIFICATION" }`; una sola empresa creada (H8) |
| `EmailLog` con la clave de ejemplo | `EMAIL_VERIFICATION` y `ACCOUNT_ALREADY_REGISTERED` como `FAILED` / `PROVIDER_REJECTED`; el registro no falla (F2-T01) |
| Registro con `password123456` | 400 `PASSWORD_BREACHED` (HIBP real, D-11) |
| Login con la contraseña correcta sin verificar el correo | 403 `EMAIL_NOT_VERIFIED` (D-12). Se marcó verificado en la base: con la clave de ejemplo el enlace no llega. El recorrido registro → correo → verificación → login está probado de extremo a extremo en `tests/api/accountRecovery.test.ts` |
| Login con `Origin: https://evil.example` | 403 `ORIGIN_NOT_ALLOWED` (F2-T07) |
| Login correcto | Cookies `accessToken` (`Path=/`, `Secure`) y `refreshToken` (`Path=/api/v1/auth`, `Secure`) |
| `GET /api/v1/tenant` con la sesión | 200 con `timezone: "America/Bogota"` (F2-T06) |
| Refresh y refresh con el token anterior | 200 y 401; la sesión queda `REFRESH_TOKEN_REUSED` y el token de acceso nuevo también deja de valer (401) (F2-T02) |
| 5 contraseñas incorrectas y después la correcta | 401 `INVALID_CREDENTIALS`, igual que un correo inexistente (F2-T03, H22) |
| Recuperación de un correo existente y de uno inexistente | Los dos 202 `{ "status": "ACCEPTED" }` (F2-T04) |
| Auditoría | `COMPANY_REGISTERED`, `REGISTRATION_WITH_EXISTING_EMAIL`, `LOGIN_REJECTED_EMAIL_NOT_VERIFIED`, `LOGIN_SUCCEEDED`, `SESSION_REUSE_DETECTED`, 5 `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGIN_REJECTED_ACCOUNT_LOCKED` |
| JSON mal formado | 400 `MALFORMED_JSON`, sin traza |
| Usuario del proceso / SIGTERM (`docker stop`) | uid 1000 / salida 0 (apagado ordenado) |

## 5. Puerta de cierre de F2 (sección 3 de `PLAN.md`)

| Condición | Estado |
|---|---|
| Todas las tareas con PR aprobado y fusionado | Pendiente: 10 ramas subidas, con el orden de merge en el título de cada commit (26 a 35) y este informe (36) |
| CI en verde; cobertura dentro del umbral | En local: 1352 tests en verde, cobertura dentro del umbral. En GitHub, `dependency-audit` fallará por F2-S7 hasta decidir Q-014 |
| Matrices de aislamiento y de roles actualizadas y en verde | Sí: recorren todo el inventario de rutas, incluidas las 15 nuevas de F2 |
| Este informe firmado | Pendiente |
| `CONTEXT.md` refleja el estado real | Sí |
| Documentación de los módulos de la fase | Sí: `docs/modulos/` (auth ampliado, correo, usuarios, empresa) y `docs/openapi.json` |
| `QUESTION.md` sin preguntas bloqueantes de la fase | Sí: Q-013 y Q-014 no bloquean |
| Firma de `docs/security/matriz-permisos.md` | Pendiente: la matriz cambió en F2-T02, F2-T05 y F2-T06 |

## 6. Firma

`Aprobado por ______ el ____-__-__`
