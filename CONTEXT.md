# CONTEXT.md — QuotesFlow (SaaS Comerciales)

> Resumen del proyecto para personas e IAs. Léelo en lugar de explorar todo el código. Si cambias algo estructural (rutas, reglas, modelos), actualiza este archivo.
> Última revisión: ramas de la fase F0 (`feat/F0-*`), 2026-11-16.

---

## 1. Qué es

Backend API REST de un SaaS **multi-tenant** de gestión comercial (CRM + cotizaciones). Cada empresa (tenant) comparte BD PostgreSQL pero solo ve sus datos: **todas las tablas de negocio llevan `tenantId`** y todo repositorio filtra por él.

Planeado: auth JWT, leads con roles, contactos, productos con precio fijo o por fórmula, cotizaciones (PDF + email), auditoría, mensajería.

---

## 2. Estado actual

| Módulo | Estado | Notas |
|---|---|---|
| Auth (register/login) | ✅ | Register crea tenant + usuario OWNER + 5 estados de lead por defecto. Login emite cookie `accessToken` |
| Leads | ✅ | getAll, create, update, filtered, **delete (soft)**. Reglas por rol (sección 6) |
| LeadStatusConfig (estados de lead) | ✅ | getAll, create, update. **Sin delete** |
| Contactos persona | ✅ CRUD + filtered | Sin soft delete ni restricción de rol |
| Contactos empresa | ✅ CRUD + filtered | Sin soft delete ni restricción de rol |
| Motor de filtrado genérico | ✅ | Sección 8 |
| Productos, Fórmulas, Cotizaciones, PDF | ⏳ | Solo modelos en `schema.prisma` |
| AuditLog, LeadStatusHistory | ⏳ | Solo modelos; nada los escribe aún |
| TenantSettings / estrategia de asignación | ⏳ | Modelo existe; `ROUND_ROBIN`/`LOAD_BALANCED` sin lógica |
| Mensajería, winston, nodemailer, multer, node-cron, mathjs, pdf-lib | ⏳ | Instalados, sin uso |
| Tests | ✅ | Vitest: 453 tests (unit, integración con PostgreSQL efímero, API). 30 son defectos conocidos marcados con `itKnownDefect`. Guía en `tests/README.md` (sección 12) |

### Deuda / cosas a saber (no asumas lo contrario)
- **No hay middleware global de errores.** Los use cases lanzan `Error` con mensaje en inglés y los controllers hacen `next(error)` → Express responde 500 (incluso para "Lead not found" o permisos). Solo `validateBody` (400) y el parseo de `filters` devuelven códigos propios. Un `errorHandler` con clases de error tipadas es mejora pendiente.
- `UpdateLeadUseCase` **ignora `statusId`**: el estado no se puede cambiar por PATCH (aunque el schema Zod lo acepta). El cambio de estado y su historial (`LeadStatusHistory`) no existen.
- `PrismaLeadStatusConfig.ts` (nombre sin sufijo `Repository`) contiene `PrismaLeadStatusConfigRepository`; `LeadConfigStatusMapper.ts` contiene `LeadStatusConfigMapper`.
- `Lead.deleted` y `LeadStatusConfig.deleted` son `string`; el enum de dominio `DeletedState` (`Active='INUSE'`, `Inactive='DELETED'`) casi no se usa: el código compara con literales `'INUSE'`/`'DELETED'`.
- `LeadStatusConfig.updateAt` (typo, sin "d") es el nombre real del campo de la entidad.
- `PrismaLeadRepository.findByTenant` y `PrismaLeadStatusConfigRepository.findAllByTenant` filtran por `deleted: 'INUSE'`. `PrismaUserRepository`, `PrismaContactRepository`, etc. aún no están pensados para soft delete.
- `countLeadByStatus` existe en el repo de estados pero no se usa todavía (pensado para impedir borrar estados con leads).
- **Crear un estado predeterminado con `order` repetido deja a la empresa sin predeterminado**: `CreateLeadStatusConfigUseCase` desmarca el anterior antes de crear el nuevo y no hay transacción; si la creación falla, no se revierte. Test: `tests/api/leadStatusConfig.test.ts` (defecto conocido F1-T14).
- Reasignar un lead (`PATCH /api/lead/update/:id`) o crear un contacto con `companyId` acepta ids de **otro tenant** (H9, verificado con tests).
- `pnpm audit` (2026-11-16): 94 avisos (1 crítico, 36 altos, 52 moderados, 5 bajos). 93 vienen de dependencias que no son de test (el crítico es `proxy-addr` vía `express`/`express-rate-limit`; la mayoría llegan por `prisma`, `axios`, `nodemailer`, `multer`). Las dependencias de test aportan 1 moderado (`glob` vía `@testcontainers/postgresql`, solo desarrollo).

---

## 3. Stack

TypeScript (ESM, imports terminan en `.js`) · Node 20 · Express 5 · Prisma 7 (`@prisma/adapter-pg`, `pg`) · PostgreSQL 15 · Zod 4 · bcryptjs · jsonwebtoken · cookie-parser · helmet · cors · compression · express-rate-limit (100 req/15 min global) · pnpm · Docker Compose · tsx + nodemon en dev.

**Tests (devDependencies, versiones exactas, añadidas el 2026-11-16 en F0-T02):** `vitest` 5.1.0 · `@vitest/coverage-v8` 5.1.0 · `supertest` 7.3.2 · `@types/supertest` 7.2.1 · `@testcontainers/postgresql` 12.2.1 (necesita Docker). Se quitaron `jest`, `ts-jest` y `@types/jest` (decisión D-01).

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

Regla: capas internas nunca importan las externas (`domain` y `application` no conocen Express ni Prisma).

### Mapa de archivos (por módulo)
```
src/
  server.ts                  arranca app en env.PORT (default 4000)
  app.ts                     middlewares globales + montaje de routers
  config/                    env.ts, database.ts
  cross-cutting/             container.ts (ScopedContainer), tenantContext.ts
  domain/entities/           Tenant, User, Lead, LeadStatusConfig, Contact, CompanyContact
  domain/enums/              Role, DeletedState
  domain/value-objects/      (vacío)
  application/constants/     defaultLeadStatuses.ts
  application/dtos/          [Entidad]DTO, Create…DTO, Update…DTO, FilterCriteriaDTO, PaginatedResultDTO, LoginDTO, RegisterCompanyDTO
  application/mappers/       LeadMapper, ContactMapper, CompanyContactMapper, LeadConfigStatusMapper
  application/ports/         repositories/I*, services/I*, mappers/I*
  application/use-case/      auth/, leads/, LeadStatusConfig/, contacts/, companyContacts/, filter/, (messaging/ y pricing/ vacíos)
  infrastructure/persistence/prisma/PrismaService.ts          singleton PrismaClient
  infrastructure/persistence/repositories/                    BasePrismaRepository + Prisma*Repository
  infrastructure/persistence/filters/                         lead|contact|companyContact FilterConfig
  infrastructure/services/                                    BcryptHashService, JwtTokenService (clase JwTokenService)
  infrastructure/web/controllers/                             Auth, lead, leadStatusConfig, contact, companyContact
  infrastructure/web/middleware/                              validateBody, createAuthValidateCookie, createTenantMiddleware
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

- `ScopedContainer` (`cross-cutting/container.ts`): DI manual. Un método `get<X>UseCase()` por use case, que instancia repo + mapper + use case. Sin tenantId (scope público, `authRouter`) el `tenantContext.getTenantId()` lanza error.
- `TenantContext` usa `AsyncLocalStorage`; `BasePrismaRepository.tenantId` lo lee.
- `BasePrismaRepository` ofrece: `tenantWhere()` (= `{tenantId, deleted:'INUSE'}`), `buildFilterWhere()` (siempre agrega tenantId + `deleted:'INUSE'`), `buildPagination()`, `softDeleteRegister(model, id)` (update `deleted='DELETED'` + `updatedAt`, con `where {id, tenantId}`), `validateTenant()`, `withTenant()`.
- Nota: `PrismaUserRepository.findByEmail` busca **sin tenant** (email es único global); `findById` sí filtra por tenant.

---

## 6. Reglas de negocio vigentes

**Roles:** `OWNER`, `PARTNER`, `SALES_LEADER`, `SALES_REP`. Solo Leads y LeadStatusConfig aplican roles.

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
- Register: error si el email ya existe. Crea Tenant → User(OWNER) → 5 estados. Devuelve `{ tenantId, ownerId }`.

---

## 7. Modelo de datos (`prisma/schema.prisma`)

Todos los modelos tienen `deleted DeletedState @default(INUSE)` (`INUSE` | `DELETED`), salvo `AuditLog`. IDs `cuid()` en Prisma, pero las entidades de dominio generan `crypto.randomUUID()` y lo pasan al crear.

```
Tenant ─┬ User[]  ─ role Role, isActive
        ├ Lead[] ─ status→LeadStatusConfig, assignedTo→User, estimatedValue, expectedCloseDate
        │   ├ LeadStatusHistory[] (oldStatus/newStatus/changedBy)
        │   └ Quote[]
        ├ LeadStatusConfig[] ─ name, color, order, isDefault   @@unique([tenantId, order])
        ├ Contact[] ─ companyId→CompanyContact
        ├ CompanyContact[]
        ├ Product[] ─ basePrice? | formula?
        ├ Formula[] ─ expression, variables(Json), createdBy
        ├ Quote[] ─ status QuoteStatus, total, discount, items QuoteItem[]
        ├ TenantSettings (1:1) ─ leadAssignmentStrategy MANUAL|ROUND_ROBIN|LOAD_BALANCED
        └ AuditLog[]
```
Enums: `Role`, `QuoteStatus` (DRAFT/SENT/ACCEPTED/REJECTED), `LeadAssignmentStrategy`, `DeletedState`.
Migraciones: `init` (2026-07-10) y `add_deleted_to_models` (2026-09-01).

---

## 8. API implementada

Auth: cookie HTTP-only `accessToken` (excepto `/health` y `/api/auth/*`). Rate limit global 100/15 min.

| Método | Ruta | Body / Query |
|---|---|---|
| GET | `/health` | — |
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

### Motor de filtrado genérico
`GET /api/<entidad>/filtered?search=texto&filters=[{"field":"statusId","operator":"equals","value":"…"}]&page=1&limit=20`
- `search`: OR `contains` (insensible a mayúsculas) sobre campos con `searchable:true`.
- `filters`: JSON array. Campo u operador fuera del `filterConfig` → `Error` (hoy 500, ver deuda).
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
9. `cross-cutting/container.ts` — un `get…UseCase()` por use case.
10. `infrastructure/web/controllers/[e]Controllers.ts` (`getAll`, `create`, `update`, `getFiltered`, …; roles se leen de `req.user`).
11. `presentation/schemas/[e]Schema.ts` (Zod) y `presentation/routes/[e]Routes.ts` (patrón de `leadRoutes.ts`).
12. `app.ts` — `app.use('/api/[e]', [e]Router(jwtService))`.

Convenciones: las restricciones por rol se pasan al use case (`role`, `userId`) o se aplican en el controller para filtrados; todo repositorio filtra por tenant y `deleted:'INUSE'`; errores como `throw new Error(...)`.

---

## 10. Decisiones técnicas

- JWT en cookie HTTP-only (no `localStorage`) para mitigar XSS.
- `AsyncLocalStorage` para `tenantId`: no se pasa manualmente por las capas.
- DI manual por request (`ScopedContainer`) en vez de librería.
- Prisma con driver adapter `pg` (pool nativo).
- Whitelist de campos/operadores en `filterConfig`: imposible filtrar por columnas internas.
- Soft delete (`deleted = 'DELETED'`) en vez de borrado físico; las consultas filtran `INUSE`.
- Roles evaluados en use cases (leads/estados) o controller (filtro de listados).

---

## 11. Entorno

`.env` (ver `.env.example`): `DATABASE_URL`, `JWT_SECRET` (default inseguro `default-secret` si falta), `JWT_EXPIRATION` (7d), `PORT` (default 4000), `NODE_ENV`. Docker Compose además requiere `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.

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
pnpm typecheck:tests
pnpm build          # tsc + tsc-alias  ->  pnpm start (node dist/server.js)
docker-compose up   # db (host 3363), backend (4000), prisma-studio (3364)
```
Git: rama principal `develop`; ramas `feat/...`; commits en español tipo `feat/ descripción`.

---

## 12. Tests

Guía completa: `tests/README.md`. Resumen de lo que hay que saber:

- **Cuatro proyectos Vitest:** `unit` (dobles en memoria, sin base de datos), `integration` (repositorios contra PostgreSQL real), `api` (aplicación real con supertest), `build` (compila como `pnpm build` y arranca el servidor compilado; regresión de H20).
- **Base de datos de test:** un contenedor efímero `postgres:15` por ejecución, con las migraciones reales aplicadas; cada archivo de test recibe su propia base y cada test empieza con las tablas vacías. Nunca se usa la base del `.env`.
- **Inventario de rutas** (`tests/support/http/apiRoutes.ts`): la suite falla si la aplicación registra una ruta no declarada ahí. Toda ruta declarada como protegida se prueba sola contra peticiones sin sesión y con token falsificado.
- **Matrices de seguridad** (R5): `tests/api/security/tenantIsolation.test.ts` y `roles.test.ts`. Todo endpoint nuevo añade ahí sus casos.
- **Defectos conocidos:** `itKnownDefect(hallazgo, …)` describe el comportamiento correcto de un hallazgo aún sin corregir. Se ejecuta siempre y pasa solo mientras el defecto exista; al corregirlo hay que convertirlo en `it(...)`. Hoy hay 30 (H2, H3, H4, H5, H7, H9, H10, H11, H14, H15 y F1-T14), listados en `tests/README.md`.
- **Límite a tener en cuenta:** el limitador global (100 peticiones / 15 min) vale también en los tests; un archivo de tests de API no puede superar 100 peticiones.
- **Cobertura actual:** 98 % de sentencias y 93 % de ramas (umbral: 80 % global, 90 % en `domain` y `application`).

---

## 13. Registro de cambios

| Fecha | Tarea | PR | Cambio |
|---|---|---|---|
| 2026-11-16 | F0-T02 | pendiente | Framework de tests (Vitest), dobles en memoria, fábricas de datos, base de datos efímera y 453 tests sobre el código existente. Sin cambios en `src/` ni en `prisma/`. |
| 2026-11-16 | F0-T07 | pendiente | Build de producción reparado (H20): `paths` sin `baseUrl`, conversión de `settings` a JSON de Prisma en `PrismaTenantRepository`, `tsc-alias` en `pnpm build`. Script `pnpm typecheck`. Proyecto de tests `build` (2 tests). |
