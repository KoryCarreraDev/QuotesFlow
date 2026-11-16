# CONTEXT.md — QuotesFlow (SaaS Comerciales)

> Resumen del proyecto para personas e IAs. Léelo en lugar de explorar todo el código. Si cambias algo estructural (rutas, reglas, modelos), actualiza este archivo.
> Última revisión: rama `feat/F1-T10-tenant-id-history-items` (apilada sobre F1-T01 a F1-T09 y las ramas de F0), 2026-11-16.

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
| LeadStatusConfig (estados de lead) | ✅ | getAll, create, update. **Sin delete** |
| Contactos persona | ✅ CRUD + filtered | Sin soft delete ni restricción de rol |
| Contactos empresa | ✅ CRUD + filtered | Sin soft delete ni restricción de rol |
| Motor de filtrado genérico | ✅ | Sección 8 |
| Productos, Fórmulas, Cotizaciones, PDF | ⏳ | Solo modelos en `schema.prisma` |
| AuditLog, LeadStatusHistory | ⏳ | Solo modelos; nada los escribe aún |
| TenantSettings / estrategia de asignación | ⏳ | Modelo existe; `ROUND_ROBIN`/`LOAD_BALANCED` sin lógica |
| Mensajería, winston, multer, mathjs, pdf-lib, axios | ⏳ | Instalados, sin uso; se usarán en F1 a F6 (sección 6 de `PLAN.md`). `nodemailer`, `node-cron` y `http-status-codes` se quitaron en F0-T09 |
| Tests | ✅ | Vitest: 755 tests (unit, integración con PostgreSQL efímero, API, build). 13 son defectos conocidos marcados con `itKnownDefect`. Guía en `tests/README.md` (sección 12) |

### Deuda / cosas a saber (no asumas lo contrario)
- La lista completa de hallazgos de seguridad abiertos, con severidad y tarea, está en `docs/audits/00-linea-base.md` (H1 a H26). Además de lo de abajo: el login responde más rápido si el correo no existe (H22) y la cookie de sesión caduca siempre a los 7 días (H23).
- **Errores (F1-T02).** Los casos de uso lanzan clases de `src/domain/errors/` y el manejador global responde con su código HTTP y `{ error: { code, message, details? } }` (sección 8). Quedan como `Error` normal, y por tanto 500, las comprobaciones de "no hay tenant en el contexto" de los casos de uso, que el middleware ya impide. Un error de Prisma (por ejemplo, `order` repetido en estados) sigue respondiendo 500: traducirlo es de F1-T14.
- `UpdateLeadUseCase` **ignora `statusId`**: el estado no se puede cambiar por PATCH (aunque el schema Zod lo acepta). El cambio de estado y su historial (`LeadStatusHistory`) no existen.
- `PrismaLeadStatusConfig.ts` (nombre sin sufijo `Repository`) contiene `PrismaLeadStatusConfigRepository`; `LeadConfigStatusMapper.ts` contiene `LeadStatusConfigMapper`.
- `Lead.deleted` y `LeadStatusConfig.deleted` son `string`; el enum de dominio `DeletedState` (`Active='INUSE'`, `Inactive='DELETED'`) casi no se usa: el código compara con literales `'INUSE'`/`'DELETED'`.
- `LeadStatusConfig.updateAt` (typo, sin "d") es el nombre real del campo de la entidad.
- `PrismaLeadRepository.findByTenant` y `PrismaLeadStatusConfigRepository.findAllByTenant` filtran por `deleted: 'INUSE'`. `PrismaUserRepository`, `PrismaContactRepository`, etc. aún no están pensados para soft delete.
- `countLeadByStatus` existe en el repo de estados pero no se usa todavía (pensado para impedir borrar estados con leads).
- **Crear un estado predeterminado con `order` repetido deja a la empresa sin predeterminado**: `CreateLeadStatusConfigUseCase` desmarca el anterior antes de crear el nuevo y no hay transacción; si la creación falla, no se revierte. Test: `tests/api/leadStatusConfig.test.ts` (defecto conocido F1-T14).
- Reasignar un lead (`PATCH /api/lead/update/:id`) o crear un contacto con `companyId` acepta ids de **otro tenant** (H9, verificado con tests).
- `pnpm audit` (2026-11-16, tras F0-T09): `pnpm audit --prod` sin avisos. Quedan 2 moderados solo de desarrollo, `glob` 10.5.0 y `minimatch` 5.1.9/9.0.9, que arrastra `@testcontainers/postgresql` 12.2.1 vía `archiver` 7. No tienen versión corregida en su rama mayor y testcontainers aún no admite `archiver` 8, por eso no se fuerzan. Antes eran 94 avisos (1 crítico).

---

## 3. Stack

TypeScript (ESM, imports terminan en `.js`) · Node 24 LTS (D-04; `engines` en `package.json`, `.nvmrc` = 24.18.0, imagen `node:24.18.0-slim` fijada por digest) · pnpm 11.28.10 fijado en `devEngines` (se descarga solo si la versión local es otra) · Express 5 · Prisma 7 (`@prisma/adapter-pg`, `pg`) · PostgreSQL 15 · Zod 4 · bcryptjs · jsonwebtoken · cookie-parser · helmet · cors (lista blanca, F1-T06) · compression · express-rate-limit (por IP cada 15 min: 100 global y 10 en `/api/auth`, configurables) · pnpm · Docker Compose · tsx + nodemon en dev.

**Tests (devDependencies, versiones exactas, añadidas el 2026-11-16 en F0-T02):** `vitest` 5.1.0 · `@vitest/coverage-v8` 5.1.0 · `supertest` 7.3.2 · `@types/supertest` 7.2.1 · `@testcontainers/postgresql` 12.2.1 (necesita Docker). Se quitaron `jest`, `ts-jest` y `@types/jest` (decisión D-01).

**Calidad (F0-T03):** ESLint 10 (`eslint.config.js`: typescript-eslint, eslint-plugin-security, @vitest/eslint-plugin, regla local `eslint-rules/no-commented-out-code.js`) y Prettier (`.prettierrc.json`: comillas simples, 120 columnas, LF; los `.md` no se formatean). Las violaciones heredadas están congeladas en `eslint-suppressions.json` (77 el 2026-11-16: 59 números mágicos, 6 nombres, 5 variables sin usar, 4 `any`, otras 3). Ese archivo solo puede encoger (ver `docs/guia-de-codigo.md`, sección 11). `.gitattributes` fuerza LF. El commit de formato masivo está en `.git-blame-ignore-revs`.

**Hooks de git (F0-T05):** lefthook 2.2.2 (`lefthook.yml`), instalado por su `postinstall` al hacer `pnpm install` (no se instala con `CI=true`). pre-commit: ESLint + Prettier sobre los archivos preparados. pre-push: `pnpm typecheck`, `pnpm arch:check`, `pnpm test:unit`.

**CI (F0-T06):** `.github/workflows/ci.yml`, en cada PR y push a `develop`/`main`. Actions fijadas por SHA de commit y permisos `contents: read`. Jobs:
| Job | Qué exige |
|---|---|
| `quality` | `pnpm typecheck`, `pnpm lint`, `pnpm arch:check` |
| `tests` | `pnpm test:coverage` (los 4 proyectos, con PostgreSQL vía testcontainers) y umbrales de D-03; sube `coverage/` como artefacto |
| `dependency-audit` | `pnpm audit --prod` sin ningún aviso; `pnpm audit --audit-level high` para todo |
| `secret-scan` | gitleaks 8.30.1 (imagen por digest) sobre todo el historial |
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
  application/mappers/       LeadMapper, ContactMapper, CompanyContactMapper, LeadConfigStatusMapper
  application/policies/      authorizationPolicy.ts: matriz de permisos, can, scopeFor (F1-T04)
  application/ports/         repositories/I*, services/I*, mappers/I*
  application/use-case/      auth/, leads/, LeadStatusConfig/, contacts/, companyContacts/, filter/, (messaging/ y pricing/ vacíos)
  infrastructure/persistence/prisma/PrismaService.ts          singleton PrismaClient
  infrastructure/persistence/prisma/PrismaTransactionManager.ts  ITransactionManager sobre $transaction + AsyncLocalStorage
  infrastructure/persistence/repositories/                    BasePrismaRepository + Prisma*Repository
  infrastructure/persistence/filters/                         lead|contact|companyContact FilterConfig
  infrastructure/services/                                    BcryptHashService, JwtTokenService (clase JwTokenService)
  infrastructure/web/controllers/                             Auth, lead, leadStatusConfig, contact, companyContact
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

**Roles:** `OWNER`, `PARTNER`, `SALES_LEADER`, `SALES_REP`. Solo Leads y LeadStatusConfig aplican roles.

**Autorización (F1-T04).** Una sola matriz, `permissionMatrix` en `src/application/policies/authorizationPolicy.ts`: por acción y rol, `all`, `own` (solo los recursos de los que es responsable) o `none`. Los casos de uso preguntan `can(actor, action, resource)`; los listados usan `scopeFor(actor, action)`. Un rol fuera de la matriz no tiene permisos, y un permiso `own` sin usuario o sin recurso se deniega. `docs/security/matriz-permisos.md` se genera con `pnpm docs:permissions` y un test falla si no coincide con el código. Las acciones de contactos, empresas cliente y `lead-status:list` aún no consultan la política (hoy se permiten a todos).

**Leads**
| Acción | SALES_REP | Otros roles |
|---|---|---|
| Listar (`getAll`/`filtered`) | Solo `assignedToId === userId` (en `filtered` el controller fuerza el filtro y descarta el que envíe el cliente) | Todos del tenant |
| Crear | `assignedToId` se fuerza a su propio `userId` | `assignedToId` opcional; si viene, el usuario debe existir en el tenant |
| Actualizar | Solo sus leads; no puede reasignar | Cualquiera; puede reasignar (sin validar que el usuario exista) |
| Eliminar (soft) | Solo sus leads | Cualquiera |

- Crear sin `statusId` → usa el estado `isDefault` del tenant (error si no hay). Con `statusId` → debe existir en el tenant.
- Actualizar/eliminar un lead ya `DELETED` → no se encuentra (`findById` filtra `INUSE`).
- Los leads con `deleted='DELETED'` no aparecen en ninguna consulta.

**LeadStatusConfig**
- `SALES_REP` no puede crear ni actualizar (error "Insufficient permissions").
- Solo un estado `isDefault` por tenant: al marcar uno nuevo como default, el anterior se desmarca. No se puede poner `isDefault=false` al default actual sin otro que lo reemplace.
- `@@unique([tenantId, order])` en BD: `order` duplicado por tenant falla.
- Al registrar una empresa se crean 5 estados (`application/constants/defaultLeadStatuses.ts`): Nuevo (default, #3B82F6), Contactado, Calificado, Ganado, Perdido.

**Auth**
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
Migraciones: `init` (2026-07-10), `add_deleted_to_models` (2026-09-01) y `add_tenant_id_to_history_and_quote_items` (F1-T10: rellena `tenantId` desde el lead o la cotización antes de exigir NOT NULL; FK a `Tenant` con borrado en cascada e índice). Todas las tablas de negocio tienen `tenantId NOT NULL` con FK a `Tenant`, salvo `Tenant`; lo comprueba `tests/integration/schema/databaseSchema.test.ts`.

Comprobar que las migraciones coinciden con `schema.prisma`: `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`, con un `prisma.config` que declare `shadowDatabaseUrl` (Prisma 7 no acepta la URL por parámetro). En producción las aplica Operaciones con la imagen `migrator` (R6).

---

## 8. API implementada

Auth: cookie HTTP-only `accessToken` (excepto `/health` y `/api/auth/*`).

**Endurecimiento HTTP (F1-T06).** CORS solo para los orígenes de `CORS_ALLOWED_ORIGINS`, con credenciales; un origen fuera de la lista no recibe cabeceras CORS (H4). Cuerpo JSON máximo de 100 kb: más responde 413 `PAYLOAD_TOO_LARGE` (H14). `trust proxy` = `TRUST_PROXY` (0 por defecto: X-Forwarded-For se ignora). Límite por IP cada 15 min: `RATE_LIMIT_GLOBAL_MAX_REQUESTS` (100) en todo y `RATE_LIMIT_AUTH_MAX_REQUESTS` (10) además en `/api/auth`; al superarlo, 429 `TOO_MANY_REQUESTS` con cabeceras `RateLimit-*`. Los contadores viven en memoria de cada proceso (H6 sigue abierto en la parte de varias instancias y del bloqueo por cuenta, F2-T03). Piezas: `src/infrastructure/web/httpSecurity.ts`.

| Método | Ruta | Body / Query |
|---|---|---|
| GET | `/health` | — (vida: el proceso responde; no toca la base de datos) |
| GET | `/ready` | — (listo: la base responde a `SELECT 1` en menos de 2 s; si no, 503 `SERVICE_UNAVAILABLE`) |
| POST | `/api/auth/register` | `{ companyName, ownerEmail, password, ownerFirstName, ownerLastName }` |
| POST | `/api/auth/login` | `{ email, password }` |
| GET | `/api/lead/getAll` | — |
| POST | `/api/lead/create` | `{ contactName (requerido), companyName?, email?, phone?, statusId?(uuid), source?, assignedToId?(uuid), estimatedValue?, expectedCloseDate?, notes? }` |
| PATCH | `/api/lead/update/:id` | mismos campos, todos opcionales (`statusId` ignorado) |
| POST | `/api/lead/delete/:id` | — (soft delete; es POST, no DELETE) |
| GET | `/api/lead/filtered` | `?search=&filters=[...]&page=&limit=` |
| GET | `/api/leadStatusConfig/getAll` | — (ordenado por `order` asc) |
| POST | `/api/leadStatusConfig/create` | `{ name, order, isDefault?, color? }` |
| PATCH | `/api/leadStatusConfig/update/:id` | `{ name?, order?, isDefault?, color? }` |
| GET/POST/PATCH | `/api/contact/getAll`, `/create`, `/update/:id`; GET `/filtered` | `{ firstName, lastName, email?, phone?, companyId? }` |
| GET/POST/PATCH | `/api/companyContact/getAll`, `/create`, `/update/:id`; GET `/filtered` | `{ name, industry?, taxNumber?, phone?, email?, address?, city?, state?, zip?, country? }` |

### Errores (F1-T02)

Toda respuesta de error: `{ "error": { "code": "<ErrorCode>", "message": "<texto técnico en inglés>", "details"?: [{ "path": [...], "message": "..." }] } }`. Sin trazas.

| HTTP | Códigos |
|---|---|
| 400 | `VALIDATION_FAILED` (con `details`), `MISSING_REQUIRED_DATA`, `MALFORMED_JSON`, `INVALID_REQUEST_BODY`, `INVALID_LEAD_STATUS`, `ASSIGNED_USER_NOT_FOUND`, `INVALID_FILTERS_FORMAT`, `FILTER_FIELD_NOT_ALLOWED`, `FILTER_OPERATOR_NOT_ALLOWED` |
| 401 | `INVALID_CREDENTIALS`, `SESSION_REQUIRED` (sin cookie), `INVALID_SESSION` (token inválido, caducado o sin tenant) |
| 403 | `INSUFFICIENT_PERMISSIONS` |
| 404 | `LEAD_NOT_FOUND`, `LEAD_STATUS_NOT_FOUND`, `CONTACT_NOT_FOUND`, `COMPANY_CONTACT_NOT_FOUND`, `RECORD_NOT_FOUND`, `ROUTE_NOT_FOUND` (ruta inexistente) |
| 409 | `EMAIL_ALREADY_IN_USE`, `DEFAULT_LEAD_STATUS_MISSING`, `DEFAULT_LEAD_STATUS_REQUIRED` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 500 | `INTERNAL_ERROR` (mensaje genérico; el detalle se registra con `console.error` hasta F1-T07) |

Un recurso de otro tenant responde igual que uno inexistente (404).

### Motor de filtrado genérico
`GET /api/<entidad>/filtered?search=texto&filters=[{"field":"statusId","operator":"equals","value":"…"}]&page=1&limit=20`
- `search`: OR `contains` (insensible a mayúsculas) sobre campos con `searchable:true`.
- `filters`: JSON array. Campo u operador fuera del `filterConfig` → 400 `FILTER_FIELD_NOT_ALLOWED` / `FILTER_OPERATOR_NOT_ALLOWED`; `filters` que no es JSON → 400 `INVALID_FILTERS_FORMAT`. El tipo del valor aún no se valida (H11, F1-T12).
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
- Roles evaluados solo por la política de `application/policies` (F1-T04). El alcance del listado filtrado de leads aún se aplica en el controller, preguntando a `scopeFor`; F1-T12 lo pasa al caso de uso.

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
- **Defectos conocidos:** `itKnownDefect(hallazgo, …)` describe el comportamiento correcto de un hallazgo aún sin corregir. Se ejecuta siempre y pasa solo mientras el defecto exista; al corregirlo hay que convertirlo en `it(...)`. Hoy hay 13 (H2, H3, H7, H9, H10, H11 y F1-T14), listados en `tests/README.md`. H15 pasó a regresión en F1-T10. Los 13 de H5 y uno de H11 pasaron a regresión en F1-T02; los de H4 y H14, en F1-T06.
- **Límite a tener en cuenta:** el limitador global (100 peticiones / 15 min) vale también en los tests; un archivo de tests de API no puede superar 100 peticiones, ni 50 a `/api/auth` (los tests suben ese cupo desde 10).
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
| 2026-11-16 | F1-T06 | pendiente | CORS con lista blanca y credenciales (H4), `trust proxy` configurable, cuerpo JSON máximo 100 kb (H14) y límite propio de 10 peticiones / 15 min en `/api/auth` además del global (H6), con 429 `TOO_MANY_REQUESTS` en formato único. Variables nuevas validadas en `env.ts`: `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, `RATE_LIMIT_GLOBAL_MAX_REQUESTS`, `RATE_LIMIT_AUTH_MAX_REQUESTS`. H4 y H14 pasan a regresión. 25 tests nuevos. Cambia la aserción del test de F1-T01 que compara la configuración completa (campos nuevos). |
| 2026-11-16 | F1-T08 | pendiente | `GET /ready` (la base de datos responde en menos de 2 s; si no, 503 `SERVICE_UNAVAILABLE` sin detalles) junto a `GET /health`, que no toca la base. Apagado ordenado en `server.ts` con `createGracefulShutdown`: deja de aceptar conexiones, termina las peticiones en curso, cierra Prisma y sale con 0; a los 10 s corta las conexiones y sale con 1. 7 tests nuevos; `/ready` añadida al inventario de rutas. |
| 2026-11-16 | F1-T09 | pendiente | `ScopedContainer` dividido por módulo en `src/cross-cutting/modules/` (`AuthModule`, `LeadModule`, `LeadStatusModule`, `ContactModule`, `CompanyContactModule`, con `ModuleDependencies`); las rutas piden `req.container!.<módulo>.get…UseCase()`. Sin cambio de comportamiento. 20 tests nuevos del contenedor. |
| 2026-11-16 | F1-T10 | pendiente | Migración `add_tenant_id_to_history_and_quote_items` (H15): `tenantId` en `LeadStatusHistory` y `QuoteItem`, relleno desde el registro padre, NOT NULL, FK a `Tenant` en cascada e índice. Verificada contra una base con datos y con `prisma migrate diff` (sin diferencias). H15 pasa a regresión; 2 tests nuevos de esquema (ningún `tenantId` nullable, todos con FK). Pendiente: aplicarla en producción (Operaciones, R6). |
