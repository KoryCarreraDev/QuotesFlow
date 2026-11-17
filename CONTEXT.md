# CONTEXT.md — QuotesFlow (SaaS Comerciales)

> Resumen del proyecto para personas e IAs. Léelo en lugar de explorar todo el código. Si cambias algo estructural (rutas, reglas, modelos), actualiza este archivo.
> Última revisión: rama `feat/F2-T07-csrf-origin-check` (apilada sobre F2-T10), 2026-11-17.

---

## 1. Qué es

Backend API REST de un SaaS **multi-tenant** de gestión comercial (CRM + cotizaciones). Cada empresa (tenant) comparte BD PostgreSQL pero solo ve sus datos: **todas las tablas de negocio llevan `tenantId`** y todo repositorio filtra por él.

Planeado: auth JWT, leads con roles, contactos, productos con precio fijo o por fórmula, cotizaciones (PDF + email), auditoría, mensajería.

---

## 2. Estado actual

| Módulo | Estado | Notas |
|---|---|---|
| Auth (register/login) | ✅ | Register crea tenant + usuario OWNER + 5 estados de lead por defecto en una sola transacción (F1-T03). Login emite cookie `accessToken` |
| Leads | ✅ | getAll, create, update, filtered, **delete (soft)**. Reglas por rol (sección 6) |
| LeadStatusConfig (estados de lead) | ✅ | getAll, create, update, delete (suave), reorder; tipo OPEN/WON/LOST (F1-T14) |
| Contactos persona | ✅ CRUD + filtered + borrado suave (F1-T16) | Responsable (`ownerId`) y documento normalizado y único (F1-T17); un comercial solo ve los suyos |
| Contactos empresa | ✅ CRUD + filtered + borrado suave (F1-T16) | Responsable y NIT normalizado y único (F1-T17); borrar solo gestión y sin contactos activos |
| Motor de filtrado genérico | ✅ | Sección 8 |
| Productos, Fórmulas, Cotizaciones, PDF | ⏳ | Solo modelos en `schema.prisma` |
| AuditLog, LeadStatusHistory | ✅ | `AuditLog` en toda modificación y en registro y login (F1-T07); `LeadStatusHistory` en cada cambio de estado (F1-T13) |
| TenantSettings / estrategia de asignación | ⏳ | Modelo existe; `ROUND_ROBIN`/`LOAD_BALANCED` sin lógica |
| Mensajería, multer, mathjs, pdf-lib, axios | ⏳ | Instalados, sin uso; se usarán en F3 a F6 (sección 6 de `PLAN.md`). winston se usa desde F1-T07. `nodemailer`, `node-cron` y `http-status-codes` se quitaron en F0-T09 |
| Tests | ✅ | Vitest: 988 tests (unit, integración con PostgreSQL efímero, API, build). 3 son defectos conocidos marcados con `itKnownDefect`. Guía en `tests/README.md` (sección 12) |

### Deuda / cosas a saber (no asumas lo contrario)
- La lista completa de hallazgos de seguridad abiertos, con severidad y tarea, está en `docs/audits/00-linea-base.md` (H1 a H26). Además de lo de abajo: el login responde más rápido si el correo no existe (H22) y la cookie de sesión caduca siempre a los 7 días (H23).
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
cookie accessToken -> createAuthValidateCookie (verifica JWT, req.user = {userId, tenantId, role})
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

**Clientes (contactos y empresas cliente, F1-T17)**
- Responsable `ownerId` (D-18): un comercial solo lista, filtra y modifica los clientes de los que es responsable; lo que crea queda a su nombre aunque envíe otro `ownerId`; solo puede vincular un contacto a una empresa cliente suya. Gestión ve todos y asigna responsable a un usuario activo de la empresa (si no, 400 `OWNER_NOT_FOUND`). Los clientes anteriores a F1-T17 no tienen responsable y solo los ve gestión hasta asignarlos (Q-005).
- Documento (D-19): `documentType` (`CC`, `CE`, `TI`, `PASSPORT`, `PPT`, `NIT`) y `documentNumber` en contactos; en empresas, `documentNumber` se deriva de `taxNumber`. Se guarda normalizado (`domain/value-objects/documentNumber.ts`): solo dígitos, letras y dígitos en mayúscula en pasaportes, sin dígito de verificación en el NIT. Un número sin tipo responde 400 `DOCUMENT_TYPE_REQUIRED`. Repetido entre clientes activos de la misma empresa, 409 `DOCUMENT_ALREADY_REGISTERED`; el de un cliente borrado se puede reutilizar. La comprobación es de la aplicación: dos altas simultáneas con el mismo documento podrían pasar las dos.

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
- Register: 409 `EMAIL_ALREADY_IN_USE` si el email ya existe. Crea Tenant → User(OWNER) → 5 estados en una transacción: si algo falla, no queda nada (H8). Con dos registros simultáneos del mismo correo, la restricción única de la base decide y `PrismaUserRepository` la traduce a 409. Devuelve `{ tenantId, ownerId }`.

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
        ├ Quote[] ─ status QuoteStatus, total, discount, items QuoteItem[] (QuoteItem con tenantId desde F1-T10)
        ├ TenantSettings (1:1) ─ leadAssignmentStrategy MANUAL|ROUND_ROBIN|LOAD_BALANCED
        └ AuditLog[]
```
Enums: `Role`, `QuoteStatus` (DRAFT/SENT/ACCEPTED/REJECTED), `LeadAssignmentStrategy`, `DeletedState`.
Migraciones: `init` (2026-07-10), `add_deleted_to_models` (2026-09-01), `add_owner_and_document_to_clients` (F1-T17: `ownerId` con FK a `User` y `ON DELETE SET NULL`, enum `DocumentType`, `documentNumber`; rellena el NIT normalizado de las empresas existentes), `add_type_to_lead_status_config` (F1-T14: enum `LeadStatusType`; Ganado y Perdido se marcan `WON` y `LOST` por nombre) y `add_tenant_id_to_history_and_quote_items` (F1-T10: rellena `tenantId` desde el lead o la cotización antes de exigir NOT NULL; FK a `Tenant` con borrado en cascada e índice). Todas las tablas de negocio tienen `tenantId NOT NULL` con FK a `Tenant`, salvo `Tenant`; lo comprueba `tests/integration/schema/databaseSchema.test.ts`.

Comprobar que las migraciones coinciden con `schema.prisma`: `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`, con un `prisma.config` que declare `shadowDatabaseUrl` (Prisma 7 no acepta la URL por parámetro). En producción las aplica Operaciones con la imagen `migrator` (R6).

---

## 8. API implementada

Desde F1-T11 (D-06) la API son recursos REST bajo `/api/v1`: `auth`, `leads`, `lead-statuses`, `contacts`, `company-contacts`. Listar es `GET /recurso`, el listado filtrado y paginado `GET /recurso/search`, crear `POST /recurso`, modificar `PATCH /recurso/:id` y borrar (suave) `DELETE /recurso/:id`. Las sondas `/health` y `/ready` siguen en la raíz. El contrato OpenAPI 3.1 está en `docs/openapi.json` (D-07), generado desde los esquemas Zod con `pnpm docs:openapi`; un test falla si no coincide con el código o le falta alguna ruta.

Auth: cookie HTTP-only `accessToken` (excepto `/health` y `/api/v1/auth/*`).

**Endurecimiento HTTP (F1-T06).** CORS solo para los orígenes de `CORS_ALLOWED_ORIGINS`, con credenciales; un origen fuera de la lista no recibe cabeceras CORS (H4). Cuerpo JSON máximo de 100 kb: más responde 413 `PAYLOAD_TOO_LARGE` (H14). `trust proxy` = `TRUST_PROXY` (0 por defecto: X-Forwarded-For se ignora). Límite por IP cada 15 min: `RATE_LIMIT_GLOBAL_MAX_REQUESTS` (100) en todo y `RATE_LIMIT_AUTH_MAX_REQUESTS` (10) además en `/api/v1/auth`; al superarlo, 429 `TOO_MANY_REQUESTS` con cabeceras `RateLimit-*`. Los contadores viven en memoria de cada proceso (H6 sigue abierto en la parte de varias instancias y del bloqueo por cuenta, F2-T03). **CSRF (F2-T07, D-14):** además de la cookie `SameSite=Strict`, `createOriginCheckMiddleware` rechaza con 403 `ORIGIN_NOT_ALLOWED` toda petición POST, PATCH, PUT o DELETE cuyo `Origin` (o, si falta, el origen de `Referer`) no esté en `CORS_ALLOWED_ORIGINS`; `Origin: null` y un `Referer` ilegible cuentan como ajenos. Sin ninguna de las dos cabeceras se atiende (no es un navegador). Las lecturas no se verifican. Piezas: `src/infrastructure/web/httpSecurity.ts`.

| Método | Ruta | Body / Query |
|---|---|---|
| GET | `/health` | — (vida: el proceso responde; no toca la base de datos; fuera del limitador global desde F2-T10) |
| GET | `/ready` | — (listo: la base responde a `SELECT 1` en menos de 2 s; si no, 503 `SERVICE_UNAVAILABLE`; fuera del limitador global desde F2-T10) |
| POST | `/api/v1/auth/register` | `{ companyName, ownerEmail, password, ownerFirstName, ownerLastName }` |
| POST | `/api/v1/auth/login` | `{ email, password }` |
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
| DELETE | `/api/v1/company-contacts/:id` | — (borrado suave; solo gestión; 409 `COMPANY_CONTACT_HAS_CONTACTS` si tiene contactos activos) |

### Logs y auditoría (F1-T07)

- **Logs técnicos:** puerto `ILogger` (`application/ports/services/ILogger.ts`), adaptador `WinstonLogger` (una línea JSON por entrada a la salida estándar), instancia `appLogger` con `LOG_LEVEL`. Cada entrada lleva `requestId`, `userId` y `tenantId` de la petición en curso. `redactSensitiveData` sustituye por `[REDACTED]` cualquier clave que contenga `password`, `token`, `secret`, `cookie`, `authorization`, `apikey`/`api-key` o `database_url`, y quita usuario y contraseña de las URLs de conexión dentro de textos y errores.
- **Id de petición:** `createRequestContextMiddleware` (primero en `app.ts`) acepta un `X-Request-Id` entrante si tiene de 8 a 64 caracteres `[A-Za-z0-9-]`, si no genera un UUID; lo devuelve en la respuesta y lo guarda en `cross-cutting/requestContext.ts` (`AsyncLocalStorage`). La autenticación añade ahí el usuario y el tenant.
- **Log de acceso:** una entrada por petición con método, ruta sin query, código y duración.
- **Prisma (H25):** fuera de desarrollo solo `warn` y `error`; en desarrollo, además, el texto SQL y la duración de cada consulta a nivel `debug`, nunca sus parámetros.
- **Auditoría de negocio:** puerto `IAuditLogger` con `AuditAction` y `AuditEntity`, adaptador `PrismaAuditLogger`. Lo reciben todos los casos de uso que modifican datos, más registro y login. Autor y empresa salen de la sesión; solo registro y login indican `publicActor`. `metadata` guarda `requestId` y, en modificaciones, `changedFields` (nombres, nunca valores). Un login con correo inexistente no se audita (no hay usuario ni empresa): queda solo en el log técnico. `tests/api/security/auditTrail.test.ts` recorre todas las rutas que modifican datos y exige su registro.
- **Limitación conocida:** en registro y cambio de estado la auditoría va dentro de la transacción; en las demás modificaciones se escribe justo después. Si esa escritura falla, la modificación ya ocurrió y la petición responde 500. Envolver cada modificación en una transacción es una mejora pendiente.

### Errores (F1-T02)

Toda respuesta de error: `{ "error": { "code": "<ErrorCode>", "message": "<texto técnico en inglés>", "details"?: [{ "path": [...], "message": "..." }] } }`. Sin trazas.

| HTTP | Códigos |
|---|---|
| 400 | `VALIDATION_FAILED` (con `details`), `MISSING_REQUIRED_DATA`, `MALFORMED_JSON`, `INVALID_REQUEST_BODY`, `INVALID_LEAD_STATUS`, `ASSIGNED_USER_NOT_FOUND`, `INVALID_COMPANY_CONTACT`, `INVALID_FILTERS_FORMAT`, `FILTER_FIELD_NOT_ALLOWED`, `FILTER_OPERATOR_NOT_ALLOWED`, `INVALID_FILTER_VALUE`, `SORT_FIELD_NOT_ALLOWED` |
| 401 | `INVALID_CREDENTIALS`, `SESSION_REQUIRED` (sin cookie), `INVALID_SESSION` (token inválido, caducado o sin tenant) |
| 403 | `INSUFFICIENT_PERMISSIONS`, `ORIGIN_NOT_ALLOWED` (CSRF, F2-T07) |
| 404 | `LEAD_NOT_FOUND`, `LEAD_STATUS_NOT_FOUND`, `CONTACT_NOT_FOUND`, `COMPANY_CONTACT_NOT_FOUND`, `RECORD_NOT_FOUND`, `ROUTE_NOT_FOUND` (ruta inexistente) |
| 409 | `EMAIL_ALREADY_IN_USE`, `DEFAULT_LEAD_STATUS_MISSING`, `DEFAULT_LEAD_STATUS_REQUIRED` |
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
| `JWT_EXPIRATION` | Número + unidad (`ms`, `s`, `m`, `h`, `d`, `w`, `y`), p. ej. `15m` | `7d` |
| `PORT` | Entero entre 1 y 65535 | `4000` |
| `CORS_ALLOWED_ORIGINS` | Orígenes exactos separados por comas (`https://app.ejemplo.com`); nunca `*` | Vacío: ningún origen |
| `TRUST_PROXY` | Número entero de proxies de confianza | `0` |
| `RATE_LIMIT_GLOBAL_MAX_REQUESTS` | Entero positivo | `100` |
| `RATE_LIMIT_AUTH_MAX_REQUESTS` | Entero positivo | `10` |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` o `silent` (solo tests) | `info` |

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
- **Matrices de seguridad** (R5): `tests/api/security/tenantIsolation.test.ts` y `roles.test.ts` (casos de negocio concretos). Además, desde F1-T05, `routeCoverageTenantIsolation.test.ts` y `routeCoverageRoles.test.ts` recorren todo `authenticatedRoutes`: cada ruta declara su escenario en `tests/support/http/routeSecurityScenarios.ts` (acción de la matriz, recurso, operación) y la suite falla si falta. Para cada ruta se prueba que el dueño de otra empresa no lista, no modifica y no crea datos fuera de su tenant (404 y registro intacto), y que cada rol recibe lo que dice `permissionMatrix` (2xx o 403, sobre el registro propio y sobre el de otro comercial).
- **Defectos conocidos:** `itKnownDefect(hallazgo, …)` describe el comportamiento correcto de un hallazgo aún sin corregir. Se ejecuta siempre y pasa solo mientras el defecto exista; al corregirlo hay que convertirlo en `it(...)`. Hoy hay 3 (H2 y H7), listados en `tests/README.md`. El de F1-T14 pasó a regresión en F1-T14. H11 terminó de pasar a regresión en F1-T12. H10 y H9 en contactos pasaron a regresión en F1-T16. H15 pasó a regresión en F1-T10; H3 y H9 en leads, en F1-T13. Los 13 de H5 y uno de H11 pasaron a regresión en F1-T02; los de H4 y H14, en F1-T06.
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
