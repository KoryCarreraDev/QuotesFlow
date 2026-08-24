# CONTEXT.md — QuotesFlow (SaaS Comerciales)

> **¿Qué es este archivo?**
> Fuente de verdad del proyecto para IAs y personas nuevas en el equipo. Léelo antes de tocar cualquier archivo. Está escrito para ser entendido aunque no sepas TypeScript, Node.js ni Clean Architecture.

---

## 1. ¿Qué es QuotesFlow?

Un **backend API REST** para un **SaaS multi-tenant de gestión comercial** (CRM + cotizaciones). Cada empresa que se registra recibe un espacio de datos completamente aislado dentro de la misma base de datos PostgreSQL.

> **Multi-tenant:** Múltiples "inquilinos" (empresas) comparten la misma aplicación y base de datos, pero cada uno solo puede ver y modificar sus propios datos. El aislamiento se garantiza mediante la columna `tenantId` presente en **todas** las tablas.

### Funcionalidades planeadas

- Registro de empresas y usuarios con autenticación JWT
- Gestión de oportunidades de venta (Leads) con roles y permisos
- Contactos (personas y empresas clientes)
- Productos con precios fijos o calculados por fórmulas matemáticas
- Cotizaciones con ítems, PDF y envío por email
- Auditoría de acciones
- Mensajería (preparado en esquema, aún no implementado)

---

## 2. Estado actual del desarrollo

### ✅ Completamente implementado

| Módulo | Endpoints | Notas |
|---|---|---|
| **Autenticación** | `POST /api/auth/register`, `POST /api/auth/login` | Registro de empresa + usuario OWNER, login con cookie JWT |
| **Middleware multi-tenant** | — | Extrae JWT de cookie, inyecta `tenantId` en contexto global |
| **Leads (CRM)** | `GET /api/lead/getAll`, `POST /api/lead/create`, `PATCH /api/lead/update/:id`, `GET /api/lead/filtered` | CRUD completo + filtrado paginado + restricción por rol `SALES_REP` |
| **Contactos** | `GET /api/contact/getAll`, `POST /api/contact/create`, `PATCH /api/contact/update/:id`, `GET /api/contact/filtered` | CRUD completo + filtrado paginado, sin restricción de rol |
| **Motor de Filtrado Genérico** | — | Reutilizable para cualquier entidad (ver sección 9) |

### ⏳ Pendiente de implementar

- Productos y Fórmulas de precio (modelos ya definidos en `schema.prisma`)
- Cotizaciones y generación de PDF (modelos ya definidos en `schema.prisma`)
- CompanyContacts (modelo en esquema, sin capa de aplicación)
- Configuración de estados de Lead (`LeadStatusConfig`)
- AuditLog activo
- Mensajería

---

## 3. Stack tecnológico

| Tecnología | ¿Qué es? | Uso en este proyecto |
|---|---|---|
| **TypeScript** | JavaScript con tipos estáticos | Todo el código fuente |
| **Node.js 20** | Motor de ejecución de JS/TS en servidor | Entorno de ejecución |
| **Express 5** | Framework HTTP | Rutas, middlewares, servidor |
| **Prisma 7** | ORM (mapea TypeScript ↔ SQL) | Acceso a BD, migraciones, esquema (`schema.prisma`) |
| **PostgreSQL 15** | Base de datos relacional | Almacenamiento persistente |
| **Zod** | Validador de esquemas | Validación de request bodies en presentación |
| **bcryptjs** | Hashing seguro | Hash y verificación de contraseñas |
| **jsonwebtoken** | JWT | Autenticación y sesión de usuario |
| **cookie-parser** | Middleware Express | Parseo de cookies (`accessToken`) |
| **compression** | Middleware Express | Compresión Gzip/Brotli de respuestas |
| **helmet** | Middleware Express | Cabeceras de seguridad HTTP automáticas |
| **cors** | Middleware Express | Control de acceso cross-origin |
| **express-rate-limit** | Middleware Express | Protección contra fuerza bruta (100 req / 15 min global) |
| **winston** | Logger | Logs estructurados (instalado, integración pendiente) |
| **mathjs** | Evaluador matemático | Cálculo de precios dinámicos por fórmulas (pendiente) |
| **pdf-lib** | Generador PDF | PDFs de cotizaciones (pendiente) |
| **nodemailer** | Cliente SMTP | Envío de cotizaciones por email (pendiente) |
| **multer** | Upload de archivos | Logos y adjuntos (pendiente) |
| **node-cron** | Tareas programadas | Segundo plano (pendiente) |
| **Docker & Docker Compose** | Contenedores | Entorno dev aislado (App + Postgres) |
| **pnpm** | Gestor de paquetes | Reemplaza npm, más rápido y eficiente |

---

## 4. Arquitectura: Clean Architecture / Hexagonal

### 4.1. ¿Por qué esta arquitectura?

El código está dividido en **capas con responsabilidades estrictas**. La regla fundamental es:

> **Las capas internas NUNCA importan las externas.** El dominio no sabe que existe Express, Prisma ni ninguna librería de terceros.

Beneficios prácticos:
- Cambiar la BD u ORM sin tocar la lógica de negocio
- Cambiar Express por Fastify sin impactar el dominio
- Testear la lógica con mocks de repositorios

### 4.2. Capas (de adentro hacia afuera)

```
+------------------------------------------------------------------+
|  PRESENTATION (routes/, schemas/)   <- URLs y validacion Zod    |
|  +--------------------------------------------------------------+|
|  |  INFRASTRUCTURE (web/, persistence/, services/)              ||
|  |  +----------------------------------------------------------+||
|  |  |  APPLICATION (use-case/, dtos/, ports/, mappers/)        |||
|  |  |  +------------------------------------------------------+|||
|  |  |  |  DOMAIN (entities/, enums/)                          ||||
|  |  |  +------------------------------------------------------+|||
|  |  +----------------------------------------------------------+||
|  +--------------------------------------------------------------+|
|  CROSS-CUTTING (container.ts, tenantContext.ts)  <- DI / Tenant  |
|  CONFIG (env.ts, database.ts)                   <- Configuracion |
+------------------------------------------------------------------+
```

### 4.3. Reglas de importación (qué puede importar qué)

```
OK  domain/         -> NADA externo (solo Node.js nativo, ej: crypto)
OK  application/    -> domain/
OK  infrastructure/ -> domain/, application/
OK  presentation/   -> infrastructure/, application/, cross-cutting/
OK  cross-cutting/  -> application/, infrastructure/
OK  config/         -> dotenv, prisma, pg

NO  domain/         -> NO importa application/, infrastructure/, Express, Prisma
NO  application/    -> NO importa infrastructure/, Express, Prisma
```

---

## 5. Estructura de archivos detallada

```
QuotesFlow/
+-- prisma/
|   +-- schema.prisma          # Esquema completo de la BD
|   +-- migrations/            # Migraciones generadas por Prisma
+-- src/
|   +-- server.ts              # Entrada: arranca el servidor Express en el puerto env
|   +-- app.ts                 # Configura middlewares globales y monta routers
|   |
|   +-- config/
|   |   +-- env.ts             # Variables de entorno tipadas y validadas
|   |   +-- database.ts        # Conexion PostgreSQL via PrismaClient + pg Pool
|   |
|   +-- domain/                # CAPA MAS INTERNA — Reglas de negocio puras
|   |   +-- entities/
|   |   |   +-- Tenant.ts      # Empresa registrada
|   |   |   +-- User.ts        # Usuario con rol dentro de un tenant
|   |   |   +-- Lead.ts        # Oportunidad de venta (metodos: create, fromPrisma, update)
|   |   |   +-- Contact.ts     # Persona de contacto (metodos: create, fromPrisma)
|   |   +-- enums/
|   |       +-- Role.ts        # OWNER | PARTNER | SALES_LEADER | SALES_REP
|   |
|   +-- application/           # Casos de uso, DTOs, Puertos (interfaces), Mappers
|   |   +-- dtos/
|   |   |   +-- RegisterCompanyDTO.ts   # { companyName, ownerEmail, password, ... }
|   |   |   +-- LoginDTO.ts             # { email, password }
|   |   |   +-- LeadDTO.ts              # Salida de Lead al cliente
|   |   |   +-- CreateLeadDTO.ts        # Entrada para crear Lead
|   |   |   +-- UpdateLeadDTO.ts        # Entrada para actualizar Lead (todos opcionales)
|   |   |   +-- ContactDTO.ts           # Salida de Contact al cliente
|   |   |   +-- CreateContactDTO.ts     # { firstName, lastName, email?, phone?, companyId? }
|   |   |   +-- UpdateContactDTO.ts     # Todos los campos opcionales
|   |   |   +-- FilterCriteriaDTO.ts    # Motor generico: { filters?, search?, page?, limit? }
|   |   |   +-- PaginatedResultDTO.ts   # Respuesta paginada: { data, total, page, limit }
|   |   +-- mappers/
|   |   |   +-- LeadMapper.ts           # Lead -> LeadDTO (implementa ILeadMapper)
|   |   |   +-- ContactMapper.ts        # Contact -> ContactDTO (implementa IContactMapper)
|   |   +-- ports/
|   |   |   +-- repositories/
|   |   |   |   +-- IFilterableRepository.ts  # Contrato generico: findFiltered() + countFiltered()
|   |   |   |   +-- ILeadRepository.ts        # Extiende IFilterableRepository<Lead>
|   |   |   |   +-- IContactRepository.ts     # Extiende IFilterableRepository<Contact>
|   |   |   |   +-- ITenantRepository.ts
|   |   |   |   +-- IUserRepository.ts
|   |   |   +-- services/
|   |   |   |   +-- IHashService.ts
|   |   |   |   +-- IAuthTokenService.ts      # sign(payload) + verify(token)
|   |   |   |   +-- ITenantContext.ts         # getTenantId(): string
|   |   |   |   +-- IFilterFieldConfig.ts     # Mapa de campos filtrables con operadores
|   |   |   +-- mappers/
|   |   |       +-- IMapper.ts                # Contrato generico: toDTO(entity): DTO
|   |   |       +-- ILeadMapper.ts
|   |   |       +-- IContactMapper.ts
|   |   +-- use-case/
|   |       +-- auth/
|   |       |   +-- RegisterCompanyAndOwnerUseCase.ts
|   |       |   +-- LoginUseCase.ts
|   |       +-- filter/
|   |       |   +-- GenericListFilteredUseCase.ts  # Motor reutilizable para cualquier entidad
|   |       +-- leads/
|   |       |   +-- getLeadsUseCase.ts
|   |       |   +-- createLeadUseCase.ts
|   |       |   +-- updateLeadUseCase.ts
|   |       |   +-- listFilteredLeadsUseCase.ts    # Type alias: GenericListFilteredUseCase<Lead, LeadDTO>
|   |       +-- contacts/
|   |           +-- getContactsUseCase.ts
|   |           +-- createContactUseCase.ts
|   |           +-- updateContactUseCase.ts
|   |           +-- listFilteredContactsUseCase.ts # Type alias: GenericListFilteredUseCase<Contact, ContactDTO>
|   |
|   +-- infrastructure/        # Implementaciones concretas de los puertos
|   |   +-- persistence/
|   |   |   +-- prisma/
|   |   |   |   +-- PrismaService.ts            # Singleton de PrismaClient
|   |   |   +-- repositories/
|   |   |   |   +-- BasePrismaRepository.ts     # Clase base: tenantWhere(), buildFilterWhere(), buildPagination()
|   |   |   |   +-- PrismaUserRepository.ts
|   |   |   |   +-- PrismaTenantRepository.ts
|   |   |   |   +-- PrismaLeadRepository.ts     # Implementa ILeadRepository + findFiltered() + countFiltered()
|   |   |   |   +-- PrismaContactRepository.ts  # Implementa IContactRepository + findFiltered() + countFiltered()
|   |   |   +-- filters/
|   |   |       +-- leadFilterConfig.ts         # Campos filtrables de Lead y operadores permitidos
|   |   |       +-- contactFilterConfig.ts      # Campos filtrables de Contact y operadores permitidos
|   |   +-- services/
|   |   |   +-- BcryptHashService.ts            # Implementa IHashService
|   |   |   +-- JwtTokenService.ts              # Implementa IAuthTokenService (clase exportada: JwTokenService)
|   |   +-- web/
|   |       +-- controllers/
|   |       |   +-- AuthControllers.ts
|   |       |   +-- leadControllers.ts          # getAll, create, update, getFiltered (con restriccion SALES_REP)
|   |       |   +-- contactControllers.ts       # getAll, create, update, getFiltered
|   |       +-- middleware/
|   |           +-- validateBody.ts             # Valida req.body con un schema Zod
|   |           +-- createAuthValidateCookie.ts # Lee cookie accessToken, verifica JWT, pone req.user
|   |           +-- createTenantMiddleware.ts   # Corre TenantContext.run() y crea req.container
|   |
|   +-- presentation/
|   |   +-- routes/
|   |   |   +-- authRoutes.ts
|   |   |   +-- leadRoutes.ts     # /getAll, /create, /update/:id, /filtered
|   |   |   +-- contactRoutes.ts  # /getAll, /create, /update/:id, /filtered
|   |   +-- schemas/
|   |       +-- authSchema.ts
|   |       +-- leadSchema.ts     # createLeadSchema, updateLeadSchema (Zod)
|   |       +-- contactSchema.ts  # createContactSchema, updateContactSchema (Zod)
|   |
|   +-- cross-cutting/
|   |   +-- container.ts         # ScopedContainer: DI manual por request
|   |   +-- tenantContext.ts     # AsyncLocalStorage wrapper (clase: TenantContext)
|   |
|   +-- types/
|       +-- express.d.ts         # Extiende Express.Request: req.container, req.user
|
+-- docker-compose.yml           # Levanta App (Node) + PostgreSQL en contenedores
+-- Dockerfile                   # Imagen Docker de la app
+-- package.json                 # Scripts: dev, build, start, migrate, studio
+-- tsconfig.json                # TypeScript: paths alias @/ -> src/
+-- prisma.config.ts             # Config Prisma CLI (apunta a schema.prisma)
+-- nodemon.json                 # Configuracion de recarga en desarrollo
```

---

## 6. Conceptos clave

### 6.1. Multi-Tenancy con AsyncLocalStorage

Cada request autenticada pasa por estos pasos en orden:

```
HTTP Request
  |
  v
[createAuthValidateCookie]
  Lee cookie "accessToken", verifica firma JWT
  Pone { userId, tenantId, role } en req.user
  |
  v
[createTenantMiddleware]
  Llama TenantContext.run(tenantId, callback)
  Crea req.container = new ScopedContainer(tenantId)
  |
  v
[Controller] (usa req.container para obtener casos de uso)
  |
  v
[BasePrismaRepository] <- automaticamente filtra WHERE tenantId = X en TODAS las consultas
```

> **Clave:** `AsyncLocalStorage` de Node.js permite que `tenantId` esté disponible en cualquier punto de la cadena de ejecución de una request sin pasarlo manualmente por cada función.

### 6.2. Inyección de Dependencias (DI) por Request

`ScopedContainer` (`src/cross-cutting/container.ts`) es una clase que ensambla manualmente todas las dependencias:

- **Sin tenantId (scope público):** Usado por `authRouter` para registro y login.
- **Con tenantId (scope autenticado):** Instanciado por `createTenantMiddleware` para cada request protegida. Disponible en `req.container`.

Cada método `get[X]UseCase()` del container instancia el repositorio, el mapper y el caso de uso correspondiente.

### 6.3. Restricciones de visibilidad por Rol

Solo aplica al módulo de Leads:

| Rol | Qué ve |
|---|---|
| `SALES_REP` | Solo leads donde `assignedToId === userId` |
| `OWNER`, `PARTNER`, `SALES_LEADER` | Todos los leads del tenant |

Esta lógica vive en `leadControllers.ts` en el método `getFiltered()`. El caso de uso genérico permanece puro y sin conocimiento de roles.

### 6.4. Path alias `@/`

En los imports, `@/` equivale a `src/`. Configurado en `tsconfig.json`. Ejemplo:

```typescript
import { Lead } from "@/domain/entities/Lead.js";
// equivale a:
import { Lead } from "../../domain/entities/Lead.js";
```

> **Importante:** Los imports siempre terminan en `.js` aunque el archivo sea `.ts`. Así lo requiere TypeScript con módulos ESM.

---

## 7. Modelo de datos (schema.prisma)

Todos los modelos tienen `tenantId` y se relacionan en cascada (`onDelete: Cascade`) con `Tenant`.

```
Tenant (empresa)
 +-- User[]               -> Usuarios (roles: OWNER, PARTNER, SALES_LEADER, SALES_REP)
 +-- Lead[]               -> Oportunidades de venta
 |    +-- LeadStatusHistory[]  -> Auditoria de cambios de estado
 |    +-- Quote[]              -> Cotizaciones del lead
 +-- Contact[]            -> Personas de contacto
 |    +-- Quote[]
 +-- CompanyContact[]     -> Empresas clientes (Contact.companyId -> CompanyContact.id)
 +-- Product[]            -> Productos/servicios (precio fijo o por formula)
 |    +-- QuoteItem[]
 +-- Formula[]            -> Formulas matematicas para precio dinamico
 +-- Quote[]              -> Cotizaciones
 |    +-- QuoteItem[]     -> Lineas de cotizacion (producto + cantidad + precio calculado)
 +-- LeadStatusConfig[]   -> Estados de lead personalizables por tenant
 +-- TenantSettings       -> Configuracion (estrategia de asignacion de leads)
 +-- AuditLog[]           -> Registro de acciones de usuarios
```

**Enums del esquema:**

| Enum | Valores |
|---|---|
| `Role` | `OWNER`, `PARTNER`, `SALES_LEADER`, `SALES_REP` |
| `QuoteStatus` | `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED` |
| `LeadAssignmentStrategy` | `MANUAL`, `ROUND_ROBIN`, `LOAD_BALANCED` |

---

## 8. Endpoints API implementados

| Método | Ruta | Auth | Body / Query | Descripción |
|---|---|---|---|---|
| `GET` | `/health` | No | — | Health check del servidor |
| `POST` | `/api/auth/register` | No | `{ companyName, ownerEmail, password, ownerFirstName, ownerLastName }` | Crea tenant + usuario OWNER, emite cookie JWT |
| `POST` | `/api/auth/login` | No | `{ email, password }` | Verifica credenciales, emite cookie `accessToken` |
| `GET` | `/api/lead/getAll` | Cookie JWT | — | Lista simple de leads (filtrada por rol) |
| `POST` | `/api/lead/create` | Cookie JWT | `{ contactName?, companyName?, email?, phone?, statusId?, source?, assignedToId?, estimatedValue?, notes? }` | Crear lead |
| `PATCH` | `/api/lead/update/:id` | Cookie JWT | Campos opcionales de lead | Actualizar lead |
| `GET` | `/api/lead/filtered` | Cookie JWT | `?search=&filters=[...]&page=1&limit=20` | Leads paginados y filtrados |
| `GET` | `/api/contact/getAll` | Cookie JWT | — | Lista simple de contactos |
| `POST` | `/api/contact/create` | Cookie JWT | `{ firstName, lastName, email?, phone?, companyId? }` | Crear contacto |
| `PATCH` | `/api/contact/update/:id` | Cookie JWT | Campos opcionales de contacto | Actualizar contacto |
| `GET` | `/api/contact/filtered` | Cookie JWT | `?search=&filters=[...]&page=1&limit=20` | Contactos paginados y filtrados |

---

## 9. Motor de filtrado genérico

### 9.1. ¿Qué hace?

Cualquier endpoint `GET /api/[entidad]/filtered` acepta:

- **`?search=texto`** → Busca en campos con `searchable: true` en el filterConfig (OR entre ellos, case-insensitive)
- **`?filters=[{"field":"statusId","operator":"equals","value":"uuid-xxx"}]`** → JSON array de filtros específicos
- **`?page=1&limit=20`** → Paginación (default page=1, limit=20, max limit=100)

Campos o operadores no declarados en el `filterConfig` son **rechazados automáticamente con error 400**.

### 9.2. Archivos del motor (ya existen, NO recrear)

| Archivo | Rol |
|---|---|
| `src/application/dtos/FilterCriteriaDTO.ts` | Tipo de entrada: `{ filters?, search?, page?, limit? }` |
| `src/application/dtos/PaginatedResultDTO.ts` | Tipo de salida: `{ data, total, page, limit }` |
| `src/application/ports/repositories/IFilterableRepository.ts` | Contrato: `findFiltered()` + `countFiltered()` |
| `src/application/ports/services/IFilterFieldConfig.ts` | Tipo del mapa de campos filtrables |
| `src/application/ports/mappers/IMapper.ts` | Contrato generico: `toDTO(entity): DTO` |
| `src/application/use-case/filter/GenericListFilteredUseCase.ts` | Motor central (reutilizable) |
| `src/infrastructure/persistence/repositories/BasePrismaRepository.ts` | `buildFilterWhere()`, `buildPagination()`, `tenantWhere()` |

### 9.3. Operadores disponibles

| Operador | Uso | Tipo de campo |
|---|---|---|
| `contains` | Búsqueda parcial (LIKE, case-insensitive) | Texto |
| `equals` | Igualdad exacta | Texto, UUID, número, fecha |
| `in` | Pertenece a un array de valores | UUID, enums |
| `gt` | Mayor que | Número, fecha |
| `gte` | Mayor o igual que | Número, fecha |
| `lt` | Menor que | Número, fecha |
| `lte` | Menor o igual que | Número, fecha |

### 9.4. Campos filtrables por entidad

**Lead** (`leadFilterConfig.ts`):

| Campo | Operadores | Searchable |
|---|---|---|
| `companyName` | `contains`, `equals` | Si |
| `contactName` | `contains`, `equals` | Si |
| `email` | `contains`, `equals` | Si |
| `phone` | `contains`, `equals` | Si |
| `notes` | `contains`, `equals` | Si |
| `statusId` | `equals`, `in` | No |
| `source` | `contains`, `equals` | No |
| `assignedToId` | `equals`, `in` | No |
| `estimatedValue` | `equals`, `gt`, `gte`, `lt`, `lte` | No |
| `expectedCloseDate` | `equals`, `gt`, `gte`, `lt`, `lte` | No |
| `createdAt` | `equals`, `gt`, `gte`, `lt`, `lte` | No |

**Contact** (`contactFilterConfig.ts`):

| Campo | Operadores | Searchable |
|---|---|---|
| `firstName` | `contains`, `equals` | Si |
| `lastName` | `contains`, `equals` | Si |
| `email` | `contains`, `equals` | Si |
| `phone` | `contains`, `equals` | Si |
| `companyId` | `equals`, `in` | No |
| `createdAt` | `equals`, `gt`, `gte`, `lt`, `lte` | No |

### 9.5. Flujo interno de una request filtrada

```
GET /api/[entidad]/filtered?search=foo&filters=[...]&page=1&limit=20
  |
  v
[Controller]
  Parsea query params -> construye FilterCriteriaDTO
  Aplica restricciones de rol si aplica (ej: SALES_REP en Leads)
  |
  v
[GenericListFilteredUseCase.execute(criteria)]
  |
  +-> repository.findFiltered(criteria, filterConfig)
  |     +-> BasePrismaRepository.buildFilterWhere()
  |           - Siempre agrega { tenantId } primero
  |           - Valida cada filtro contra filterConfig (400 si invalido)
  |           - Si search: OR sobre campos con searchable:true
  |
  +-> repository.countFiltered(criteria, filterConfig)
  |     +-> BasePrismaRepository.buildFilterWhere() (mismo where, sin paginacion)
  |
  +-> retorna PaginatedResult<DTO> { data, total, page, limit }
```

### 9.6. Ejemplo de request HTTP

```
GET /api/lead/filtered?search=john&page=1&limit=20&filters=[{"field":"statusId","operator":"equals","value":"uuid-xxx"},{"field":"estimatedValue","operator":"gte","value":5000}]
Cookie: accessToken=<jwt>
```

**Respuesta estandarizada:**
```json
{
  "data": [ ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

---

## 10. Guía paso a paso: agregar una nueva entidad

> Sustituye `[Entidad]` por el nombre en PascalCase (ej: `Product`) y `[entidad]` en camelCase (ej: `product`).

Las referencias canónicas son:
- **Contact** para un módulo sin restricción de rol (más simple)
- **Lead** para un módulo con restricción de rol

### Paso 1 — Entidad de Dominio

**Archivo nuevo:** `src/domain/entities/[Entidad].ts`

Clase con:
- Constructor con todos los campos como `readonly`
- `static create(props)`: genera `id` con `crypto.randomUUID()` y retorna la entidad
- `static fromPrisma(record)`: convierte el registro de Prisma a entidad (maneja `null -> undefined`)

### Paso 2 — DTOs

**Archivos nuevos en** `src/application/dtos/`:
- `[Entidad]DTO.ts`: lo que se devuelve al cliente (sin `tenantId` ni campos internos)
- `Create[Entidad]DTO.ts`: campos de creación
- `Update[Entidad]DTO.ts`: mismos campos pero todos opcionales

### Paso 3 — Puerto del repositorio

**Archivo nuevo:** `src/application/ports/repositories/I[Entidad]Repository.ts`

```typescript
import { IFilterableRepository } from "./IFilterableRepository.js";
import { [Entidad] } from "../../../domain/entities/[Entidad].js";

export interface I[Entidad]Repository extends IFilterableRepository<[Entidad]> {
    findByTenant(): Promise<[Entidad][]>;
    create(entity: [Entidad]): Promise<void>;
    findById(id: string): Promise<[Entidad] | null>;
    update(id: string, data: [Entidad]): Promise<void>;
}
```

### Paso 4 — Puerto del mapper

**Archivo nuevo:** `src/application/ports/mappers/I[Entidad]Mapper.ts`

```typescript
import { IMapper } from "./IMapper.js";
import { [Entidad] } from "../../../domain/entities/[Entidad].js";
import { [Entidad]DTO } from "../../dtos/[Entidad]DTO.js";

export interface I[Entidad]Mapper extends IMapper<[Entidad], [Entidad]DTO> {}
```

### Paso 5 — Mapper de aplicación

**Archivo nuevo:** `src/application/mappers/[Entidad]Mapper.ts`

Implementa `I[Entidad]Mapper` con el método `toDTO(entity): [Entidad]DTO`.

### Paso 6 — Casos de uso

**Archivos nuevos en** `src/application/use-case/[entidades]/`:

- `get[Entidades]UseCase.ts`
- `create[Entidad]UseCase.ts`
- `update[Entidad]UseCase.ts`
- `listFiltered[Entidades]UseCase.ts` (solo un type alias):

```typescript
import { GenericListFilteredUseCase } from "../filter/GenericListFilteredUseCase.js";
import { [Entidad] } from "@/domain/entities/[Entidad].js";
import { [Entidad]DTO } from "@/application/dtos/[Entidad]DTO.js";

export type ListFiltered[Entidades]UseCase = GenericListFilteredUseCase<[Entidad], [Entidad]DTO>;
```

**Referencia:** `src/application/use-case/contacts/listFilteredContactsUseCase.ts`

### Paso 7 — Repositorio Prisma

**Archivo nuevo:** `src/infrastructure/persistence/repositories/Prisma[Entidad]Repository.ts`

Extiende `BasePrismaRepository` e implementa `I[Entidad]Repository`. Los métodos `findFiltered` y `countFiltered` son casi idénticos en todas las entidades:

```typescript
async findFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<[Entidad][]> {
    const where = this.buildFilterWhere(criteria, config);  // heredado de BasePrismaRepository
    const { skip, take } = this.buildPagination(criteria);  // heredado de BasePrismaRepository
    const records = await this.prisma.[entidad].findMany({ where, skip, take });
    return records.map([Entidad].fromPrisma);
}

async countFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<number> {
    const where = this.buildFilterWhere(criteria, config);
    return this.prisma.[entidad].count({ where });
}
```

**Referencia:** `src/infrastructure/persistence/repositories/PrismaContactRepository.ts`

### Paso 8 — FilterConfig

**Archivo nuevo:** `src/infrastructure/persistence/filters/[entidad]FilterConfig.ts`

```typescript
import { IFilterFieldConfig } from "@/application/ports/services/IFilterFieldConfig.js";

export const [entidad]FilterConfig: IFilterFieldConfig = {
    nombreCampo: {
        allowedOperators: ["contains", "equals"],
        searchable: true,  // true = incluido en ?search=texto
    },
};
```

**Referencia:** `src/infrastructure/persistence/filters/contactFilterConfig.ts`

### Paso 9 — Registrar en el contenedor DI

**Archivo a modificar:** `src/cross-cutting/container.ts`

Agregar los métodos en la clase `ScopedContainer`:

```typescript
getGet[Entidades]UseCase(): Get[Entidades]UseCase {
    const repo = new Prisma[Entidad]Repository(this.prisma, this.tenantContext);
    const mapper = new [Entidad]Mapper();
    return new Get[Entidades]UseCase(repo, mapper);
}
getCreate[Entidad]UseCase(): Create[Entidad]UseCase {
    const repo = new Prisma[Entidad]Repository(this.prisma, this.tenantContext);
    const mapper = new [Entidad]Mapper();
    return new Create[Entidad]UseCase(repo, mapper, this.tenantContext);
}
getUpdate[Entidad]UseCase(): Update[Entidad]UseCase {
    const repo = new Prisma[Entidad]Repository(this.prisma, this.tenantContext);
    const mapper = new [Entidad]Mapper();
    return new Update[Entidad]UseCase(repo, mapper, this.tenantContext);
}
getListFiltered[Entidades]UseCase(): ListFiltered[Entidades]UseCase {
    const repo = new Prisma[Entidad]Repository(this.prisma, this.tenantContext);
    const mapper = new [Entidad]Mapper();
    return new GenericListFilteredUseCase(repo, mapper, [entidad]FilterConfig);
}
```

**Referencia:** métodos `getGetContactsUseCase`, `getCreateContactUseCase`, etc. en `container.ts` (líneas 80-99)

### Paso 10 — Controller

**Archivo nuevo:** `src/infrastructure/web/controllers/[entidad]Controllers.ts`

Clase con los métodos `getAll`, `create`, `update`, `getFiltered`.

Para `getFiltered`, la lógica de parseo de query params es siempre la misma (ver `contactControllers.ts`). Si se necesita restricción por rol, agregar antes de llamar al use case (ver `leadControllers.ts`).

### Paso 11 — Schema Zod

**Archivo nuevo:** `src/presentation/schemas/[entidad]Schema.ts`

```typescript
import { z } from 'zod';

export const create[Entidad]Schema = z.object({
    // campos requeridos y opcionales
});
export const update[Entidad]Schema = z.object({
    // mismos campos, todos .optional()
});
```

### Paso 12 — Rutas

**Archivo nuevo:** `src/presentation/routes/[entidad]Routes.ts`

Sigue exactamente el patrón de `contactRoutes.ts`:
1. Función `get[Entidad]Controller(req)` que resuelve el controller desde `req.container`
2. Función `[entidad]Router(jwtService)` que registra las rutas con `authMiddleware` y `tenantMiddleware`

### Paso 13 — Registrar en app.ts

**Archivo a modificar:** `src/app.ts`

```typescript
import { [entidad]Router } from './presentation/routes/[entidad]Routes.js';
// ...
app.use('/api/[entidad]', [entidad]Router(jwtService));
```

### Checklist completo

| Estado | Archivo | Accion |
|---|---|---|
| [ ] | `src/domain/entities/[Entidad].ts` | Crear |
| [ ] | `src/application/dtos/[Entidad]DTO.ts` | Crear |
| [ ] | `src/application/dtos/Create[Entidad]DTO.ts` | Crear |
| [ ] | `src/application/dtos/Update[Entidad]DTO.ts` | Crear |
| [ ] | `src/application/ports/repositories/I[Entidad]Repository.ts` | Crear |
| [ ] | `src/application/ports/mappers/I[Entidad]Mapper.ts` | Crear |
| [ ] | `src/application/mappers/[Entidad]Mapper.ts` | Crear |
| [ ] | `src/application/use-case/[entidades]/get[Entidades]UseCase.ts` | Crear |
| [ ] | `src/application/use-case/[entidades]/create[Entidad]UseCase.ts` | Crear |
| [ ] | `src/application/use-case/[entidades]/update[Entidad]UseCase.ts` | Crear |
| [ ] | `src/application/use-case/[entidades]/listFiltered[Entidades]UseCase.ts` | Crear (type alias) |
| [ ] | `src/infrastructure/persistence/repositories/Prisma[Entidad]Repository.ts` | Crear |
| [ ] | `src/infrastructure/persistence/filters/[entidad]FilterConfig.ts` | Crear |
| [ ] | `src/cross-cutting/container.ts` | Modificar: agregar 4 metodos get*UseCase |
| [ ] | `src/infrastructure/web/controllers/[entidad]Controllers.ts` | Crear |
| [ ] | `src/presentation/schemas/[entidad]Schema.ts` | Crear |
| [ ] | `src/presentation/routes/[entidad]Routes.ts` | Crear |
| [ ] | `src/app.ts` | Modificar: importar e instanciar el router |
| [ ] | `prisma/schema.prisma` | Modificar si la entidad no existe en la BD |

---

## 11. Decisiones técnicas importantes

| Decisión | Razón |
|---|---|
| **Cookies HTTP-Only para JWT** | Más seguro que `localStorage`: no accesible desde JS del navegador (protege contra XSS) |
| **AsyncLocalStorage para tenantId** | Evita pasar `tenantId` manualmente por todas las capas |
| **Driver Adapter Prisma (`@prisma/adapter-pg`)** | Pool de conexiones nativo `pg` para mejor gestión en producción |
| **DI por request** | `createTenantMiddleware` crea un `ScopedContainer` nuevo en cada request autenticada, garantizando aislamiento |
| **Motor de filtrado genérico** | Un solo `GenericListFilteredUseCase` sirve para todas las entidades; solo se conecta la config específica |
| **Type alias en vez de subclase** | `ListFilteredLeadsUseCase` es un `type`, no una clase. Evita código repetido |
| **Whitelist de campos en filterConfig** | Campos no declarados retornan 400. Imposible filtrar por columnas internas |
| **tenantId siempre primero** | `buildFilterWhere()` agrega `tenantId` como primera condición. Imposible acceder a datos de otro tenant |
| **Restricción de rol en controller** | Depende de `req.user` (concepto HTTP), por eso vive en el controller y no en el use case |

---

## 12. Entorno de desarrollo

### Variables de entorno (`.env`)

Copia `.env.example` a `.env` y completa:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/quotesflow
JWT_SECRET=tu_secreto_muy_largo_y_seguro
PORT=3000
```

### Comandos útiles

```bash
# Instalar dependencias
pnpm install

# Desarrollo con recarga automática
pnpm dev

# Levantar App + PostgreSQL con Docker
docker-compose up

# Ejecutar migraciones de BD
pnpm migrate

# Abrir UI visual de la BD (Prisma Studio)
pnpm studio

# Compilar TypeScript a JS
pnpm build

# Iniciar en produccion
pnpm start
```
