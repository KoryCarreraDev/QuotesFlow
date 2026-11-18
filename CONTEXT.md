# CONTEXT.md — QuotesFlow (SaaS Comerciales)

> Resumen del proyecto para personas e IAs. Léelo en lugar de explorar todo el código. Si cambias algo estructural (rutas, reglas, modelos), actualiza este archivo.
> Última revisión: rama `feat/F2-T06-tenant-profile-settings` (apilada sobre todas las tareas anteriores de F2), 2026-11-17.

---

## 1. Qué es

Backend API REST de un SaaS **multi-tenant** de gestión comercial (CRM + cotizaciones). Cada empresa (tenant) comparte BD PostgreSQL pero solo ve sus datos: **todas las tablas de negocio llevan `tenantId`** y todo repositorio filtra por él.

Planeado: auth JWT, leads con roles, contactos, productos con precio fijo o por fórmula, cotizaciones (PDF + email), auditoría, mensajería.

---

## 2. Estado actual

| Módulo | Estado | Notas |
|---|---|---|
| Auth (register/login/sesiones) | ✅ | Register crea tenant + usuario OWNER + 5 estados de lead por defecto en una sola transacción (F1-T03). Login abre una sesión (F2-T02): cookie `accessToken` de 15 min y `refreshToken` rotatorio; refresh, logout y logout global |
| Leads | ✅ | getAll, create, update, filtered, **delete (soft)**. Reglas por rol (sección 6) |
| LeadStatusConfig (estados de lead) | ✅ | getAll, create, update, delete (suave), reorder; tipo OPEN/WON/LOST (F1-T14) |
| Contactos persona | ✅ CRUD + filtered + borrado suave (F1-T16) | Responsable (`ownerId`) y documento normalizado y único (F1-T17); un comercial solo ve los suyos |
| Contactos empresa | ✅ CRUD + filtered + borrado suave (F1-T16) | Responsable y NIT normalizado y único (F1-T17); borrar solo gestión y sin contactos activos |
| Usuarios de la empresa (F2-T05) | ✅ | Listar, invitar por correo, aceptar invitación, revocar, cambiar rol, desactivar (revoca sesiones). Roles gestionables por rol (D-16, D-17) |
| Motor de filtrado genérico | ✅ | Sección 8 |
| Dinero exacto (F3-T01) | ✅ | `Money` y `Percentage` en `domain/value-objects/money.ts`: centavos en `bigint`, redondeo mitad hacia arriba, texto decimal en la API (H21 resuelto). `docs/modulos/dinero.md` |
| Evaluador de fórmulas (F3-T03) | ✅ | Puerto `IFormulaEvaluator`, adaptador `MathjsFormulaEvaluator`: lista blanca de nodos, BigNumber, límites de tamaño. `docs/modulos/formulas.md` |
| Productos (F3-T02) | ✅ | Buscar, crear, modificar, borrar (suave). Precio fijo o fórmula. `docs/modulos/productos.md` |
| Fórmulas de precio (F3-T04) | ✅ | Buscar, crear, modificar, borrar (suave). Expresión validada por el evaluador. `docs/modulos/formulas.md` |
| Cotizaciones (F3-T05) | ✅ | Crear, buscar, leer, modificar y borrar borradores; enviar, aceptar, rechazar y revisar (versiones). `docs/modulos/cotizaciones.md` |
| Logo de la empresa (F3-T07) | ✅ | `PUT/GET/DELETE /tenant/logo`: PNG o JPEG validado por contenido; puerto `IFileStorage` con adaptador en disco (Q-017). `docs/modulos/empresa.md` |
| PDF de cotización | ⏳ | F3-T06 |
| AuditLog, LeadStatusHistory | ✅ | `AuditLog` en toda modificación y en registro y login (F1-T07); `LeadStatusHistory` en cada cambio de estado (F1-T13) |
| Perfil de la empresa y `TenantSettings` (F2-T06) | ✅ | `GET/PATCH /tenant`: nombre y zona horaria IANA (por defecto `America/Bogota`); el logo llega con F3-T07. `leadAssignmentStrategy` sigue sin lógica (`ROUND_ROBIN`/`LOAD_BALANCED`, C-08 = No) |
| Correo transaccional (F2-T01) | ✅ | `TransactionalEmailSender`: plantillas MJML compiladas, Resend (por axios) y `EmailLog`. Sección 8 |
| Mensajería, multer, pdf-lib | ⏳ | Instalados, sin uso (mathjs se usa desde F3-T03); se usarán en F3 a F6 (sección 6 de `PLAN.md`). winston se usa desde F1-T07; axios, desde F2-T01 (adaptador de Resend). `nodemailer`, `node-cron` y `http-status-codes` se quitaron en F0-T09 |
| Tests | ✅ | Vitest: 1185 tests (unit, integración con PostgreSQL efímero, API, build), sin defectos conocidos pendientes. Guía en `tests/README.md` (sección 12) |

### Deuda / cosas a saber (no asumas lo contrario)
- La lista completa de hallazgos de seguridad, con severidad y tarea, está en `docs/audits/00-linea-base.md` (H1 a H26). H2 y H23 se resolvieron en F2-T02. H7 y H22 se resolvieron en F2-T03. H21 se resolvió en F3-T01.
- **Errores (F1-T02).** Los casos de uso lanzan clases de `src/domain/errors/` y el manejador global responde con su código HTTP y `{ error: { code, message, details? } }` (sección 8). Quedan como `Error` normal, y por tanto 500, las comprobaciones de "no hay tenant en el contexto" de los casos de uso, que el middleware ya impide. Un error de Prisma (por ejemplo, `order` repetido en estados) sigue respondiendo 500: traducirlo es de F1-T14.
- **Cambio de estado (F1-T13).** Solo por `PATCH /api/v1/leads/:id/status` (`ChangeLeadStatusUseCase`): actualiza el lead y escribe `LeadStatusHistory` (tenant, estado anterior y nuevo, quién, nota) en una transacción. `PATCH /api/v1/leads/:id` ya no acepta `statusId` (Zod lo descarta). `ILeadRepository.update` nunca cambia el estado; lo hace `updateStatus`. Aún no hay endpoint para leer el historial.
- Borrado suave (F1-T15): en `domain` y `application` se usa el enum de dominio `DeletedState` (`Active='INUSE'`, `Inactive='DELETED'`), y `Lead.deleted` y `LeadStatusConfig.deleted` tienen ese tipo. En los repositorios se usa el enum que genera Prisma (`DeletedState as StoredDeletedState` de `@prisma/client`), porque el de dominio no es asignable a sus tipos literales. No quedan literales `'INUSE'`/`'DELETED'` fuera de los enums.
- Todos los repositorios de negocio filtran `deleted: 'INUSE'` en lecturas y modificaciones; contactos y empresas cliente desde F1-T16 (H10). En los dobles en memoria de contactos la marca de borrado se guarda aparte, porque las entidades `Contact` y `CompanyContact` no la llevan.
- Desde F1-T13 y F1-T16 toda referencia a otro registro se valida dentro del tenant: el responsable de un lead (usuario activo) y la empresa cliente de un contacto (no borrada; si no, 400 `INVALID_COMPANY_CONTACT`).
- `pnpm audit` (2026-11-16, tras F0-T09): `pnpm audit --prod` sin avisos. Quedan 2 moderados solo de desarrollo, `glob` 10.5.0 y `minimatch` 5.1.9/9.0.9, que arrastra `@testcontainers/postgresql` 12.2.1 vía `archiver` 7. No tienen versión corregida en su rama mayor y testcontainers aún no admite `archiver` 8, por eso no se fuerzan. Antes eran 94 avisos (1 crítico).

---

## 3. Stack

TypeScript (ESM, imports terminan en `.js`) · Node 24 LTS (D-04; `engines` en `package.json`, `.nvmrc` = 24.18.0, imagen `node:24.18.0-slim` fijada por digest) · pnpm 11.28.10 fijado en `devEngines` (se descarga solo si la versión local es otra) · Express 5 · Prisma 7 (`@prisma/adapter-pg`, `pg`) · PostgreSQL 15 · Zod 4 · bcryptjs · jsonwebtoken · cookie-parser · helmet · cors (lista blanca, F1-T06) · compression · express-rate-limit (por IP cada 15 min: 100 global y 10 en `/api/v1/auth`, configurables) · pnpm · Docker Compose · tsx + nodemon en dev.

**Tests (devDependencies, versiones exactas, añadidas el 2026-11-16 en F0-T02):** `vitest` 5.1.0 · `@vitest/coverage-v8` 5.1.0 · `supertest` 7.3.2 · `@types/supertest` 7.2.1 · `@testcontainers/postgresql` 12.2.1 (necesita Docker). Se quitaron `jest`, `ts-jest` y `@types/jest` (decisión D-01).

**Calidad (F0-T03):** ESLint 10 (`eslint.config.js`: typescript-eslint, eslint-plugin-security, @vitest/eslint-plugin, regla local `eslint-rules/no-commented-out-code.js`) y Prettier (`.prettierrc.json`: comillas simples, 120 columnas, LF; los `.md` no se formatean). `eslint-suppressions.json` está vacío desde F1-T18: las 77 violaciones heredadas que congelaba (Q-008) se corrigieron entre F1-T02 y F1-T18. Si vuelve a tener entradas, solo puede encoger (ver `docs/guia-de-codigo.md`, sección 11). `.gitattributes` fuerza LF. El commit de formato masivo está en `.git-blame-ignore-revs`.

**Hooks de git (F0-T05):** lefthook 2.2.2 (`lefthook.yml`), instalado por su `postinstall` al hacer `pnpm install` (no se instala con `CI=true`). pre-commit: ESLint + Prettier sobre los archivos preparados. pre-push: `pnpm typecheck`, `pnpm arch:check`, `pnpm test:unit`.

**CI (F0-T06):** `.github/workflows/ci.yml`, en cada PR y push a `develop`/`main`. Actions fijadas por SHA de commit y permisos `contents: read`. Jobs:
| Job | Qué exige |
|---|---|
| `quality` | `pnpm typecheck`, `pnpm lint`, `pnpm arch:check` |
| `tests` | `pnpm test:coverage` (los 4 proyectos, con PostgreSQL vía testcontainers) y umbrales de D-03; sube `coverage/` como artefacto |
| `dependency-audit` | `pnpm audit --prod` sin ningún aviso; `pnpm audit --audit-level high` para todo |
| `secret-scan` | gitleaks 8.30.1 (imagen por digest) sobre todo el historial, con las reglas por defecto. `.gitleaks.toml` solo exime, en `tests/` y para la regla `generic-api-key`, las contraseñas de prueba `*-Horse-Battery-*` y los secretos de token de prueba `c2VjcmV0…` (base64 de «secret») |
| `context-updated` | Solo en PR: `pnpm check:context origin/<base>` falla si cambian `src/` o `prisma/` sin una fila nueva en el registro de `CONTEXT.md` (R3; `scripts/ci/`) |
| `docker-image` | Construye `runtime` y `migrator`, migra un PostgreSQL de servicio, arranca la API con `--init` y comprueba `/health`, usuario no root y registro (201) |

Que estos jobs sean obligatorios para fusionar lo configura un humano en la protección de ramas de GitHub.

`pnpm-workspace.yaml`: `allowBuilds` niega las compilaciones nativas opcionales de testcontainers (`cpu-features`, `protobufjs`, `ssh2`) y `overrides` fuerza `brace-expansion` 2.1.7 (versión corregida; la arrastra testcontainers).

Alias `@/` = `src/` (en `tsconfig.json`, `paths` sin `baseUrl`). En el código se mezclan imports `@/...` y relativos. `pnpm build` ejecuta `tsc` y después `tsc-alias` (1.9.10, F0-T07), que reescribe `@/` a rutas relativas en `dist/`; sin ese paso `node dist/server.js` no arranca. En los tests además `@tests/` = `tests/` (en `vitest.config.ts` y `tests/tsconfig.json`).

---

## 4. Arquitectura (Clean/Hexagonal)

```
domain/          entidades + enums. No importa nada externo.
application/     use-cases, dtos, ports (interfaces), mappers, constants. Importa solo domain.
infrastructure/  persistence (Prisma), services (bcrypt, jwt), web (controllers, middleware). Implementa ports.
presentation/    routes + schemas Zod.
cross-cutting/   container.ts (DI), tenantContext.ts (AsyncLocalStorage)
config/          env.ts, database.ts
```

Regla: capas internas nunca importan las externas (`domain` y `application` no conocen Express ni Prisma). La comprueba `pnpm arch:check` (`dependency-cruiser` 18.7.2, `.dependency-cruiser.cjs`, F0-T04): `domain` solo `domain` y módulos nativos; `application` solo `application` y `domain`; `infrastructure` no importa `presentation`; `presentation` no importa `infrastructure/persistence`; sin ciclos; `src/` sin `devDependencies`. El código actual cumple todas (119 módulos). Excepción tolerada: `infrastructure/web/middleware/createTenantMiddleware.ts` importa `cross-cutting/container.ts` para crear el `ScopedContainer` por petición.

### Mapa de archivos (por módulo)
```
src/
  server.ts                  arranca app en env.PORT (default 4000) y registra el apagado ordenado (SIGTERM/SIGINT)
  app.ts                     middlewares globales + montaje de routers
  config/                    env.ts, database.ts
  cross-cutting/             container.ts (ScopedContainer), modules/ (un módulo por área), tenantContext.ts
  domain/entities/           Tenant, User, Lead, LeadStatusConfig, Contact, CompanyContact
  domain/enums/              Role, DeletedState
  domain/errors/             ApplicationError + NotFound/Forbidden/Conflict/Validation/UnauthorizedError, ErrorCode
  domain/value-objects/      (vacío)
  application/constants/     defaultLeadStatuses.ts
  application/dtos/          [Entidad]DTO, Create…DTO, Update…DTO, FilterCriteriaDTO, PaginatedResultDTO, LoginDTO, RegisterCompanyDTO
  application/mappers/       LeadMapper, ContactMapper, CompanyContactMapper, LeadStatusConfigMapper
  application/policies/      authorizationPolicy.ts: matriz de permisos, can, scopeFor (F1-T04)
  application/ports/         repositories/I*, services/I*, mappers/I*
  application/use-case/      auth/, leads/, LeadStatusConfig/, contacts/, companyContacts/, filter/, (messaging/ y pricing/ vacíos)
  infrastructure/persistence/prisma/PrismaService.ts          singleton PrismaClient
  infrastructure/persistence/prisma/PrismaTransactionManager.ts  ITransactionManager sobre $transaction + AsyncLocalStorage
  infrastructure/persistence/repositories/                    BasePrismaRepository + Prisma*Repository
  infrastructure/persistence/filters/                         lead|contact|companyContact FilterConfig
  infrastructure/services/                                    BcryptHashService (coste 12, D-10), JwtTokenService (clase JwTokenService)
  infrastructure/web/controllers/                             AuthController, LeadController, LeadStatusConfigController, ContactController, CompanyContactController
  infrastructure/email/                                       ResendEmailService, LocalEmailServices (log, memoria), CompiledEmailTemplateRenderer, templates/*.mjml, compiledEmailTemplates.ts (generado)
  application/services/                                       TransactionalEmailSender (F2-T01)
  infrastructure/web/gracefulShutdown.ts                      cierra el servidor (espera peticiones en curso), luego Prisma; plazo 10 s
  infrastructure/persistence/prisma/databaseReadiness.ts      SELECT 1 con plazo de 2 s para /ready
  presentation/routes/healthRoutes.ts                         manejadores de /health y /ready
  infrastructure/web/middleware/                              validateBody, createAuthValidateCookie, createTenantMiddleware, errorHandler (manejador global + 404 de ruta)
  infrastructure/web/errors/                                  errorResponse.ts: clase de error -> HTTP y formato único
  presentation/routes/                                        authRoutes, leadRoutes, leadStatusConfigRouter, contactRoutes, companyContactRoutes
  presentation/schemas/                                       auth, lead, leadStatusConfig, contact, companyContact
  types/express.d.ts                                          req.user, req.container

vitest.config.ts             proyectos unit / integration / api, alias, umbrales de cobertura
tests/
  README.md                  guía de tests (leer antes de escribir uno)
  tsconfig.json              tipos de los tests (no afecta a `pnpm build`)
  setup/                     entorno de test, contenedor PostgreSQL efímero, base de datos por archivo
  support/builders/          constructores de entidades de dominio
  support/doubles/           dobles en memoria de los puertos (InMemory*Repository, Fake*Service, FixedTenantContext)
  support/database/          fábricas persist* y limpieza de tablas
  support/http/              apiRoutes.ts (rutas e inventario), apiClient.ts (cookie de sesión), registeredRoutes.ts
  support/knownDefect.ts     itKnownDefect
  unit/ integration/ api/    los tests; api/security/ = inventario de rutas, autenticación, aislamiento, roles
```

---

## 5. Flujo de una request y multi-tenancy

```
cookie accessToken -> createAuthValidateCookie (AuthenticateSessionUseCase: verifica JWT y que la sesión siga abierta y el usuario activo; req.user = {userId, tenantId, role actual de la base, sessionId})
  -> createTenantMiddleware (TenantContext.run(tenantId) + req.container = new ScopedContainer(tenantId))
  -> [validateBody(zod)] -> Router helper get*Controller(req) arma el controller con use cases de req.container
  -> Controller -> UseCase -> Repository (extends BasePrismaRepository)
```

- `ScopedContainer` (`cross-cutting/container.ts`): DI manual, una instancia por petición. `PrismaTransactionManager` se crea en `AuthModule` y se inyecta al caso de uso como `ITransactionManager`. Desde F1-T09 se divide en módulos (`cross-cutting/modules/`): `container.auth`, `.leads`, `.leadStatuses`, `.contacts`, `.companyContacts`. Cada módulo tiene un método `get<X>UseCase()` por caso de uso, que instancia repositorio + mapper + caso de uso; las rutas los piden así: `req.container!.leads.getCreateLeadUseCase()`. Sin tenantId (scope público, `authRouter`) el `tenantContext.getTenantId()` lanza error.
- `TenantContext` usa `AsyncLocalStorage`; `BasePrismaRepository.tenantId` lo lee.
- **Transacciones (F1-T03).** El caso de uso envuelve sus escrituras en `ITransactionManager.runInTransaction(work)`. `PrismaTransactionManager` abre `prisma.$transaction` y guarda el cliente de la transacción en otro `AsyncLocalStorage`; `BasePrismaRepository.prisma` es un getter que devuelve ese cliente si hay transacción abierta y, si no, el raíz. Así los repositorios no reciben la transacción como parámetro. Una llamada anidada se une a la transacción exterior. Si `work` lanza, se revierte todo y se relanza el mismo error. No se hace trabajo lento dentro (bcrypt va antes).
- `BasePrismaRepository` ofrece: `tenantWhere()` (= `{tenantId, deleted:'INUSE'}`), `buildFilterWhere()` (siempre agrega tenantId + `deleted:'INUSE'`), `buildPagination()`, `softDeleteRegister(model, id)` (update `deleted='DELETED'` + `updatedAt`, con `where {id, tenantId}`), `validateTenant()`, `withTenant()`.
- Nota: `PrismaUserRepository.findByEmail` busca **sin tenant** (email es único global); `findById` sí filtra por tenant.

---

## 6. Reglas de negocio vigentes

**Roles:** `OWNER`, `PARTNER`, `SALES_LEADER`, `SALES_REP`. Leads, estados, contactos y empresas cliente aplican roles.

**Productos (F3-T02)**
- Precio fijo, fórmula o ambos; nunca ninguno (`PRODUCT_PRICE_REQUIRED`), también tras una modificación parcial. La fórmula tiene que ser de la empresa y no estar borrada (`INVALID_PRODUCT_FORMULA`). Precio unitario antes de IVA (Q-020).
- `product:list` todo el equipo; `product:create`, `product:update`, `product:delete` gestión (dueño, socio, líder). Supuesto pendiente de confirmar por el dueño de producto.
- Los filtros admiten el tipo `boolean` desde F3-T02 (`isActive`).

**Fórmulas de precio (F3-T04)**
- Variables `{ name, label }`, como mucho 20 y sin repetir (`INVALID_FORMULA_VARIABLE`). La expresión se valida con `IFormulaEvaluator` al crear y al modificar (`INVALID_FORMULA`). Una fórmula que usa un producto no borrado no se borra (`FORMULA_IN_USE`).
- `formula:list` todo el equipo; `formula:create/update/delete` gestión. Supuesto pendiente de confirmar.

**Cotizaciones (F3-T05)** (detalle en `docs/modulos/cotizaciones.md`)
- Cliente: lead, contacto o empresa cliente (al menos uno); un comercial solo cotiza a lo suyo (`INVALID_QUOTE_CUSTOMER`, igual si no existe). Número consecutivo por empresa sin huecos (`QuoteNumberSequence`, `INSERT ... ON CONFLICT` dentro de la transacción de alta); `COT-000123`, y `COT-000123 v2` en las versiones (Q-018).
- El servidor calcula el precio de cada ítem (precio fijo o fórmula con `variables`); cambiarlo exige `priceOverrideReason` y deja `QUOTE_PRICE_OVERRIDDEN` en auditoría (D-24, Q-015; la alerta llega en F4-T06). Importes con `Money` y `Percentage` (descuento del ítem, después el global, IVA sobre la base).
- IVA por ítem; por defecto el de `TenantSettings.defaultTaxRate`, y si no existe se pide (`TAX_RATE_REQUIRED`, Q-020). Topes de descuento por rol sobre el descuento total de cada ítem: comercial 10 %, líder 20 %, dueño y socio sin tope; configurables (`DISCOUNT_ABOVE_ROLE_LIMIT`, 403).
- Estados: `DRAFT` → `SENT` → `ACCEPTED` | `REJECTED`; revisar una `SENT`/`REJECTED`/vencida crea la versión siguiente en `DRAFT` y deja la anterior `SUPERSEDED` (D-22). `EXPIRED` no se guarda: `displayStatus` lo calcula con `validUntil` en la zona horaria de la empresa (Q-016). Los cambios de estado comparan y cambian (`saveState`), así que aceptar y rechazar a la vez no ganan las dos.
- Acciones `quote:list`, `quote:update`, `quote:delete`, `quote:send`, `quote:decide`: gestión todas; comercial solo las que creó (`own` por `createdById`). `quote:create`: todos. Los casos de uso no llaman `can` sin recurso en acciones `own`: comprueban contra la cotización cargada (`findAllowedQuote`).
- `POST /quotes/:id/send` solo cambia el estado; el correo con PDF llega con F3-T08.

**Logo de la empresa (F3-T07)**
- `tenant:update` (dueño y socio) sube y quita; `tenant:view` (todos) lo descarga. `Tenant.logoUrl` guarda la **clave** del archivo (`logos/<tenantId>/<uuid>.png|jpg`), no una URL: el perfil publica `logoUrl: '/api/v1/tenant/logo'` si hay logo (`toTenantProfileDTO`) y la clave no sale por la API. El formato (PNG/JPEG), el tamaño (2 MB) y las medidas (2000 px) se deciden por el contenido (`domain/value-objects/logoImage.ts`, sin SVG). Subir guarda el archivo, cambia la clave y audita en una transacción, y borra el archivo anterior al confirmar; si falla, borra el nuevo.
- `IFileStorage` + `LocalDiskFileStorage` (carpeta `FILE_STORAGE_DIRECTORY`, por defecto `storage/`, fuera de git; los tests usan una carpeta temporal). El adaptador compatible con S3 (R2) queda para el despliegue (Q-017). `multer` en memoria: `receiveLogoUpload`.

**Perfil de la empresa (F2-T06)**
- `tenant:view` todo el equipo; `tenant:update` solo dueño y socio (D-16). Desde F3-T10 el perfil incluye `emailDeliveryEnabled` (D-57): `false` por defecto; con `false`, cotizaciones y alertas no salen por correo. Los correos de la cuenta no dependen de él. `PATCH /tenant` acepta `name` (1-200) y `timezone`, una zona IANA que conozca el entorno (`isSupportedTimezone`, `domain/value-objects/timezone.ts`); al menos uno. El cuerpo no cambia id ni logo (Zod los descarta). Auditado como `TENANT_UPDATED` con `changedFields`.
- Toda empresa tiene su fila de `TenantSettings`: el registro la crea y la migración la creó para las existentes; si faltara, el perfil devuelve `America/Bogota` y modificar la crea. Las fechas se guardan en UTC; la zona horaria la usarán cotizaciones, alertas y reportes.

**Usuarios de la empresa (F2-T05, D-16, D-17)**
- `user:list`, `user:invite` y `user:manage` son de gestión. Además, cada rol solo invita y gestiona los roles de `manageableRolesByRole` (`canManageRole`): dueño y socio, a socios, líderes y comerciales; líder comercial, solo a comerciales. Nadie gestiona al dueño (no se invita ni se asigna `OWNER`) ni su propia cuenta (403 `CANNOT_MANAGE_OWN_ACCOUNT`). Al cambiar el rol cuentan el actual y el nuevo.
- Invitar (`POST /users/invitations` `{ email, role }`): un correo con cuenta en la plataforma responde 409 `EMAIL_ALREADY_IN_USE`; reinvitar al mismo correo revoca la invitación anterior; el enlace (`#token=`, 7 días, un solo uso) se envía con la plantilla `USER_INVITATION`. Aceptar (`POST /auth/invitations/accept` `{ token, password, firstName, lastName }`, público, cupo estricto): crea la cuenta con el rol invitado y el correo verificado, abre la sesión (201 con cookies); la contraseña cumple la política y, si no, la invitación sigue sirviendo. Una invitación revocada, aceptada, caducada o de una empresa borrada responde 400 `INVALID_ACCOUNT_TOKEN`.
- Modificar (`PATCH /users/:id` `{ role?, isActive? }`): desactivar revoca todas las sesiones del usuario (`USER_DEACTIVATED`); el rol nuevo vale desde su siguiente petición. Los leads y clientes de un usuario desactivado siguen a su nombre hasta reasignarlos.
- Se auditan `USER_INVITED`, `USER_INVITATION_REVOKED`, `USER_INVITATION_ACCEPTED` y `USER_UPDATED` (con `changedFields`, rol y estado). Los listados nunca llevan hashes, datos del bloqueo ni tokens.

**Clientes (contactos y empresas cliente, F1-T17)**
- Responsable `ownerId` (D-18): un comercial solo lista, filtra y modifica los clientes de los que es responsable; lo que crea queda a su nombre aunque envíe otro `ownerId`; solo puede vincular un contacto a una empresa cliente suya. Gestión ve todos y asigna responsable a un usuario activo de la empresa (si no, 400 `OWNER_NOT_FOUND`). Los clientes anteriores a F1-T17 no tienen responsable y solo los ve gestión hasta asignarlos (Q-005).
- Documento (D-19): `documentType` (`CC`, `CE`, `TI`, `PASSPORT`, `PPT`, `NIT`) y `documentNumber` en contactos; en empresas, `documentNumber` se deriva de `taxNumber`. Se guarda normalizado (`domain/value-objects/documentNumber.ts`): solo dígitos, letras y dígitos en mayúscula en pasaportes, sin dígito de verificación en el NIT. Un número sin tipo responde 400 `DOCUMENT_TYPE_REQUIRED`. Repetido entre clientes activos de la misma empresa, 409 `DOCUMENT_ALREADY_REGISTERED`; el de un cliente borrado se puede reutilizar. Lo comprueba la aplicación y, desde F2-T09, también un índice único parcial `(tenantId, documentNumber) WHERE deleted = 'INUSE' AND documentNumber IS NOT NULL` en ambas tablas: entre dos altas simultáneas decide la base y el repositorio traduce la violación (P2002) a 409 `DOCUMENT_ALREADY_REGISTERED`. El índice usa la función preview `partialIndexes` de Prisma (`where: raw(...)` en `schema.prisma`), para que `migrate dev` no lo borre.

**Autorización (F1-T04, ampliada en F1-T17).** Una sola matriz, `permissionMatrix` en `src/application/policies/authorizationPolicy.ts`: por acción y rol, `all`, `own` (solo los recursos de los que es responsable) o `none`. Los casos de uso preguntan `can(actor, action, resource)`; los listados usan `scopeFor(actor, action)`. Un rol fuera de la matriz no tiene permisos, y un permiso `own` sin usuario o sin recurso se deniega. `docs/security/matriz-permisos.md` se genera con `pnpm docs:permissions` y un test falla si no coincide con el código. Solo `lead-status:list` aún no consulta la política (se permite a todos).

**Leads**
| Acción | SALES_REP | Otros roles |
|---|---|---|
| Listar (`getAll`/`filtered`) | Solo `assignedToId === userId` (en `filtered` el controller fuerza el filtro y descarta el que envíe el cliente) | Todos del tenant |
| Crear | `assignedToId` se fuerza a su propio `userId` | `assignedToId` opcional; si viene, el usuario debe existir en el tenant |
| Actualizar | Solo sus leads; no puede reasignar | Cualquiera; puede reasignar a un usuario activo de la empresa (si no, 400 `ASSIGNED_USER_NOT_FOUND`) |
| Cambiar estado | Solo sus leads | Cualquiera |
| Eliminar (soft) | Solo sus leads | Cualquiera |

- Crear sin `statusId` → usa el estado `isDefault` del tenant (error si no hay). Con `statusId` → debe existir en el tenant.
- Actualizar/eliminar un lead ya `DELETED` → no se encuentra (`findById` filtra `INUSE`).
- Los leads con `deleted='DELETED'` no aparecen en ninguna consulta.

**LeadStatusConfig**
- Cada estado tiene `type` (`OPEN`, `WON`, `LOST`; D-51), por defecto `OPEN`. El predeterminado tiene que ser `OPEN` (400 `DEFAULT_LEAD_STATUS_MUST_BE_OPEN`). Los estados del registro: Ganado = `WON`, Perdido = `LOST`.
- Crear y modificar van en una transacción: si falla, el predeterminado anterior se conserva. Un `order` repetido responde 409 `LEAD_STATUS_ORDER_TAKEN`.
- Borrar (suave, solo gestión): no el predeterminado (409 `DEFAULT_LEAD_STATUS_CANNOT_BE_DELETED`) ni uno con leads (409 `LEAD_STATUS_IN_USE`). Al borrar, su `order` pasa a un negativo para liberar el número, porque `@@unique([tenantId, order])` incluye los borrados.
- Reordenar: `PATCH /api/v1/lead-statuses/order` con `{ statusIds }`, la lista completa de estados activos en el orden nuevo; si falta, sobra o se repite alguno, 400 `LEAD_STATUS_LIST_MISMATCH`. Asigna 1..n en una transacción, en dos pasadas para no chocar con la restricción única.
- `SALES_REP` no puede crear ni actualizar (error "Insufficient permissions").
- Solo un estado `isDefault` por tenant: al marcar uno nuevo como default, el anterior se desmarca. No se puede poner `isDefault=false` al default actual sin otro que lo reemplace.
- `@@unique([tenantId, order])` en BD: `order` duplicado por tenant falla.
- Al registrar una empresa se crean 5 estados (`application/constants/defaultLeadStatuses.ts`): Nuevo (default, #3B82F6), Contactado, Calificado, Ganado, Perdido.

**Auth**
- Login: solo usuarios activos, no borrados y de una empresa no borrada (`findActiveByEmail`, H3). Cualquier otro caso responde 401 `INVALID_CREDENTIALS`, igual que una contraseña incorrecta.
- Bloqueo por cuenta (F2-T03): tras 5 fallos seguidos la cuenta se bloquea 1 min y cada fallo posterior dobla el bloqueo hasta 15 min (`domain/value-objects/loginLockout.ts`); mientras dura ni se comprueba la contraseña. Un acierto pone el contador a cero. Se auditan `LOGIN_FAILED` (con `failedAttempts`), `ACCOUNT_LOCKED` y `LOGIN_REJECTED_ACCOUNT_LOCKED`. El tope es corto porque cualquiera puede bloquear la cuenta de otro probando contraseñas. Sigue el límite por IP en registro y login.
- Tiempo constante (H22): con un correo inexistente o la cuenta bloqueada se ejecuta `IHashService.compareWithoutHash`, una comparación bcrypt real contra un hash del mismo coste calculado una vez por proceso; la respuesta y el tiempo son los de una contraseña incorrecta.
- Contraseñas (D-11, H7): `PasswordPolicy` exige de 12 caracteres a 72 bytes (lo que usa bcrypt), distinta del correo y no filtrada (`IBreachedPasswordChecker`; adaptador `PwnedPasswordsChecker` con k-anonimato: solo salen 5 caracteres del SHA-1; plazo de 3 s; si el servicio falla, acepta y deja un aviso, Q-013). Errores 400 `PASSWORD_TOO_WEAK` y `PASSWORD_BREACHED`. El login no exige mínimo: las cuentas anteriores a D-11 deben poder entrar para cambiarla.
- Register (F2-T04): responde siempre 202 `{ status: 'PENDING_EMAIL_VERIFICATION' }`, exista o no el correo (H8 resuelto): con un correo ya registrado no crea nada, gasta el mismo bcrypt y envía al dueño del correo, si la cuenta está activa, el aviso `ACCOUNT_ALREADY_REGISTERED` (auditado como `REGISTRATION_WITH_EXISTING_EMAIL`). Si no, crea Tenant → User(OWNER, sin verificar) → 5 estados → token de verificación en una transacción (si algo falla, no queda nada) y después envía el enlace. Con dos registros simultáneos del mismo correo, la restricción única decide y los dos responden 202.
- Verificación de correo (D-12, F2-T04): el login con la contraseña correcta de una cuenta sin verificar responde 403 `EMAIL_NOT_VERIFIED` (auditado); con la contraseña incorrecta, `INVALID_CREDENTIALS` como siempre. `POST /auth/verify-email` `{ token }` canjea el enlace (24 h, un solo uso). `POST /auth/verify-email/resend` `{ email }` responde siempre 202 y solo envía a una cuenta activa sin verificar; solo vale el último enlace y como mucho uno por minuto. Las cuentas anteriores a F2-T04 se dieron por verificadas en la migración.
- Recuperación (F2-T04): `POST /auth/password/forgot` `{ email }` responde siempre 202 y, si hay cuenta activa, envía un enlace de 30 min (auditado `PASSWORD_RESET_REQUESTED`; uno por minuto). `POST /auth/password/reset` `{ token, password }` valida la política sin gastar el enlace (si falla, sirve para otro intento), y en una transacción canjea el token, cambia el hash, quita el bloqueo, marca el correo verificado, revoca todas las sesiones (`PASSWORD_CHANGED`) y audita `PASSWORD_RESET_COMPLETED`; después avisa por correo (`PASSWORD_CHANGED`) y borra las cookies.
- Tokens de cuenta (`AccountToken`, `AccountTokenIssuer`): `<id>.<secreto>`, solo el SHA-256 del secreto en la base, comparación en tiempo constante, canje atómico (de dos usos simultáneos gana uno). Error único 400 `INVALID_ACCOUNT_TOKEN` (no existe, caducó, ya se usó o es de otro fin). Los enlaces llevan el token en el fragmento (`#token=`), que el navegador no envía al servidor ni en `Referer` (`AccountLinks`). Los cuatro endpoints usan el cupo estricto por IP.

---

## 7. Modelo de datos (`prisma/schema.prisma`)

Todos los modelos tienen `deleted DeletedState @default(INUSE)` (`INUSE` | `DELETED`), salvo `AuditLog`. IDs `cuid()` en Prisma, pero las entidades de dominio generan `crypto.randomUUID()` y lo pasan al crear.

```
Tenant ─┬ User[]  ─ role Role, isActive
        ├ Lead[] ─ status→LeadStatusConfig, assignedTo→User, estimatedValue, expectedCloseDate
        │   ├ LeadStatusHistory[] (oldStatus/newStatus/changedBy, tenantId desde F1-T10)
        │   └ Quote[]
        ├ LeadStatusConfig[] ─ name, color, order, isDefault   @@unique([tenantId, order])
        ├ Contact[] ─ companyId→CompanyContact
        ├ CompanyContact[]
        ├ Product[] ─ basePrice? | formula?
        ├ Formula[] ─ expression, variables(Json), createdBy
        ├ Quote[] ─ number + version (únicos con tenantId), status QuoteStatus, validUntil (DATE), discountRate, subtotal/discountTotal/taxTotal/total (instantánea), previousVersion?, items QuoteItem[] (con tenantId desde F1-T10; position, unitPrice, calculatedUnitPrice?, priceOverrideReason?, discountRate, taxRate, netAmount, taxAmount, total)
        ├ QuoteNumberSequence (1:1) ─ lastNumber: contador de números de cotización, sin borrado suave
        ├ TenantSettings (1:1) ─ leadAssignmentStrategy MANUAL|ROUND_ROBIN|LOAD_BALANCED, defaultTaxRate?, maximumDiscountRateSalesRep (10), maximumDiscountRateSalesLeader (20)
        └ AuditLog[]
```
Enums: `Role`, `QuoteStatus` (DRAFT/SENT/ACCEPTED/REJECTED/SUPERSEDED), `LeadAssignmentStrategy`, `DeletedState`.
Migraciones: `add_quote_details` (F3-T05: numeración, versiones, vigencia, importes e ítems con IVA y descuento, `QuoteNumberSequence`, IVA y topes en `TenantSettings`; completa con valores por defecto las cotizaciones previas y se detiene si `Quote.discount` tenía datos), `add_timezone_to_tenant_settings` (F2-T06: `timezone` en `TenantSettings`, por defecto `America/Bogota`, y una fila de configuración para cada empresa existente), `add_user_invitation` (F2-T05: tabla `UserInvitation` con el hash del enlace), `add_email_verification_and_account_tokens` (F2-T04: `emailVerifiedAt` en `User`, rellenado con `createdAt` en las cuentas existentes; tabla `AccountToken` y enum `AccountTokenPurpose`), `add_login_lockout_to_user` (F2-T03: `failedLoginAttempts` y `loginLockedUntil` en `User`), `add_user_session` (F2-T02: tabla `UserSession` con hash del refresh token, revocación y motivo), `add_email_log` (F2-T01: tabla `EmailLog` y enum `EmailDeliveryStatus`), `init` (2026-07-10), `add_deleted_to_models` (2026-09-01), `add_owner_and_document_to_clients` (F1-T17: `ownerId` con FK a `User` y `ON DELETE SET NULL`, enum `DocumentType`, `documentNumber`; rellena el NIT normalizado de las empresas existentes), `add_type_to_lead_status_config` (F1-T14: enum `LeadStatusType`; Ganado y Perdido se marcan `WON` y `LOST` por nombre), `add_partial_unique_document_index` (F2-T09: sustituye el índice `(tenantId, documentNumber)` de contactos y empresas cliente por uno único parcial; se detiene con un mensaje claro si ya hay duplicados activos) y `add_tenant_id_to_history_and_quote_items` (F1-T10: rellena `tenantId` desde el lead o la cotización antes de exigir NOT NULL; FK a `Tenant` con borrado en cascada e índice). Todas las tablas de negocio tienen `tenantId NOT NULL` con FK a `Tenant`, salvo `Tenant`; lo comprueba `tests/integration/schema/databaseSchema.test.ts`.

Comprobar que las migraciones coinciden con `schema.prisma`: `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`, con un `prisma.config` que declare `shadowDatabaseUrl` (Prisma 7 no acepta la URL por parámetro). En producción las aplica Operaciones con la imagen `migrator` (R6).

---

## 8. API implementada

Desde F1-T11 (D-06) la API son recursos REST bajo `/api/v1`: `auth`, `leads`, `lead-statuses`, `contacts`, `company-contacts`. Listar es `GET /recurso`, el listado filtrado y paginado `GET /recurso/search`, crear `POST /recurso`, modificar `PATCH /recurso/:id` y borrar (suave) `DELETE /recurso/:id`. Las sondas `/health` y `/ready` siguen en la raíz. El contrato OpenAPI 3.1 está en `docs/openapi.json` (D-07), generado desde los esquemas Zod con `pnpm docs:openapi`; un test falla si no coincide con el código o le falta alguna ruta.

Auth: cookie HTTP-only `accessToken` (excepto `/health`, `/ready` y las rutas públicas de `/api/v1/auth`).

**Sesiones (F2-T02, D-09, H2, H23).** El login abre una `UserSession` y deja dos cookies HTTP-only, `SameSite=Strict`: `accessToken` (JWT HS256 con `sub`, `tenantId`, `sid`, emisor `quotesflow-api`, audiencia `quotesflow-app`, sin rol; dura `JWT_EXPIRATION`, 15 min por defecto) y `refreshToken` (`<sessionId>.<secreto>`, solo `Path=/api/v1/auth`, dura `REFRESH_TOKEN_EXPIRATION`, 7 días). Cada cookie caduca a la vez que su token (H23). La base guarda solo el SHA-256 del secreto. Cada petición protegida comprueba en la base que la sesión no esté revocada ni caducada y que usuario y empresa sigan activos, y toma el rol de la base (H2): cerrar sesión, desactivar o cambiar el rol surte efecto en la siguiente petición. Token caducado: 401 `SESSION_EXPIRED` (el frontend llama a `POST /auth/refresh` y repite); cualquier otro fallo: 401 `INVALID_SESSION`. `POST /auth/refresh` rota el refresh token (comparar y cambiar en una sentencia); uno ya rotado que reaparece revoca la sesión entera y deja `SESSION_REUSE_DETECTED` en auditoría. Dos renovaciones simultáneas con el mismo token cuentan como reutilización: el frontend debe renovar de una en una. La vida de la sesión es absoluta (renovar no la alarga). `POST /auth/logout` (idempotente, 204) revoca con el refresh token completo; `POST /auth/logout-all` (con sesión, 204) revoca todas las del usuario. Se auditan login, logout, logout global y reutilización; las renovaciones normales no. El cupo estricto por IP solo aplica a registro y login.

**Endurecimiento HTTP (F1-T06).** CORS solo para los orígenes de `CORS_ALLOWED_ORIGINS`, con credenciales; un origen fuera de la lista no recibe cabeceras CORS (H4). Cuerpo JSON máximo de 100 kb: más responde 413 `PAYLOAD_TOO_LARGE` (H14). `trust proxy` = `TRUST_PROXY` (0 por defecto: X-Forwarded-For se ignora). Límite por IP cada 15 min: `RATE_LIMIT_GLOBAL_MAX_REQUESTS` (100) en todo y `RATE_LIMIT_AUTH_MAX_REQUESTS` (10) además en `/api/v1/auth`; al superarlo, 429 `TOO_MANY_REQUESTS` con cabeceras `RateLimit-*`. Los contadores viven en memoria de cada proceso (H6 sigue abierto en la parte de varias instancias y del bloqueo por cuenta, F2-T03). **CSRF (F2-T07, D-14):** además de la cookie `SameSite=Strict`, `createOriginCheckMiddleware` rechaza con 403 `ORIGIN_NOT_ALLOWED` toda petición POST, PATCH, PUT o DELETE cuyo `Origin` (o, si falta, el origen de `Referer`) no esté en `CORS_ALLOWED_ORIGINS`; `Origin: null` y un `Referer` ilegible cuentan como ajenos. Sin ninguna de las dos cabeceras se atiende (no es un navegador). Las lecturas no se verifican. Piezas: `src/infrastructure/web/httpSecurity.ts`.

| Método | Ruta | Body / Query |
|---|---|---|
| GET | `/health` | — (vida: el proceso responde; no toca la base de datos; fuera del limitador global desde F2-T10) |
| GET | `/ready` | — (listo: la base responde a `SELECT 1` en menos de 2 s; si no, 503 `SERVICE_UNAVAILABLE`; fuera del limitador global desde F2-T10) |
| POST | `/api/v1/auth/register` | `{ companyName, ownerEmail, password, ownerFirstName, ownerLastName }` → 202 `{ status: 'PENDING_EMAIL_VERIFICATION' }` |
| POST | `/api/v1/auth/verify-email` | `{ token }` → 200; 400 `INVALID_ACCOUNT_TOKEN` |
| POST | `/api/v1/auth/verify-email/resend` | `{ email }` → 202 siempre |
| POST | `/api/v1/auth/password/forgot` | `{ email }` → 202 siempre |
| POST | `/api/v1/auth/password/reset` | `{ token, password }` → 200; cierra todas las sesiones |
| POST | `/api/v1/auth/login` | `{ email, password }` → cookies `accessToken` y `refreshToken` |
| POST | `/api/v1/auth/refresh` | — (cookie `refreshToken`) → cookies nuevas; 401 `INVALID_SESSION` |
| POST | `/api/v1/auth/logout` | — (cookie `refreshToken`; idempotente) → 204 |
| POST | `/api/v1/auth/logout-all` | — (con sesión) → 204, cierra todas las sesiones del usuario |
| GET | `/api/v1/leads` | — |
| POST | `/api/v1/leads` | `{ contactName (requerido), companyName?, email?, phone?, statusId?(uuid), source?, assignedToId?(uuid), estimatedValue?, expectedCloseDate?, notes? }` |
| PATCH | `/api/v1/leads/:id` | mismos campos salvo `statusId`, todos opcionales |
| PATCH | `/api/v1/leads/:id/status` | `{ statusId (uuid, requerido), note? (máx. 500) }`: cambia el estado y lo registra en `LeadStatusHistory` |
| DELETE | `/api/v1/leads/:id` | — (borrado suave) |
| GET | `/api/v1/leads/search` | `?search=&filters=[...]&page=&limit=&sortBy=&sortDir=` |
| GET | `/api/v1/lead-statuses` | — (ordenado por `order` asc) |
| POST | `/api/v1/lead-statuses` | `{ name, order, isDefault?, color?, type? }` (`type`: `OPEN` \| `WON` \| `LOST`) |
| PATCH | `/api/v1/lead-statuses/:id` | `{ name?, order?, isDefault?, color?, type? }` |
| DELETE | `/api/v1/lead-statuses/:id` | — (borrado suave; solo gestión) |
| PATCH | `/api/v1/lead-statuses/order` | `{ statusIds: uuid[] }` (todos los estados activos, en el orden nuevo) |
| GET, POST, PATCH `/:id`, GET `/search` | `/api/v1/contacts` | `{ firstName, lastName, email?, phone?, companyId?, ownerId?, documentType?, documentNumber? }` (`companyId`: empresa cliente del tenant, no borrada y visible para quien la vincula) |
| DELETE | `/api/v1/contacts/:id` | — (borrado suave; solo gestión) |
| GET, POST, PATCH `/:id`, GET `/search` | `/api/v1/company-contacts` | `{ name, industry?, taxNumber?, phone?, email?, address?, city?, state?, zip?, country?, ownerId? }` |
| GET | `/api/v1/tenant` | — → `{ id, name, logoUrl?, timezone, emailDeliveryEnabled, defaultTaxRate?, maximumDiscountRateSalesRep, maximumDiscountRateSalesLeader }` |
| GET, PUT, DELETE | `/api/v1/tenant/logo` | `PUT`: `multipart/form-data` con el campo `file` (PNG o JPEG) → perfil; `DELETE` → 204; `GET` → la imagen |
| PATCH | `/api/v1/tenant` | `{ name?, timezone?, emailDeliveryEnabled?, defaultTaxRate? (null lo quita), maximumDiscountRateSalesRep?, maximumDiscountRateSalesLeader? }` (solo dueño y socio) |
| GET | `/api/v1/users` | — (solo gestión) |
| PATCH | `/api/v1/users/:id` | `{ role?, isActive? }` (`role`: `PARTNER` \| `SALES_LEADER` \| `SALES_REP`) |
| GET | `/api/v1/users/invitations` | — (pendientes) |
| POST | `/api/v1/users/invitations` | `{ email, role }` → 201 |
| DELETE | `/api/v1/users/invitations/:id` | — (revoca) |
| POST | `/api/v1/auth/invitations/accept` | `{ token, password, firstName, lastName }` → 201 y cookies de sesión |
| DELETE | `/api/v1/company-contacts/:id` | — (borrado suave; solo gestión; 409 `COMPANY_CONTACT_HAS_CONTACTS` si tiene contactos activos) |
| GET | `/api/v1/products/search` | Query de filtrado (sección 8) → `{ data, total, page, limit }` |
| POST | `/api/v1/products` | `{ name, description?, basePrice?(texto decimal), formulaId?(uuid), isActive? }` → 201 |
| PATCH | `/api/v1/products/:id` | Igual que crear, todo opcional; `null` quita `description`, `basePrice` o `formulaId` |
| DELETE | `/api/v1/products/:id` | — (borrado suave; solo gestión) |
| GET | `/api/v1/formulas/search` | Query de filtrado (sección 8) → `{ data, total, page, limit }` |
| POST | `/api/v1/formulas` | `{ name, expression, variables: [{ name, label }] }` → 201 |
| PATCH | `/api/v1/formulas/:id` | Igual que crear, todo opcional; la expresión se vuelve a validar |
| DELETE | `/api/v1/formulas/:id` | — (borrado suave; solo gestión; 409 `FORMULA_IN_USE` si un producto la usa) |
| GET | `/api/v1/quotes/search` | Query de filtrado → `{ data, total, page, limit }`; un comercial solo ve las suyas |
| GET | `/api/v1/quotes/:id` | — → cotización con ítems; `displayStatus` es `EXPIRED` si venció |
| POST | `/api/v1/quotes` | `{ leadId?, contactId?, companyContactId? (al menos uno), validUntil?, discountRate?, notes?, items: [{ productId?, description?, quantity, variables?, unitPrice?, priceOverrideReason?, discountRate?, taxRate? }] }` → 201 |
| PATCH | `/api/v1/quotes/:id` | Igual, todo opcional; solo borradores (409 `QUOTE_NOT_EDITABLE`); `items` reemplaza todos |
| DELETE | `/api/v1/quotes/:id` | — (borrado suave; solo borradores) |
| POST | `/api/v1/quotes/:id/send`, `/accept`, `/reject`, `/revise` | — → cotización; `revise` responde 201 con la versión siguiente |

### Correo transaccional (F2-T01)

- **Piezas:** puertos `IEmailService` (enviar un mensaje), `IEmailTemplateRenderer` (plantilla + datos → asunto, HTML y texto) e `IEmailLogRepository`; servicio de aplicación `TransactionalEmailSender` (`application/services/`), que renderiza, envía y deja el envío en `EmailLog`. Nunca lanza por un fallo del proveedor: devuelve `false`, registra `FAILED` con el motivo (`PROVIDER_REJECTED`, `PROVIDER_UNREACHABLE`, `UNEXPECTED_ERROR`) y un aviso técnico sin el destinatario.
- **Plantillas (D-28):** MJML en `src/infrastructure/email/templates/` (cabecera, pie y una por correo: verificación, recuperación, contraseña cambiada, invitación, cuenta ya registrada), en español. `pnpm emails:build` las compila a `compiledEmailTemplates.ts`; MJML 5.4.1 es solo devDependency y no entra en la imagen. Un test falla si el módulo generado no coincide. Asunto, vista previa y texto plano viven en `CompiledEmailTemplateRenderer`, que escapa los datos en el HTML y quita saltos de línea del asunto.
- **Proveedor:** `ResendEmailService` llama a `POST https://api.resend.com/emails` con axios (URL fija, 10 s de plazo, sin redirecciones, respuesta validada con Zod; el error nunca lleva la clave). Se usa axios en lugar del SDK `resend` para no añadir dependencias (D-49). `EMAIL_PROVIDER=log` (desarrollo) escribe el texto del correo en el log; `memory` (tests) lo guarda en `memoryEmailOutbox`. Hasta que Operaciones verifique el dominio, `RESEND_API_KEY` es de ejemplo y los envíos quedan como `FAILED` en `EmailLog`.
- **`EmailLog`:** tenant (explícito: registro y recuperación no tienen sesión), usuario si existe, plantilla, destinatario, estado, id del proveedor y motivo del fallo. Nunca el cuerpo: lleva tokens de un solo uso. Historial inmutable, sin borrado suave.

### Logs y auditoría (F1-T07)

- **Logs técnicos:** puerto `ILogger` (`application/ports/services/ILogger.ts`), adaptador `WinstonLogger` (una línea JSON por entrada a la salida estándar), instancia `appLogger` con `LOG_LEVEL`. Cada entrada lleva `requestId`, `userId` y `tenantId` de la petición en curso. `redactSensitiveData` sustituye por `[REDACTED]` cualquier clave que contenga `password`, `token`, `secret`, `cookie`, `authorization`, `apikey`/`api-key` o `database_url`, y quita usuario y contraseña de las URLs de conexión dentro de textos y errores.
- **Id de petición:** `createRequestContextMiddleware` (primero en `app.ts`) acepta un `X-Request-Id` entrante si tiene de 8 a 64 caracteres `[A-Za-z0-9-]`, si no genera un UUID; lo devuelve en la respuesta y lo guarda en `cross-cutting/requestContext.ts` (`AsyncLocalStorage`). La autenticación añade ahí el usuario y el tenant.
- **Log de acceso:** una entrada por petición con método, ruta sin query, código y duración.
- **Prisma (H25):** fuera de desarrollo solo `warn` y `error`; en desarrollo, además, el texto SQL y la duración de cada consulta a nivel `debug`, nunca sus parámetros.
- **Auditoría de negocio:** puerto `IAuditLogger` con `AuditAction` y `AuditEntity`, adaptador `PrismaAuditLogger`. Lo reciben todos los casos de uso que modifican datos, más registro y login; los que modifican reciben además `ITransactionManager` (F2-T08). Autor y empresa salen de la sesión; solo registro y login indican `publicActor`. `metadata` guarda `requestId` y, en modificaciones, `changedFields` (nombres, nunca valores). Un login con correo inexistente no se audita (no hay usuario ni empresa): queda solo en el log técnico. `tests/api/security/auditTrail.test.ts` recorre todas las rutas que modifican datos y exige su registro.
- **Atomicidad (F2-T08, F1-S1):** todo caso de uso que modifica datos escribe la modificación y su registro de auditoría dentro de `ITransactionManager.runInTransaction`: si la auditoría falla, la modificación se revierte y la petición responde 500. `tests/api/security/auditAtomicity.test.ts` recorre todas las rutas que modifican con la auditoría forzada a fallar y exige que el registro quede intacto. El login correcto y fallido se audita sin transacción (no modifica datos de negocio).

### Errores (F1-T02)

Toda respuesta de error: `{ "error": { "code": "<ErrorCode>", "message": "<texto técnico en inglés>", "details"?: [{ "path": [...], "message": "..." }] } }`. Sin trazas.

| HTTP | Códigos |
|---|---|
| 400 | `VALIDATION_FAILED` (con `details`), `PASSWORD_TOO_WEAK`, `PASSWORD_BREACHED`, `INVALID_ACCOUNT_TOKEN`, `MISSING_REQUIRED_DATA`, `MALFORMED_JSON`, `INVALID_REQUEST_BODY`, `INVALID_LEAD_STATUS`, `ASSIGNED_USER_NOT_FOUND`, `INVALID_COMPANY_CONTACT`, `INVALID_FILTERS_FORMAT`, `FILTER_FIELD_NOT_ALLOWED`, `FILTER_OPERATOR_NOT_ALLOWED`, `INVALID_FILTER_VALUE`, `SORT_FIELD_NOT_ALLOWED` |
| 401 | `INVALID_CREDENTIALS`, `SESSION_REQUIRED` (sin cookie), `SESSION_EXPIRED` (token de acceso caducado: renovar, F2-T02), `INVALID_SESSION` (token inválido, sesión revocada o caducada, usuario desactivado) |
| 403 | `EMAIL_NOT_VERIFIED` (D-12), `INSUFFICIENT_PERMISSIONS`, `CANNOT_MANAGE_OWN_ACCOUNT` (F2-T05), `ORIGIN_NOT_ALLOWED` (CSRF, F2-T07) |
| 404 | `LEAD_NOT_FOUND`, `LEAD_STATUS_NOT_FOUND`, `CONTACT_NOT_FOUND`, `COMPANY_CONTACT_NOT_FOUND`, `USER_NOT_FOUND`, `INVITATION_NOT_FOUND`, `RECORD_NOT_FOUND`, `ROUTE_NOT_FOUND` (ruta inexistente) |
| 409 | `EMAIL_ALREADY_IN_USE` (ya no lo devuelve el registro, F2-T04), `DEFAULT_LEAD_STATUS_MISSING`, `DEFAULT_LEAD_STATUS_REQUIRED` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 500 | `INTERNAL_ERROR` (mensaje genérico; el detalle va al log técnico con `appLogger.error`) |

Un recurso de otro tenant responde igual que uno inexistente (404).

### Motor de filtrado genérico
`GET /api/v1/<recurso>/search?search=texto&filters=[{"field":"statusId","operator":"equals","value":"…"}]&page=1&limit=20&sortBy=createdAt&sortDir=desc`

Desde F1-T12 la query la valida `src/infrastructure/web/filters/parseFilterQuery.ts` antes de llegar al caso de uso (H11). Cada campo de `*FilterConfig.ts` declara `type` (`text`, `number`, `date`, `id`) y, si se puede ordenar, `sortable: true`. Un valor de otro tipo (por ejemplo un objeto `{ "not": … }`, que Prisma interpretaría como operador) responde 400 `INVALID_FILTER_VALUE` con `details[].path = ['filters', i, 'value']`. Las fechas aceptan `2026-01-31` o ISO con zona y llegan como `Date`; `in` exige una lista de 1 a 100 valores; un texto, 200 caracteres como máximo; como mucho 20 filtros. Sin `sortBy`, orden por `createdAt` descendente con `id` de desempate; `sortBy` fuera de la lista responde 400 `SORT_FIELD_NOT_ALLOWED`. El alcance por rol (un comercial solo ve sus leads) lo aplica `GenericListFilteredUseCase` con `ownershipScope`, no el controller.
- `search`: OR `contains` (insensible a mayúsculas) sobre campos con `searchable:true`.
- `filters`: JSON array. Campo u operador fuera del `filterConfig` → 400 `FILTER_FIELD_NOT_ALLOWED` / `FILTER_OPERATOR_NOT_ALLOWED`; `filters` que no es una lista JSON de `{ field, operator, value }`, o un parámetro repetido → 400 `INVALID_FILTERS_FORMAT`.
- `page` default 1; `limit` default 20, máx 100 (valores inválidos caen al default).
- Respuesta: `{ data, total, page, limit }`.
- Operadores: `contains`, `equals`, `in`, `gt`, `gte`, `lt`, `lte`.
- Piezas: `GenericListFilteredUseCase<Entity,DTO>` (use case reutilizable), `IFilterableRepository` (`findFiltered`+`countFiltered`), `BasePrismaRepository.buildFilterWhere`, `*FilterConfig.ts`.
- Los `ListFiltered*UseCase` son solo `type alias` del genérico.

Campos filtrables (✔ = searchable):
- **Lead:** companyName✔, contactName✔, email✔, phone✔, notes✔ (contains/equals) · source (contains/equals) · statusId, assignedToId (equals/in) · estimatedValue, expectedCloseDate, createdAt (equals/gt/gte/lt/lte)
- **Contact:** firstName✔, lastName✔, email✔, phone✔ · companyId (equals/in) · createdAt
- **CompanyContact:** name✔, industry✔, phone✔, email✔, city✔ · taxNumber, address, state, zip, country (contains/equals) · createdAt

---

## 9. Cómo agregar una entidad nueva

Referencias: **Lead** (con roles, soft delete, validaciones), **CompanyContact** (CRUD simple más completo), **Contact** (el más simple). Copia el patrón de ellos.

Checklist (`[E]` = Entidad PascalCase, `[e]` = camelCase):
1. `prisma/schema.prisma` (si falta el modelo; incluir `tenantId`, `deleted`) + `pnpm migrate`.
2. `domain/entities/[E].ts` — constructor `readonly`, `static create()` (`crypto.randomUUID()`), `static fromPrisma()` (`null → undefined`).
3. `application/dtos/` — `[E]DTO`, `Create[E]DTO`, `Update[E]DTO`.
4. `application/ports/repositories/I[E]Repository.ts` — extiende `IFilterableRepository<[E]>`; `findByTenant`, `create`, `findById`, `update`, (`delete`).
5. `application/ports/mappers/I[E]Mapper.ts` (extiende `IMapper`) + `application/mappers/[E]Mapper.ts`.
6. `application/use-case/[e]s/` — get, create, update, (delete), listFiltered (type alias).
7. `infrastructure/persistence/repositories/Prisma[E]Repository.ts` — extiende `BasePrismaRepository`; usa `tenantWhere()`; `findById` con `deleted:'INUSE'` y tenant; `delete` → `softDeleteRegister(this.prisma.[e], id)`.
8. `infrastructure/persistence/filters/[e]FilterConfig.ts`.
9. `cross-cutting/modules/[E]Module.ts` — un `get…UseCase()` por use case — y su propiedad en `cross-cutting/container.ts`.
10. `infrastructure/web/controllers/[e]Controllers.ts` (`getAll`, `create`, `update`, `getFiltered`, …; roles se leen de `req.user`).
11. `presentation/schemas/[e]Schema.ts` (Zod) y `presentation/routes/[e]Routes.ts` (patrón de `leadRoutes.ts`).
12. `app.ts` — `app.use('/api/[e]', [e]Router(jwtService))`.

Convenciones: las restricciones por rol se pasan al use case (`role`, `userId`) o se aplican en el controller para filtrados; todo repositorio filtra por tenant y `deleted:'INUSE'`; errores con las clases de `src/domain/errors/` y un `ErrorCode` (`docs/guia-de-codigo.md`, sección 10).

---

## 10. Decisiones técnicas

- JWT en cookie HTTP-only (no `localStorage`) para mitigar XSS.
- `AsyncLocalStorage` para `tenantId`: no se pasa manualmente por las capas.
- DI manual por request (`ScopedContainer`) en vez de librería.
- Prisma con driver adapter `pg` (pool nativo).
- Whitelist de campos/operadores en `filterConfig`: imposible filtrar por columnas internas.
- Soft delete (`deleted = 'DELETED'`) en vez de borrado físico; las consultas filtran `INUSE`.
- Roles evaluados solo por la política de `application/policies` (F1-T04). El alcance del listado filtrado lo aplica el caso de uso (`ownershipScope`, F1-T12).

---

## 11. Entorno

`.env` (ver `.env.example`). `src/config/env.ts` valida las variables con Zod al importarse (F1-T01): si alguna falta o es inválida, la API no arranca y lanza `InvalidEnvironmentError` con el nombre de cada variable y el problema, nunca su valor.

| Variable | Regla | Por defecto |
|---|---|---|
| `NODE_ENV` | `development`, `test` o `production` | Ninguno: obligatoria |
| `DATABASE_URL` | Empieza por `postgres://` o `postgresql://` | Ninguno: obligatoria |
| `JWT_SECRET` | Al menos 32 caracteres (H1) | Ninguno: obligatoria |
| `JWT_EXPIRATION` | Vida del token de acceso: número + unidad (`ms`, `s`, `m`, `h`, `d`, `w`, `y`) | `15m` (D-09; antes `7d`) |
| `REFRESH_TOKEN_EXPIRATION` | Vida absoluta de la sesión, mismo formato | `7d` |
| `PORT` | Entero entre 1 y 65535 | `4000` |
| `CORS_ALLOWED_ORIGINS` | Orígenes exactos separados por comas (`https://app.ejemplo.com`); nunca `*` | Vacío: ningún origen |
| `TRUST_PROXY` | Número entero de proxies de confianza | `0` |
| `RATE_LIMIT_GLOBAL_MAX_REQUESTS` | Entero positivo | `100` |
| `RATE_LIMIT_AUTH_MAX_REQUESTS` | Entero positivo | `10` |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` o `silent` (solo tests) | `info` |
| `EMAIL_PROVIDER` | `resend`, `log` (escribe el correo en el log) o `memory` (tests). En producción solo `resend` | `log` |
| `RESEND_API_KEY` | Clave de Resend (`re_…`). Obligatoria con `resend`; secreto, sin valor por defecto | Ninguno |
| `EMAIL_FROM` | Remitente verificado, `Nombre <correo>` o `correo`. Obligatorio con `resend` | `QuotesFlow <no-reply@localhost>` |
| `PASSWORD_BREACH_CHECK` | `hibp` (Have I Been Pwned) u `off` (tests, sin internet) | `hibp` |
| `APP_BASE_URL` | URL del frontend para los enlaces de los correos, sin barra final; `https` en producción | `http://localhost:5173` |

Una variable vacía (`JWT_SECRET=`) cuenta como ausente. Docker Compose además requiere `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.

```bash
pnpm install
pnpm dev            # nodemon + tsx src/server.ts
pnpm migrate        # prisma migrate dev
pnpm studio         # Prisma Studio
pnpm test           # todos los tests (integration y api necesitan Docker en marcha)
pnpm test:unit      # solo unitarios, sin Docker
pnpm test:integration
pnpm test:api
pnpm test:coverage  # todos + cobertura; falla bajo 80 % global o 90 % en domain/application
pnpm test:build     # compila como producción y arranca el servidor compilado (sin Docker)
pnpm typecheck      # src/ y tests/
pnpm lint           # ESLint + prettier --check   (pnpm lint:fix / pnpm format corrigen)
pnpm arch:check     # reglas de capas (R4) con dependency-cruiser
pnpm check:context develop   # R3: CONTEXT.md actualizado respecto a la rama base
pnpm docs:permissions        # regenera docs/security/matriz-permisos.md desde la matriz del código
pnpm docs:openapi            # regenera docs/openapi.json (OpenAPI 3.1) desde los esquemas Zod
pnpm emails:build            # recompila las plantillas MJML de correo a src/infrastructure/email/compiledEmailTemplates.ts
pnpm typecheck:tests
pnpm build          # tsc + tsc-alias  ->  pnpm start (node dist/server.js)
docker-compose up   # DESARROLLO (Dockerfile.dev): db (host 3363), backend (4000), prisma-studio (3364)
docker build -t quotesflow-api .                        # imagen de PRODUCCIÓN (Dockerfile, etapa runtime)
docker build --target migrator -t quotesflow-migrator . # `prisma migrate deploy`; en producción lo lanza Operaciones (R6)
```

**Imágenes Docker (F0-T08).** `Dockerfile` es multi-etapa: `build` instala con `--frozen-lockfile`, genera Prisma, compila y poda a producción; `runtime` lleva solo `dist/`, `package.json` y las dependencias de producción, sin pnpm, como usuario `node` (uid 1000), con `HEALTHCHECK` sobre `/health` (unos 570 MB, 180 MB de `node_modules`); `migrator` lleva el CLI de Prisma y las migraciones. pnpm 11.28.10 fijado en todas. La API atiende SIGTERM/SIGINT con apagado ordenado (F1-T08); `--init` (o `init: true`) sigue recomendado. La API no aplica migraciones al arrancar. `Dockerfile.dev` + `docker-compose.yml` son solo de desarrollo; el compose exige `JWT_SECRET` en `.env` (sin valor por defecto).
Git: rama principal `develop`; ramas `feat/...`; commits en español tipo `feat/ descripción`.

---

## 12. Tests

Guía completa: `tests/README.md`. Resumen de lo que hay que saber:

- **Cuatro proyectos Vitest:** `unit` (dobles en memoria, sin base de datos), `integration` (repositorios contra PostgreSQL real), `api` (aplicación real con supertest), `build` (compila como `pnpm build` y arranca el servidor compilado; regresión de H20).
- **Base de datos de test:** un contenedor efímero `postgres:15` por ejecución, con las migraciones reales aplicadas; cada archivo de test recibe su propia base y cada test empieza con las tablas vacías. Nunca se usa la base del `.env`.
- **Inventario de rutas** (`tests/support/http/apiRoutes.ts`): la suite falla si la aplicación registra una ruta no declarada ahí. Toda ruta declarada como protegida se prueba sola contra peticiones sin sesión y con token falsificado.
- **Usuarios de test:** `persistUser` y `buildUser` crean usuarios con el correo verificado (D-12); `emailVerifiedAt: null` / `undefined` para uno pendiente. En API, los correos quedan en `memoryEmailOutbox` (`EMAIL_PROVIDER=memory`); en unitarios, `createAccountMailing()` (`support/doubles/accountMailing.ts`) da bandeja, emisor de tokens y `tokenSentTo(correo)`.
- **Sesiones de test (F2-T02):** `persistUser` abre una sesión con el mismo id que el usuario (`testSessionIdFor`) y refresh token `testRefreshTokenFor(userId)`; `sessionCookieFor(usuario)` firma un token sobre ella y `refreshCookieFor(usuario)` da su cookie de refresh.
- **Matrices de seguridad** (R5): `tests/api/security/tenantIsolation.test.ts` y `roles.test.ts` (casos de negocio concretos). Además, desde F1-T05, `routeCoverageTenantIsolation.test.ts` y `routeCoverageRoles.test.ts` recorren todo `authenticatedRoutes`: cada ruta declara su escenario en `tests/support/http/routeSecurityScenarios.ts` (acción de la matriz, recurso, operación) y la suite falla si falta. Para cada ruta se prueba que el dueño de otra empresa no lista, no modifica y no crea datos fuera de su tenant (404 y registro intacto), y que cada rol recibe lo que dice `permissionMatrix` (2xx o 403, sobre el registro propio y sobre el de otro comercial).
- **Defectos conocidos:** desde F2-T03 no queda ninguno (el último era H7). `itKnownDefect(hallazgo, …)` describe el comportamiento correcto de un hallazgo aún sin corregir. Se ejecuta siempre y pasa solo mientras el defecto exista; al corregirlo hay que convertirlo en `it(...)`. H2 pasó a regresión en F2-T02 y H7 en F2-T03. El de F1-T14 pasó a regresión en F1-T14. H11 terminó de pasar a regresión en F1-T12. H10 y H9 en contactos pasaron a regresión en F1-T16. H15 pasó a regresión en F1-T10; H3 y H9 en leads, en F1-T13. Los 13 de H5 y uno de H11 pasaron a regresión en F1-T02; los de H4 y H14, en F1-T06.
- **Límite a tener en cuenta:** el limitador global (100 peticiones / 15 min) vale también en los tests; un archivo de tests de API no puede superar 100 peticiones, ni 50 a `/api/v1/auth` (los tests suben ese cupo desde 10).
- **Cobertura actual:** 98 % de sentencias y 93 % de ramas (umbral: 80 % global, 90 % en `domain` y `application`).

---

## 13. Registro de cambios

| Fecha | Tarea | PR | Cambio |
|---|---|---|---|
| 2026-11-16 | F0-T02 | pendiente | Framework de tests (Vitest), dobles en memoria, fábricas de datos, base de datos efímera y 453 tests sobre el código existente. Sin cambios en `src/` ni en `prisma/`. |
| 2026-11-16 | F0-T07 | pendiente | Build de producción reparado (H20): `paths` sin `baseUrl`, conversión de `settings` a JSON de Prisma en `PrismaTenantRepository`, `tsc-alias` en `pnpm build`. Script `pnpm typecheck`. Proyecto de tests `build` (2 tests). |
| 2026-11-16 | F0-T09 | pendiente | Fuera `nodemailer`, `@types/nodemailer` (D-30), `node-cron` (D-27) y `http-status-codes` (sin uso ni plan). Actualización dentro de rangos (express 5.3.0, prisma 7.10.1, zod 4.6.7, multer 2.5.0…), `axios` fijado a 1.21.1 (D-49) y pnpm fijado a 11.28.10. `pnpm audit`: de 94 avisos a 2 moderados de desarrollo. |
| 2026-11-16 | F0-T03 | pendiente | ESLint + Prettier. Todo el código formateado con Prettier (solo formato, commit `ebbe7e1`). 77 violaciones heredadas congeladas en `eslint-suppressions.json`. 14 tests de la regla local. Sin cambios de lógica en `src/`. |
| 2026-11-16 | F0-T04 | pendiente | `dependency-cruiser` con las reglas de R4 (`pnpm arch:check`); `src/` sin violaciones. Fixture `tests/fixtures/architecture` y 8 tests que comprueban que cada regla detecta su violación. |
| 2026-11-16 | F0-T05 | pendiente | Hooks de git con lefthook: pre-commit (ESLint + Prettier), pre-push (typecheck, arquitectura, tests unitarios). `allowBuilds` permite el `postinstall` de lefthook. |
| 2026-11-16 | F0-T08 | pendiente | `Dockerfile` de producción multi-etapa (Node 24.18.0 por digest, no root, pnpm fijado, `--frozen-lockfile`, healthcheck, etapa `migrator`) y `Dockerfile.dev` + compose de desarrollo. Probado de extremo a extremo: migraciones, registro (201) y lectura autenticada (200) contra la imagen. H16 y H17 resueltos. |
| 2026-11-16 | F0-T06 | pendiente | CI en GitHub Actions: calidad, tests con cobertura, auditoría de dependencias, gitleaks, comprobación de R3 y prueba de la imagen Docker. Script `pnpm check:context` con 6 tests. Validado con actionlint; aún no se ha ejecutado en GitHub. |
| 2026-11-16 | F1-T01 | pendiente | Variables de entorno validadas con Zod al arrancar (`parseEnvironment`, `InvalidEnvironmentError`). `JWT_SECRET` obligatorio de 32 caracteres o más, sin valor por defecto (H1); `NODE_ENV` y `DATABASE_URL` obligatorias; formato de `JWT_EXPIRATION` y `PORT` comprobado. Fuera el `any` de `JwtTokenService` (una supresión menos). 18 tests unitarios y 1 de build (el servidor compilado no arranca sin `JWT_SECRET`). |
| 2026-11-16 | F1-T02 | pendiente | Jerarquía de errores en `src/domain/errors/` (`ApplicationError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`, `UnauthorizedError`, `ErrorCode`) y manejador global con formato único `{ error: { code, message, details? } }`, sin trazas, más 404 JSON para rutas inexistentes (H5). `validateBody` pasa al manejador los errores que no son de Zod (H24). Filtros con campo u operador no permitido responden 400. Mensajes de error en inglés (R11). 13 tests de H5 y 1 de H11 pasan a regresión; 39 tests nuevos. Cambian 2 aserciones existentes por el formato nuevo (`body.errors` pasa a `body.error.details`). |
| 2026-11-16 | F1-T03 | pendiente | Puerto `ITransactionManager` y adaptador `PrismaTransactionManager` (`$transaction` interactivo + `AsyncLocalStorage`); `BasePrismaRepository.prisma` usa la transacción abierta. Registro atómico (H8): empresa, dueño y estados en una transacción, con bcrypt fuera. `PrismaUserRepository.create` traduce el correo duplicado (P2002) a 409. 12 tests nuevos (unitarios, integración contra PostgreSQL y API con fallo simulado y registros simultáneos). La construcción del caso de uso en `unit/application/use-case/auth.test.ts` recibe el nuevo parámetro. |
| 2026-11-16 | F1-T04 | pendiente | Políticas de autorización centralizadas (H12): `permissionMatrix`, `can` y `scopeFor` en `src/application/policies/authorizationPolicy.ts`; los casos de uso de leads y estados y el filtrado de leads dejan de comparar roles. Deniega por defecto (rol desconocido, `own` sin usuario). Antes un `SALES_REP` sin `userId` habría visto todos los leads. `docs/security/matriz-permisos.md` generado con `pnpm docs:permissions` (`scripts/docs/`) y comprobado por test. 66 tests nuevos (sobre todo combinaciones rol × acción); la matriz de roles de la API pasa sin cambios. |
| 2026-11-16 | F1-T05 | pendiente | Suites de seguridad sobre todo el inventario de rutas (R5): `routeCoverageTenantIsolation.test.ts` y `routeCoverageRoles.test.ts`, con escenarios por ruta en `tests/support/http/routeSecurityScenarios.ts`. La suite falla si una ruta protegida no tiene escenario o si un escenario apunta a una ruta que ya no existe. Lo esperado por rol sale de `permissionMatrix`. 82 tests nuevos; sin cambios en `src/`. |
| 2026-11-16 | F1-T06 | pendiente | CORS con lista blanca y credenciales (H4), `trust proxy` configurable, cuerpo JSON máximo 100 kb (H14) y límite propio de 10 peticiones / 15 min en `/api/v1/auth` además del global (H6), con 429 `TOO_MANY_REQUESTS` en formato único. Variables nuevas validadas en `env.ts`: `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, `RATE_LIMIT_GLOBAL_MAX_REQUESTS`, `RATE_LIMIT_AUTH_MAX_REQUESTS`. H4 y H14 pasan a regresión. 25 tests nuevos. Cambia la aserción del test de F1-T01 que compara la configuración completa (campos nuevos). |
| 2026-11-16 | F1-T08 | pendiente | `GET /ready` (la base de datos responde en menos de 2 s; si no, 503 `SERVICE_UNAVAILABLE` sin detalles) junto a `GET /health`, que no toca la base. Apagado ordenado en `server.ts` con `createGracefulShutdown`: deja de aceptar conexiones, termina las peticiones en curso, cierra Prisma y sale con 0; a los 10 s corta las conexiones y sale con 1. 7 tests nuevos; `/ready` añadida al inventario de rutas. |
| 2026-11-16 | F1-T09 | pendiente | `ScopedContainer` dividido por módulo en `src/cross-cutting/modules/` (`AuthModule`, `LeadModule`, `LeadStatusModule`, `ContactModule`, `CompanyContactModule`, con `ModuleDependencies`); las rutas piden `req.container!.<módulo>.get…UseCase()`. Sin cambio de comportamiento. 20 tests nuevos del contenedor. |
| 2026-11-16 | F1-T10 | pendiente | Migración `add_tenant_id_to_history_and_quote_items` (H15): `tenantId` en `LeadStatusHistory` y `QuoteItem`, relleno desde el registro padre, NOT NULL, FK a `Tenant` en cascada e índice. Verificada contra una base con datos y con `prisma migrate diff` (sin diferencias). H15 pasa a regresión; 2 tests nuevos de esquema (ningún `tenantId` nullable, todos con FK). Pendiente: aplicarla en producción (Operaciones, R6). |
| 2026-11-16 | F1-T13 | pendiente | Cambio de estado como caso de uso propio (`ChangeLeadStatusUseCase`, `PATCH /api/v1/leads/:id/status`): lead y `LeadStatusHistory` en una transacción, con `ILeadStatusHistoryRepository`, `PrismaLeadStatusHistoryRepository`, entidad `LeadStatusChange` y `ILeadRepository.updateStatus`. `updateLeadSchema` deja de aceptar `statusId`. Crear y reasignar leads exige un usuario activo de la empresa (H9); `PrismaUserRepository.findById` excluye borrados. Login con `findActiveByEmail` (H3). H3 (3) y H9 en leads (1) pasan a regresión; 37 tests nuevos. Cambia la construcción de `UpdateLeadUseCase` en 3 tests unitarios (nuevo parámetro). |
| 2026-11-16 | F1-T16 | pendiente | Borrado suave de contactos y empresas cliente (`DeleteContactUseCase`, `DeleteCompanyContactUseCase`, `POST /api/v1/contacts/:id`, `POST /api/v1/company-contacts/:id`), solo para gestión (acciones nuevas `contact:delete` y `company-contact:delete`); una empresa con contactos activos no se borra (409). `findById` y `update` filtran `deleted` (H10). El `companyId` de un contacto debe ser una empresa cliente del tenant (H9). Suite de permisos por rol repartida en dos archivos por el cupo de peticiones. H10 (3) y H9 en contactos (1) pasan a regresión; 43 tests nuevos. Cambia la preparación de 2 archivos de tests unitarios (nuevo parámetro y empresas cliente sembradas). |
| 2026-11-16 | F1-T12 | pendiente | Validación de la query de los listados filtrados (H11) en `parseFilterQuery`: tipo de cada valor según `type` del campo (`text`, `number`, `date`, `id`), `in` con lista, límites de tamaño, orden por lista blanca (`sortBy`, `sortDir`, campos `sortable`) con orden por defecto estable. Códigos `INVALID_FILTER_VALUE` y `SORT_FIELD_NOT_ALLOWED`. El alcance por rol pasa del controller a `GenericListFilteredUseCase` (`ownershipScope`). El último defecto conocido de H11 pasa a regresión; 31 tests nuevos. Las configuraciones de filtros de 2 tests unitarios ganan el campo `type`, ahora obligatorio. |
| 2026-11-16 | F1-T07 | pendiente | Logger estructurado (H13): puerto `ILogger`, `WinstonLogger` en JSON, redacción de datos sensibles, `X-Request-Id` y contexto de petición con `AsyncLocalStorage`, log de acceso. Prisma ya no registra consultas con datos (H25). Auditoría de negocio: puerto `IAuditLogger`, `PrismaAuditLogger`, registro en toda modificación, registro de empresa y login. Variable `LOG_LEVEL`. `console.*` sustituido por el logger. 35 tests nuevos. Cambia la construcción de 25 casos de uso en 6 archivos de tests unitarios (nuevo parámetro), el test de `errorHandler` usa un logger falso en lugar de espiar `console.error` y el test de configuración completa añade `LOG_LEVEL`. |
| 2026-11-16 | F1-T14 | pendiente | Estados de lead: `type` OPEN/WON/LOST (D-51, migración `add_type_to_lead_status_config`, el predeterminado debe ser OPEN); crear y modificar en transacción (el defecto conocido F1-T14 pasa a regresión) con 409 `LEAD_STATUS_ORDER_TAKEN`; borrado suave (`POST /api/v1/lead-statuses/:id`, acción `lead-status:delete`, no el predeterminado ni con leads, libera su `order`); reordenamiento transaccional (`PATCH /api/v1/lead-statuses/order`). Escenarios de seguridad con operación nueva `bulkUpdate`. 40 tests nuevos. Las construcciones de los casos de uso de estados en 2 archivos unitarios reciben el gestor de transacciones. |
| 2026-11-16 | F1-T15 | pendiente | Nombres y tipos: `PrismaLeadStatusConfig.ts` pasa a `PrismaLeadStatusConfigRepository.ts` y `LeadConfigStatusMapper.ts` a `LeadStatusConfigMapper.ts`; `LeadStatusConfig.updateAt` pasa a `updatedAt`; `deleted` tipado con el enum `DeletedState`, sin literales sueltos; los listados llaman a `toDTO` con su objeto en lugar de pasarlo sin enlazar. 4 tests de regresión nuevos. Cambian solo rutas de import y el nombre `updatedAt` en tests existentes. |
| 2026-11-16 | F1-T17 | pendiente | Migración `add_owner_and_document_to_clients`: `ownerId` en contactos y empresas cliente; `documentType` y `documentNumber` en contactos; `documentNumber` normalizado del NIT en empresas. Visibilidad por responsable (D-18) en listados, filtrado (`ownershipScope` sobre `ownerId`) y modificación, con acciones nuevas `contact:assign-owner` y `company-contact:assign-owner`; los clientes sin responsable solo los ve gestión (Q-005). Documento normalizado y único por empresa entre clientes activos (D-19, 409). Matriz de permisos regenerada. 27 tests nuevos. Cambian tests existentes por D-18: los de `api/contacts.test.ts` usan clientes del propio comercial, la matriz de `authorizationPolicy.test.ts` pasa contactos a "solo los suyos", el DTO de empresa incluye `documentNumber` y las construcciones y llamadas de los casos de uso de clientes reciben el repositorio de usuarios y el actor. |
| 2026-11-16 | F1-T18 | pendiente | Código al día con R11 a R13: `eslint-suppressions.json` vacío (las 77 violaciones heredadas corregidas, Q-008); identificadores renombrados (`leadmap`, `rolUser`, `existingRepo`, `leadProperty`, `statusProperty`, `*Repo`, `*Map`, `als`…); clases de controller en PascalCase; enum `DeletedState` con miembros `ACTIVE`/`INACTIVE`; bcrypt con coste 12 (D-10, antes 10); JSDoc en todos los puertos, casos de uso y entidades; `docs/modulos/` de auth, leads, estados de lead, contactos y filtrado. Sin cambio de comportamiento salvo el coste de bcrypt. En tests existentes solo cambian `DeletedState.Active/Inactive` por `ACTIVE/INACTIVE` y 20 números mágicos por constantes con nombre. |
| 2026-11-16 | F1-T11 | pendiente | API REST bajo `/api/v1` (D-06): recursos `auth`, `leads`, `lead-statuses`, `contacts`, `company-contacts`; `GET /recurso`, `GET /recurso/search`, `POST /recurso`, `PATCH /recurso/:id`, `DELETE /recurso/:id`, `PATCH /leads/:id/status`, `PATCH /lead-statuses/order`. Las rutas anteriores dejan de existir. OpenAPI 3.1 generado desde los esquemas Zod (D-07) en `docs/openapi.json` con `pnpm docs:openapi` (`@asteasolutions/zod-to-openapi` 9.1.0 como devDependency, fuera de la imagen); un test compara el documento con el código y con el inventario de rutas. CI y documentación de módulos al día. 4 tests nuevos. En tests existentes cambian las rutas centralizadas en `apiRoutes.ts`, los borrados pasan de POST a DELETE y los títulos que citaban rutas antiguas. |
| 2026-11-17 | F2-T10 | pendiente | `/health` y `/ready` se registran antes del limitador global (F1-S5): un orquestador que sondea a menudo ya no recibe 429. 2 tests de regresión. La suite del límite global agota el cupo con una ruta inexistente en lugar de `/health` (cambio declarado de un test existente). |
| 2026-11-17 | F2-T07 | pendiente | Protección CSRF por verificación de origen (D-14): `createOriginCheckMiddleware` en `httpSecurity.ts`, montado tras CORS con la misma lista blanca; 403 `ORIGIN_NOT_ALLOWED` en POST/PATCH/PUT/DELETE desde otro origen (también login y registro). OpenAPI documenta el 403 en las operaciones que modifican. 15 tests nuevos (11 unitarios, 4 de API). |
| 2026-11-17 | F2-T09 | pendiente | Migración `add_partial_unique_document_index` (F1-S2): índice único parcial del documento en `Contact` y `CompanyContact` entre clientes activos, con la función preview `partialIndexes` de Prisma y comprobación previa de duplicados. Los repositorios traducen la violación a 409 `DOCUMENT_ALREADY_REGISTERED` (`prismaErrors.ts`, compartido con `PrismaUserRepository`). Verificada con `prisma migrate diff` (sin diferencias) y sobre una base con duplicados (se detiene) y sin ellos. 8 tests nuevos (7 de integración, 1 de API con dos altas simultáneas). Pendiente: aplicarla en producción (Operaciones, R6). |
| 2026-11-17 | F2-T08 | pendiente | Auditoría en la misma transacción que la modificación (F1-S1) en los 9 casos de uso que aún la escribían después: crear, modificar y borrar leads, contactos y empresas cliente. Reciben `ITransactionManager` como último parámetro (los módulos del contenedor pasan `PrismaTransactionManager`). Suite nueva `auditAtomicity.test.ts` (14 tests, uno por ruta que modifica): sin el cambio fallaban los 9. Cambia la construcción de esos casos de uso en 4 archivos de tests unitarios (nuevo parámetro `RecordingTransactionManager`). |
| 2026-11-17 | F2-T01 | pendiente | Correo transaccional: puertos `IEmailService`, `IEmailTemplateRenderer`, `IEmailLogRepository`; `TransactionalEmailSender` (nunca lanza por el proveedor, registra cada envío); adaptadores `ResendEmailService` (axios, URL fija, respuesta validada), `LogEmailService` y `MemoryEmailService`; plantillas MJML compiladas con `pnpm emails:build` (D-28, `mjml` 5.4.1 como devDependency); migración `add_email_log`. Variables `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL` (en producción, Resend y https obligatorios). 47 tests nuevos. Cambian el test de configuración completa y sus variables de producción (añaden las de correo), la lista de tablas sin borrado suave del test de esquema (`EmailLog`) y la CI de la imagen Docker (variables de correo de ejemplo). | |
| 2026-11-17 | F2-T02 | pendiente | Sesiones (D-09): `UserSession` (migración `add_user_session`) con hash SHA-256 del refresh token, revocación y motivo; token de acceso JWT HS256 de 15 min con `sid`, emisor y audiencia fijos y sin rol (H2); `JwtTokenService` (antes `JwTokenService`); `SessionIssuer`, `RefreshSessionUseCase` (rotación con comparar y cambiar, reutilización revoca la sesión y se audita), `LogoutUseCase`, `LogoutAllSessionsUseCase`, `AuthenticateSessionUseCase` (sesión abierta, usuario y empresa activos, rol de la base en cada petición). Rutas `POST /auth/refresh`, `/auth/logout`, `/auth/logout-all` (acción `session:revoke-own`); cookie `refreshToken` solo en `/api/v1/auth`; caducidad de cada cookie igual a la de su token (H23). Código `SESSION_EXPIRED`. Variable `REFRESH_TOKEN_EXPIRATION`; `JWT_EXPIRATION` pasa a 15m por defecto. El cupo estricto por IP queda solo en registro y login. Operación de escenario `self` y grupo `sessions` en las suites de seguridad. Los 2 defectos conocidos de H2 pasan a regresión. 70 tests nuevos. Cambian: `persistUser` abre una sesión y `sessionCookieFor` firma con `sid`; los tests de `JwtTokenService`, del middleware y de `LoginUseCase` por el contrato nuevo (sin rol en el token, sesión en lugar de token suelto); el test del valor por defecto de `JWT_EXPIRATION` (7d → 15m); la lista de tablas sin borrado suave (`UserSession`). Matriz de permisos regenerada (necesita firma nueva). |
| 2026-11-17 | F2-T03 | pendiente | Política de contraseñas (D-11, H7): `PasswordPolicy` (12 caracteres a 72 bytes, distinta del correo, no filtrada) con el puerto `IBreachedPasswordChecker` y el adaptador `PwnedPasswordsChecker` (HIBP por rango, k-anonimato, relleno, 3 s, acepta si falla, Q-013); se aplica en el registro y `newPasswordSchema` la exige en el borde; el login ya no exige mínimo. Bloqueo progresivo por cuenta (migración `add_login_lockout_to_user`: 5 fallos → 1 min, doblando hasta 15 min; contador atómico) con auditoría `ACCOUNT_LOCKED` y `LOGIN_REJECTED_ACCOUNT_LOCKED`. Login de tiempo constante (H22): `IHashService.compareWithoutHash` con un hash bcrypt del mismo coste. Variable `PASSWORD_BREACH_CHECK`. El defecto conocido de H7 pasa a regresión: no queda ninguno. 50 tests nuevos. Cambian: la construcción de `RegisterCompanyAndOwnerUseCase` en el test unitario (nuevo parámetro), `FakeHashService` e `InMemoryUserRepository` implementan los métodos nuevos de sus puertos, y el test de configuración completa añade `PASSWORD_BREACH_CHECK`. |
| 2026-11-17 | F2-T04 | pendiente | Verificación de correo (D-12) y recuperación de contraseña: entidad `AccountToken` (migración `add_email_verification_and_account_tokens`, con `emailVerifiedAt` en `User` relleno para las cuentas existentes), `AccountTokenIssuer` (emitir anula los anteriores; canje atómico y en tiempo constante; `inspect` sin gastar), `AccountLinks` (token en el fragmento de la URL). Casos de uso `VerifyEmailUseCase`, `ResendEmailVerificationUseCase`, `RequestPasswordResetUseCase`, `ResetPasswordUseCase` (cierra todas las sesiones, quita el bloqueo, avisa por correo). El login exige correo verificado (403 `EMAIL_NOT_VERIFIED`). El registro responde 202 sin ids y no revela si el correo existe (H8 resuelto): aviso al dueño del correo, mismo bcrypt, registros simultáneos responden igual. Rutas `POST /auth/verify-email`, `/verify-email/resend`, `/password/forgot`, `/password/reset`, con el cupo estricto. Códigos `EMAIL_NOT_VERIFIED`, `INVALID_ACCOUNT_TOKEN`. 47 tests nuevos. Cambian por el contrato nuevo del registro (202 sin ids): 5 tests de `api/auth.test.ts`, el de correo duplicado de `api/errorResponses.test.ts`, el de `api/leadStatusLifecycle.test.ts`, el de registro de `api/security/auditTrail.test.ts`, 4 unitarios de `RegisterCompanyAndOwnerUseCase` y la CI de la imagen Docker (espera 202). `persistUser`, `buildUser` e `InMemoryUserRepository` cubren la verificación y los métodos nuevos del puerto. |
| 2026-11-17 | F2-T05 | pendiente | Usuarios de la empresa (D-16, D-17): entidad `UserInvitation` (migración `add_user_invitation`), acciones `user:list`, `user:invite`, `user:manage` y `manageableRolesByRole`/`canManageRole` en la política (documentados en la matriz, que necesita firma nueva). Casos de uso `ListTenantUsersUseCase`, `ListUserInvitationsUseCase`, `InviteUserUseCase` (correo `USER_INVITATION`, reinvitar revoca la anterior, 409 si el correo tiene cuenta), `RevokeUserInvitationUseCase`, `UpdateTenantUserUseCase` (nadie se gestiona a sí mismo ni al dueño; desactivar revoca sesiones) y `AcceptInvitationUseCase` (cuenta verificada y sesión abierta). Rutas `GET/PATCH /users`, `GET/POST/DELETE /users/invitations`, `POST /auth/invitations/accept`; `UserModule` en el contenedor. `PrismaTenantRepository.findById` excluye empresas borradas. Escenarios de seguridad `user` e `invitation` y grupo `users` en las suites. Códigos `USER_NOT_FOUND`, `INVITATION_NOT_FOUND`, `CANNOT_MANAGE_OWN_ACCOUNT`. 58 tests nuevos. `InMemoryUserRepository` cubre los métodos nuevos del puerto y la lista de tablas sin borrado suave añade `UserInvitation`. |
| 2026-11-17 | F2-T06 | pendiente | Perfil de la empresa y `TenantSettings` (migración `add_timezone_to_tenant_settings`, con relleno para las empresas existentes): puerto `ITenantProfileRepository` y adaptador `PrismaTenantProfileRepository`, casos de uso `GetTenantProfileUseCase` y `UpdateTenantProfileUseCase` (auditado), acciones `tenant:view` (todos) y `tenant:update` (dueño y socio, D-16), `domain/value-objects/timezone.ts` (zona IANA, por defecto `America/Bogota`), rutas `GET/PATCH /api/v1/tenant` y `TenantModule`. El registro crea la configuración de la empresa nueva. Operación de escenario `readOwn` y código de éxito por escenario en las suites de seguridad (grupo `tenant`). 27 tests nuevos. El logo queda para F3-T07 (`IFileStorage`). Matriz de permisos regenerada. |
| 2026-11-17 | F3-T01 | pendiente | Dinero exacto (H21, R8): objetos de valor `Money` (centavos en `bigint`, hasta 15 cifras enteras y 2 decimales, redondeo mitad hacia arriba, suma, resta, por cantidad y porcentaje) y `Percentage` (0 a 100 en puntos básicos) en `domain/value-objects/money.ts`, sin librerías (R4). Códigos `INVALID_MONEY_AMOUNT`, `INVALID_PERCENTAGE`, `INVALID_QUANTITY`. `Lead.estimatedValue` pasa a `Money`: la API lo recibe y lo devuelve como texto decimal (`moneyAmountSchema`) y la base lo lee por `toFixed()`, nunca por `Number`. `decimal.js` no se añade: el dominio no puede importarla y `mathjs` trae la suya para las fórmulas. 51 tests nuevos. Cambian los tests de leads que enviaban o esperaban `estimatedValue` como number (ahora texto o `Money`) y el que rechazaba el texto `"2500000"` (ahora lo acepta y rechaza el number). |
| 2026-11-17 | F3-T03 | pendiente | Evaluador de fórmulas endurecido: puerto `IFormulaEvaluator` (`validate` al guardar, `evaluate` al cotizar, valores y resultado como texto decimal) y adaptador `MathjsFormulaEvaluator`. Nunca evalúa texto: analiza y recorre el árbol con lista blanca (números acotados, variables declaradas, `+ - * /`, menos unario, paréntesis, `min`, `max`, `round`, `ceil`, `floor`, `abs`); sin potencia, factorial, accesos, asignaciones ni constantes. Límites: 500 caracteres, 100 nodos, 15 cifras enteras y 6 decimales en constantes y valores, resultado menor que 1e15. Instancia de mathjs con BigNumber (64 cifras) y con `import`, `createUnit`, `evaluate`, `parse`, `simplify`, `derivative` y `compile` deshabilitadas. Códigos `INVALID_FORMULA`, `INVALID_FORMULA_VARIABLE`, `FORMULA_EVALUATION_FAILED`. 73 tests de inyección y cálculo y 12 de validación de texto de `money.ts`. |
| 2026-11-17 | F3-T02 | pendiente | Catálogo de productos: entidad `Product` (precio fijo `Money`, fórmula o ambos; `withChanges` con `null` para quitar), puerto `IProductRepository` (incluye `formulaExists` en el tenant), casos de uso `ListProductsUseCase`, `CreateProductUseCase`, `UpdateProductUseCase`, `DeleteProductUseCase` con auditoría en la transacción (`PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_DELETED`), `PrismaProductRepository`, rutas `GET /products/search`, `POST /products`, `PATCH` y `DELETE /products/:id`. Acciones `product:list` (todos) y `product:create/update/delete` (gestión; supuesto pendiente de confirmar). Códigos `PRODUCT_NOT_FOUND`, `PRODUCT_PRICE_REQUIRED`, `INVALID_PRODUCT_FORMULA`. Tipo de filtro `boolean`. Sin migración: el modelo ya existía. Escenarios de seguridad del recurso `product` y grupo de roles `catalog`. 18 tests unitarios, 6 de integración y 16 de API, más los de las suites de seguridad. Matriz de permisos regenerada (necesita firma nueva). Cambian los tests de soporte de seguridad (`routeSecurityScenarios`, `auditAtomicity`, `rolePermissionCoverage`) para conocer el recurso nuevo. |
| 2026-11-17 | F3-T04 | pendiente | Fórmulas de precio: entidad `Formula` (variables `{ name, label }`, máximo 20, sin repetir), puerto `IFormulaRepository` (incluye `isUsedByProducts`), casos de uso `ListFormulasUseCase`, `CreateFormulaUseCase`, `UpdateFormulaUseCase`, `DeleteFormulaUseCase` con la expresión validada por `MathjsFormulaEvaluator` (una instancia por proceso) y auditoría en la transacción (`FORMULA_CREATED`, `FORMULA_UPDATED`, `FORMULA_DELETED`), `PrismaFormulaRepository` (la columna JSON de variables se valida al leer), rutas `GET /formulas/search`, `POST /formulas`, `PATCH` y `DELETE /formulas/:id`. Acciones `formula:list` (todos) y `formula:create/update/delete` (gestión; supuesto pendiente de confirmar). Códigos `FORMULA_NOT_FOUND`, `FORMULA_IN_USE`. Sin migración. Recurso `formula` en las suites de seguridad (grupo de roles `catalog`). 18 tests unitarios, 5 de integración y 11 de API. Matriz de permisos regenerada (necesita firma nueva). |
| 2026-11-17 | F3-T10 | pendiente | Canal de correo por empresa (D-57): migración `add_email_delivery_to_tenant_settings` (`TenantSettings.emailDeliveryEnabled`, `false` por defecto, también para las empresas existentes). `GET /tenant` lo devuelve y `PATCH /tenant` lo cambia (dueño y socio, auditado como `TENANT_UPDATED`). Las cotizaciones (F3-T08) y las alertas (F4) lo consultarán; los correos de la cuenta no. 6 tests nuevos. Cambian los tests del perfil que esperaban el cuerpo exacto sin `emailDeliveryEnabled` y el doble en memoria del perfil. Migración aplicada a la base local del entorno de pruebas. |
| 2026-11-18 | F3-T05 | pendiente | Cotizaciones: migración `add_quote_details`; entidad `Quote`/`QuoteItem` (importes exactos, estados, versiones, vigencia), `calendarDate`, `Percentage.combinedWith`; puerto `IQuoteRepository` y `PrismaQuoteRepository` (secuencia `INSERT ... ON CONFLICT`, `saveState` comparar y cambiar); casos de uso en `use-case/quotes/` con `QuoteContentResolver`; acciones `quote:*` en la matriz (documento regenerado, firma pendiente); rutas `/api/v1/quotes`, esquema Zod y OpenAPI; IVA por defecto y topes de descuento en `TenantSettings` (`PATCH /tenant`). Nuevos códigos de error `QUOTE_*` y auditoría `QUOTE_*`. El marco de seguridad gana las operaciones `read` y `transition` y los recursos `quote`/`sentQuote`. Tests: dominio, casos de uso, repositorio contra PostgreSQL, API y seguridad. Migración aplicada a la base local; pendiente en producción (R6). |
| 2026-11-18 | F3-T07 | pendiente | Logo de la empresa: puerto `IFileStorage` y adaptador `LocalDiskFileStorage` (Q-017), validación por contenido en `logoImage.ts` (PNG/JPEG, 2 MB, 2000 px), casos de uso `UploadTenantLogoUseCase`, `RemoveTenantLogoUseCase`, `GetTenantLogoUseCase`, rutas `PUT/GET/DELETE /api/v1/tenant/logo` con `multer` en memoria, variable `FILE_STORAGE_DIRECTORY`. El perfil pasa a un DTO (`TenantProfileDTO`): `TenantProfile.logoUrl` se renombra `logoKey` y la API publica la ruta del logo. Auditoría `TENANT_LOGO_UPDATED/REMOVED`; errores `INVALID_LOGO_IMAGE`, `LOGO_NOT_FOUND`. Excepción de ESLint acotada a `LocalDiskFileStorage.ts` para `security/detect-non-literal-fs-filename` (pendiente de revisión humana). El marco de seguridad gana el escenario `readOwnFile`, `attachment`/`prepare` y `requestSelf`. Sin migración (la columna `Tenant.logoUrl` ya existía). |
