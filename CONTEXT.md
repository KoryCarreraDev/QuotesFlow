# CONTEXT.md — QuotesFlow (SaaS Comerciales)

> **¿Qué es este archivo?** Una guía completa para que cualquier persona (o IA) entienda el proyecto sin tener que leer cada archivo. Si eres nuevo en el equipo o una IA procesando este repositorio, empieza aquí.

---

## 1. ¿Qué es este proyecto?

Un **backend API REST** para un **SaaS multi-tenant de gestión comercial** (CRM + cotizaciones). Cada empresa (tenant) que se registra obtiene su propio espacio aislado de datos dentro de la misma base de datos.

**Funcionalidades principales planeadas:**
- Registro de empresas y usuarios (autenticación)
- Autenticación mediante JWT almacenado en Cookies HTTP-Only
- Gestión de leads/oportunidades de venta (con restricciones por rol: `SALES_REP`, `SALES_LEADER`, `PARTNER`, `OWNER`)
- Contactos (personas y empresas)
- Productos con precios fijos o calculados por fórmulas matemáticas
- Cotizaciones con ítems y generación de PDF
- Auditoría de acciones
- Mensajería (preparado, aún no implementado)

**Estado actual:** Fase de desarrollo activo.
- ✅ Autenticación completa: Registro de empresa + usuario owner (`POST /api/auth/register`) y Login (`POST /api/auth/login`) con emisión de cookie JWT.
- ✅ Middleware Multi-Tenant: Extracción de credenciales desde cookie (`createAuthValidateCookie`) e inyección de contexto de tenant via `AsyncLocalStorage` (`createTenantMiddleware`).
- ✅ Módulo de Leads: Dominio (`Lead`), DTOs, Mappers (`LeadMapper`), Puertos, Casos de Uso (`GetLeadsUseCase`, `CreateLeadUseCase`, `UpdateLeadUseCase`, `ListFilteredLeadsUseCase`), Repositorio Prisma (`PrismaLeadRepository`), Controller y Rutas (`/api/lead/*`).
- ✅ Motor de Filtrado Genérico: `GenericListFilteredUseCase`, `IFilterableRepository`, `IFilterFieldConfig`, `FilterCriteriaDTO`, `PaginatedResultDTO`. Leads ya integrado como primera entidad.
- ⏳ Próximos módulos: Contactos, Productos/Fórmulas de precio, Cotizaciones.

---

## 2. Stack Tecnológico (explicado simple)

| Tecnología | ¿Qué es? | ¿Para qué se usa aquí? |
|---|---|---|
| **TypeScript** | JavaScript con tipos. Te dice si usas mal un dato antes de ejecutar. | Todo el código fuente |
| **Node.js 20** | El motor que permite correr JavaScript/TypeScript fuera del navegador. | Entorno de ejecución del servidor |
| **Express 5** | Un framework web. Recepciona peticiones HTTP y las dirige al código correcto. | Rutas, middlewares, servidor HTTP |
| **Prisma 7** | Un ORM (traductor entre código TypeScript y SQL). | Acceso a base de datos, migraciones, esquema (`schema.prisma`) |
| **PostgreSQL 15** | Base de datos relacional. | Almacenamiento persistente |
| **Zod** | Validador de datos. | Validación de request bodies en la capa de presentación |
| **bcryptjs** | Librería de hashing. | Hash y verificación de contraseñas de usuarios |
| **jsonwebtoken** | Genera y verifica tokens JWT. | Autenticación y sesión de usuario (`JwtTokenService`) |
| **cookie-parser** | Middleware de Express. | Lectura y parseo de cookies de peticiones HTTP (`accessToken`) |
| **compression** | Middleware de Express. | Compresión Gzip/Brotli de respuestas HTTP |
| **helmet** | Seguridad HTTP. | Cabeceras de seguridad automáticas |
| **cors** | Control de acceso cross-origin. | Permitir peticiones desde frontend autorizado |
| **express-rate-limit** | Limitador de tasa de peticiones. | Protección contra ataques de fuerza bruta / abuso |
| **winston** | Logger estructurado. | Registro de logs de la aplicación |
| **mathjs** | Evaluador de expresiones matemáticas. | Cálculo de precios dinámicos mediante fórmulas |
| **pdf-lib** | Generador de PDF. | Creación de documentos PDF de cotizaciones |
| **nodemailer** | Cliente de email. | Envío de cotizaciones y notificaciones por correo |
| **multer** | Gestor de uploads. | Carga de archivos adjuntos / logos |
| **node-cron** | Tareas programadas. | Ejecución de tareas en segundo plano |
| **Docker & Docker Compose** | Contenedores. | Entorno de desarrollo aislado (App + Postgres) |
| **pnpm** | Gestor de paquetes. | Instalación rápida y eficiente de dependencias |

---

## 3. Arquitectura: Clean Architecture / Hexagonal

### 3.1. ¿Por qué esta arquitectura?

El código está organizado en **capas con responsabilidades separadas**. La regla de oro es:

> **Las capas internas NUNCA conocen a las externas.** El dominio no sabe que existe Express, Prisma, ni ninguna librería. Solo conoce sus propias reglas de negocio.

Esto permite:
- Cambiar la base de datos o el ORM sin tocar la lógica de negocio.
- Cambiar el framework web (Express -> Fastify, etc.) sin impactar el dominio ni los casos de uso.
- Testear la lógica de negocio mediante mocks de repositorios y servicios.

### 3.2. Las Capas (de adentro hacia afuera)

```
+---------------------------------------------------------------------+
|  PRESENTATION (routes/, schemas/)  <- Define URLs y validación Zod  |
|  +--------------------------------------------------------------- + |
|  |  INFRASTRUCTURE (web/, persistence/, services/)               | |
|  |  +----------------------------------------------------------+  | |
|  |  |  APPLICATION (use-case/, dtos/, ports/, mappers/)        |  | |
|  |  |  +----------------------------------------------------+  |  | |
|  |  |  |  DOMAIN (entities/, enums/, value-objects/)        |  |  | |
|  |  |  +----------------------------------------------------+  |  | |
|  |  +----------------------------------------------------------+  | |
|  +----------------------------------------------------------------+ |
|  CROSS-CUTTING (container.ts, tenantContext.ts)  <- DI / Ensamblaje |
|  CONFIG (env.ts, database.ts)                   <- Configuración BD |
+---------------------------------------------------------------------+
```

---

## 4. Estructura de Carpetas (con responsabilidades)

```
src/
+-- server.ts                  # Punto de entrada. Arranca el servidor Express.
+-- app.ts                     # Middlewares globales (helmet, cors, compression, cookieParser, rateLimit) y rutas.
|
+-- config/
|   +-- env.ts                 # Variables de entorno tipadas (.env).
|   +-- database.ts            # Conexion PostgreSQL via Prisma + pg Pool.
|
+-- domain/                    # DOMINIO - Reglas de negocio puras
|   +-- entities/
|   |   +-- User.ts
|   |   +-- Tenant.ts
|   |   +-- Lead.ts
|   +-- enums/
|   |   +-- Role.ts            # OWNER, PARTNER, SALES_LEADER, SALES_REP
|   +-- value-objects/
|
+-- application/               # APLICACION - Casos de uso, DTOs, Puertos
|   +-- dtos/
|   |   +-- RegisterCompanyDTO.ts
|   |   +-- LoginDTO.ts
|   |   +-- CreateLeadDTO.ts
|   |   +-- UpdateLeadDTO.ts
|   |   +-- LeadDTO.ts
|   |   +-- FilterCriteriaDTO.ts   # DTO generico: { filters?, search?, page?, limit? }
|   |   +-- PaginatedResultDTO.ts  # DTO generico de salida: { data, total, page, limit }
|   +-- mappers/
|   |   +-- LeadMapper.ts          # Entidad Lead -> LeadDTO. Implementa IMapper<Lead, LeadDTO>
|   +-- ports/
|   |   +-- repositories/
|   |   |   +-- IFilterableRepository.ts  # Contrato: findFiltered() + countFiltered()
|   |   |   +-- ILeadRepository.ts        # Extiende IFilterableRepository<Lead>
|   |   |   +-- ITenantRepository.ts
|   |   |   +-- IUserRepository.ts
|   |   +-- services/
|   |   |   +-- IFilterFieldConfig.ts     # Contrato del mapa de campos filtrables
|   |   |   +-- IHashService.ts
|   |   |   +-- IAuthTokenService.ts
|   |   |   +-- ITenantContext.ts
|   |   +-- mappers/
|   |       +-- IMapper.ts                # Contrato generico: toDTO(entity): DTO
|   |       +-- ILeadMapper.ts
|   +-- use-case/
|       +-- auth/
|       |   +-- RegisterCompanyAndOwnerUseCase.ts
|       |   +-- LoginUseCase.ts
|       +-- filter/
|       |   +-- GenericListFilteredUseCase.ts  # Motor generico. Reutilizable para cualquier entidad.
|       +-- leads/
|           +-- createLeadUseCase.ts
|           +-- getLeadsUseCase.ts
|           +-- updateLeadUseCase.ts
|           +-- listFilteredLeadsUseCase.ts    # Type alias: GenericListFilteredUseCase<Lead, LeadDTO>
|
+-- infrastructure/            # INFRAESTRUCTURA - Implementaciones concretas
|   +-- persistence/
|   |   +-- filters/
|   |   |   +-- leadFilterConfig.ts   # Campos filtrables de Lead (operadores, searchable)
|   |   +-- prisma/
|   |   |   +-- PrismaService.ts      # Singleton de PrismaClient
|   |   +-- repositories/
|   |       +-- BasePrismaRepository.ts    # tenantWhere(), buildFilterWhere(), buildPagination()
|   |       +-- PrismaUserRepository.ts
|   |       +-- PrismaTenantRepository.ts
|   |       +-- PrismaLeadRepository.ts    # ILeadRepository + findFiltered() + countFiltered()
|   +-- services/
|   |   +-- BcryptHashService.ts
|   |   +-- JwtTokenService.ts
|   +-- web/
|       +-- controllers/
|       |   +-- AuthControllers.ts
|       |   +-- leadControllers.ts         # getFiltered() con logica de rol SALES_REP
|       +-- middleware/
|           +-- validateBody.ts
|           +-- createAuthValidateCookie.ts
|           +-- createTenantMiddleware.ts
|
+-- presentation/
|   +-- routes/
|   |   +-- authRoutes.ts
|   |   +-- leadRoutes.ts      # getAll, create, update/:id, filtered
|   +-- schemas/
|       +-- authSchema.ts
|       +-- leadSchema.ts      # createLeadSchema, updateLeadSchema
|
+-- cross-cutting/
|   +-- container.ts           # ScopedContainer (DI manual por request)
|   +-- tenantContext.ts       # AsyncLocalStorage para el tenantId activo
|
+-- types/
    +-- express.d.ts           # Extiende Express.Request con req.container y req.user

prisma/
+-- schema.prisma              # Esquema PostgreSQL: Tenant, User, Lead, Contact, Product, Quote, etc.
```

---

## 5. Conceptos Clave Explicados

### 5.1. Multi-Tenancy (Aislamiento por empresa con AsyncLocalStorage)

Cada empresa registrada es un **Tenant**. Todos los tenants comparten la misma base de datos y tablas, pero cada registro contiene la columna `tenantId`.

**Flujo del Tenant en cada Request HTTP:**
1. `createAuthValidateCookie` lee el JWT de la cookie `accessToken`, valida la firma y extrae `userId`, `tenantId` y `role` en `req.user`.
2. `createTenantMiddleware` invoca `TenantContext.run(tenantId, ...)` usando `AsyncLocalStorage` de Node.js.
3. Se crea `req.container = new ScopedContainer(tenantId)`.
4. Los repositorios que heredan de `BasePrismaRepository` inyectan automáticamente `WHERE tenantId = X` en todas las consultas.

```
Request HTTP --> [createAuthValidateCookie] --> req.user (tenantId)
                     |
                     +--> [createTenantMiddleware]
                               |
                               +--> TenantContext.run(tenantId, ...) [AsyncLocalStorage]
                               +--> req.container = new ScopedContainer(tenantId)
```

### 5.2. Inyección de Dependencias (DI) per-Request

`ScopedContainer` (`src/cross-cutting/container.ts`) ensambla las dependencias:
- **Scope Público (sin tenantId):** Para endpoints de registro y login.
- **Scope Autenticado (con tenantId):** Instanciado por `createTenantMiddleware` en cada request autenticado.

### 5.3. Restricciones de Visibilidad por Rol (CRM Leads)

- **`SALES_REP`:** Solo ve leads asignados a él (`assignedToId === userId`). En `getFiltered`, el controller elimina cualquier filtro de `assignedToId` del cliente y fuerza el propio `userId`.
- **`OWNER`, `PARTNER`, `SALES_LEADER`:** Acceso global a todos los leads del tenant.

---

## 6. Modelo de Datos (Base de Datos)

```
Tenant (Empresa)
 +-- User[]                    <- OWNER, PARTNER, SALES_LEADER, SALES_REP
 +-- Lead[]                    <- Oportunidades de venta
 |    +-- LeadStatusHistory[]
 |    +-- Quote[]
 +-- Contact[]
 +-- CompanyContact[]
 |    +-- Contact[]
 +-- Product[]
 |    +-- Formula?
 +-- Quote[]
 |    +-- QuoteItem[]
 +-- Formula[]
 +-- LeadStatusConfig[]
 +-- TenantSettings
 +-- AuditLog[]
```

---

## 7. Endpoints API Implementados

| Método | Ruta | Auth | Descripción | Body / Query |
|---|---|---|---|---|
| `GET` | `/health` | No | Health check | — |
| `POST` | `/api/auth/register` | No | Registrar empresa y usuario OWNER | `{ companyName, ownerEmail, password, ownerFirstName, ownerLastName }` |
| `POST` | `/api/auth/login` | No | Login y emisión de cookie JWT | `{ email, password }` |
| `GET` | `/api/lead/getAll` | Cookie JWT | Lista simple de leads (filtrada por rol) | — |
| `POST` | `/api/lead/create` | Cookie JWT | Crear lead | `{ contactName, companyName?, email?, phone?, statusId?, ... }` |
| `PATCH` | `/api/lead/update/:id` | Cookie JWT | Actualizar lead | `{ companyName?, contactName?, email?, ... }` |
| `GET` | `/api/lead/filtered` | Cookie JWT | Listado paginado y filtrado (motor genérico) | `?search=&filters=[...]&page=1&limit=20` |

---

## 8. Guía para Agregar una Nueva Funcionalidad

1. **Dominio** (`src/domain/entities/`): Entidad con métodos estáticos `create`, `fromPrisma`.
2. **Puertos** (`src/application/ports/`): Interfaz del repositorio y mappers.
3. **DTOs & Mappers** (`src/application/dtos/`, `src/application/mappers/`): Objetos de transferencia y transformación.
4. **Caso de Uso** (`src/application/use-case/`): Lógica de negocio orquestando puertos.
5. **Repositorio** (`src/infrastructure/persistence/repositories/`): Extender `BasePrismaRepository` e implementar el puerto.
6. **Contenedor DI** (`src/cross-cutting/container.ts`): Método en `ScopedContainer` para resolver el caso de uso.
7. **Controller** (`src/infrastructure/web/controllers/`): Manejar `req` y emitir `res`.
8. **Ruta & Schema** (`src/presentation/`): Schema Zod + rutas con `authMiddleware` y `tenantMiddleware`.
9. **Registrar en `app.ts`**: Conectar el router.

---

## 9. Reglas de Dependencia (Qué puede importar qué)

```
OK  domain/         --> NADA externo (solo Node.js nativo)
OK  application/    --> domain/
OK  infrastructure/ --> domain/, application/
OK  presentation/   --> infrastructure/, application/, cross-cutting/
OK  cross-cutting/  --> application/, infrastructure/
OK  config/         --> dotenv, prisma, pg

NO  domain/         --> NO importa application/, infrastructure/, Express, Prisma
NO  application/    --> NO importa infrastructure/ ni Express/Prisma
```

---

## 10. Decisiones Técnicas Relevantes

- **Autenticación vía Cookies HTTP-Only (`accessToken`):** Más seguro que LocalStorage contra XSS.
- **AsyncLocalStorage para Tenant:** Evita pasar `tenantId` manualmente por todas las capas.
- **Driver Adapter Prisma (`@prisma/adapter-pg`):** Pool nativo `pg` para mejor gestión de conexiones.
- **DI per-Request:** `createTenantMiddleware` adjunta `req.container` en cada petición autenticada.
- **Tipado estricto en Express:** `src/types/express.d.ts` extiende `Express.Request`.
- **Motor de Filtrado Genérico:** `GenericListFilteredUseCase<Entity, DTO>` reutilizable. Solo requiere un repositorio filtrable, un mapper y un filterConfig. Ver sección 11.

---

## 11. Motor de Filtrado Genérico

### 11.1. ¿Qué es y para qué sirve?

El motor de filtrado genérico permite a cualquier entidad ofrecer un endpoint con:
- **Filtros por campo** (`statusId equals uuid`, `estimatedValue gte 5000`)
- **Búsqueda global** (texto en múltiples campos)
- **Paginación** (`page`, `limit`)

Se implementa una sola vez y se conecta a entidades nuevas en ~5 pasos. **Lead es la referencia canónica**.

### 11.2. Piezas del Motor (ya existen, no recrear)

| Archivo | Capa | Rol |
|---|---|---|
| `src/application/dtos/FilterCriteriaDTO.ts` | Application | Entrada: `{ filters?, search?, page?, limit? }` |
| `src/application/dtos/PaginatedResultDTO.ts` | Application | Salida: `{ data, total, page, limit }` |
| `src/application/ports/repositories/IFilterableRepository.ts` | Application | Contrato: `findFiltered()` + `countFiltered()` |
| `src/application/ports/services/IFilterFieldConfig.ts` | Application | Contrato: mapa de campos permitidos con operadores |
| `src/application/ports/mappers/IMapper.ts` | Application | Contrato: `toDTO(entity): DTO` |
| `src/application/use-case/filter/GenericListFilteredUseCase.ts` | Application | Motor central genérico |
| `src/infrastructure/persistence/repositories/BasePrismaRepository.ts` | Infrastructure | `buildFilterWhere()`, `buildPagination()`, `tenantWhere()` |

### 11.3. Flujo interno de una petición filtrada

```
GET /api/[entidad]/filtered?search=foo&filters=[...]&page=1&limit=20
         |
         v
[Controller]
  - parsea query params
  - construye FilterCriteriaDTO
  - aplica restricciones de rol si aplica
         |
         v
[GenericListFilteredUseCase.execute(criteria)]
         |
         +---> repository.findFiltered(criteria, filterConfig)
         |              |
         |              +--> buildFilterWhere()
         |                     - Siempre incluye { tenantId }
         |                     - Aplica cada filtro validado contra filterConfig
         |                     - Si hay search: OR sobre campos con searchable:true
         |
         +---> repository.countFiltered(criteria, filterConfig)
         |
         +--> Retorna PaginatedResult<DTO> { data, total, page, limit }
```

**Operadores soportados:** `contains` (texto, case-insensitive), `equals`, `in` (array), `gt`, `gte`, `lt`, `lte`.

### 11.4. Guía paso a paso: conectar una nueva entidad

> Reemplaza `[Entidad]` con el nombre real (ej: `Contact`) y `[entidad]` con minúsculas.

---

#### PASO 1 — Puerto del repositorio debe extender IFilterableRepository

**Archivo:** `src/application/ports/repositories/I[Entidad]Repository.ts`

```typescript
import { IFilterableRepository } from "./IFilterableRepository.js";
import { [Entidad] } from "../../../domain/entities/[Entidad].js";

export interface I[Entidad]Repository extends IFilterableRepository<[Entidad]> {
    findByTenant(): Promise<[Entidad][]>;
    create(entity: [Entidad]): Promise<void>;
    findById(id: string): Promise<[Entidad] | null>;
    // ...otros metodos propios
}
```

**Archivo:** `src/infrastructure/persistence/repositories/Prisma[Entidad]Repository.ts`

Agregar los dos métodos que exige `IFilterableRepository`. Gracias a `BasePrismaRepository`, el codigo es casi identico para todas las entidades:

```typescript
async findFiltered(
    criteria: FilterCriteriaDTO,
    config: IFilterFieldConfig
): Promise<[Entidad][]> {
    const where = this.buildFilterWhere(criteria, config);  // heredado
    const { skip, take } = this.buildPagination(criteria);  // heredado

    const records = await this.prisma.[entidad].findMany({
        where,
        skip,
        take,
        include: { /* relaciones necesarias */ },
    });

    return records.map([Entidad].fromPrisma);
}

async countFiltered(
    criteria: FilterCriteriaDTO,
    config: IFilterFieldConfig
): Promise<number> {
    const where = this.buildFilterWhere(criteria, config);
    return this.prisma.[entidad].count({ where });
}
```

**Referencia real:** `src/infrastructure/persistence/repositories/PrismaLeadRepository.ts` (metodos `findFiltered` y `countFiltered`, lineas 93-119)

---

#### PASO 2 — Crear el FilterConfig de la entidad

**Archivo a crear:** `src/infrastructure/persistence/filters/[entidad]FilterConfig.ts`

Define que campos son filtrables y que operadores acepta cada uno. Los campos no declarados son rechazados automaticamente por el motor.

```typescript
import { IFilterFieldConfig } from "@/application/ports/services/IFilterFieldConfig.js";

export const [entidad]FilterConfig: IFilterFieldConfig = {
    // Campos de texto -> 'contains' (parcial) o 'equals' (exacto)
    name: {
        allowedOperators: ["contains", "equals"],
        searchable: true,   // true = se incluye en busqueda global (?search=texto)
    },
    email: {
        allowedOperators: ["contains", "equals"],
        searchable: true,
    },
    // Campos de ID/relacion -> 'equals' (uno) o 'in' (varios)
    statusId: {
        allowedOperators: ["equals", "in"],
        searchable: false,
    },
    // Campos numericos o fechas -> comparadores
    createdAt: {
        allowedOperators: ["equals", "gt", "gte", "lt", "lte"],
        searchable: false,
    },
    // Agrega todos los campos filtrables del modelo Prisma
};
```

**Referencia real:** `src/infrastructure/persistence/filters/leadFilterConfig.ts`

**Reglas importantes:**
- `searchable: true` = ese campo aparece en el OR cuando el cliente manda `?search=texto`.
- Operadores no listados en `allowedOperators` lanzan error 400 automaticamente.
- Campos no declarados en el config lanzan error 400 automaticamente.

---

#### PASO 3 — Crear el type alias del caso de uso

**Archivo a crear:** `src/application/use-case/[entidades]/listFiltered[Entidades]UseCase.ts`

No se escribe logica nueva. Solo un type alias que especializa el generico con los tipos de la entidad:

```typescript
import { GenericListFilteredUseCase } from "../filter/GenericListFilteredUseCase.js";
import { [Entidad] } from "@/domain/entities/[Entidad].js";
import { [Entidad]DTO } from "@/application/dtos/[Entidad]DTO.js";

export type ListFiltered[Entidades]UseCase = GenericListFilteredUseCase<[Entidad], [Entidad]DTO>;
```

**Referencia real:** `src/application/use-case/leads/listFilteredLeadsUseCase.ts`

---

#### PASO 4 — Registrar en el contenedor de DI

**Archivo:** `src/cross-cutting/container.ts`

Agregar el metodo en `ScopedContainer`:

```typescript
import { GenericListFilteredUseCase } from "@/application/use-case/filter/GenericListFilteredUseCase.js";
import { [entidad]FilterConfig } from "@/infrastructure/persistence/filters/[entidad]FilterConfig.js";
import { ListFiltered[Entidades]UseCase } from "@/application/use-case/[entidades]/listFiltered[Entidades]UseCase.js";

// Dentro de la clase ScopedContainer:
getListFiltered[Entidades]UseCase(): ListFiltered[Entidades]UseCase {
    const repo = new Prisma[Entidad]Repository(this.prisma, this.tenantContext);
    const mapper = new [Entidad]Mapper();
    return new GenericListFilteredUseCase(repo, mapper, [entidad]FilterConfig);
}
```

**Referencia real:** `src/cross-cutting/container.ts` metodo `getListFilteredLeadsUseCase` (lineas 68-72)

---

#### PASO 5 — Controller y Ruta

**En el controller** (`src/infrastructure/web/controllers/[entidad]Controllers.ts`):

```typescript
import { ListFiltered[Entidades]UseCase } from "@/application/use-case/[entidades]/listFiltered[Entidades]UseCase.js";
import { FilterCriteriaDTO } from "@/application/dtos/FilterCriteriaDTO.js";

export class [entidad]Controller {
    constructor(
        // ...otros casos de uso...
        private readonly listFiltered[Entidades]UseCase: ListFiltered[Entidades]UseCase,
    ) {}

    getFiltered = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { search, page, limit } = req.query;
            const filtersRaw = req.query.filters as string | undefined;

            let filters: Array<{ field: string; operator: string; value: unknown }> = [];
            if (filtersRaw) {
                try {
                    const parsed = JSON.parse(filtersRaw);
                    filters = Array.isArray(parsed) ? parsed : [];
                } catch {
                    return res.status(400).json({ error: 'Invalid filters format' });
                }
            }

            const criteria: FilterCriteriaDTO = {
                filters,
                search: search as string | undefined,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            };

            // Aplicar restricciones de rol si la entidad lo requiere
            // Ver leadControllers.ts getFiltered() como referencia para SALES_REP

            const result = await this.listFiltered[Entidades]UseCase.execute(criteria);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };
}
```

**En las rutas** (`src/presentation/routes/[entidad]Routes.ts`):

```typescript
// En la funcion que instancia el controller:
const listFilteredUseCase = req.container!.getListFiltered[Entidades]UseCase();
return new [entidad]Controller(/* otros casos de uso */, listFilteredUseCase);

// Registrar la ruta:
router.get('/filtered', authMiddleware, tenantMiddleware, (req, res, next) => {
    get[Entidad]Controller(req).getFiltered(req, res, next);
});
```

**Referencia real:** `src/infrastructure/web/controllers/leadControllers.ts` y `src/presentation/routes/leadRoutes.ts`

---

### 11.5. Checklist de archivos por entidad nueva

| Accion | Archivo |
|---|---|
| Modificar | `src/application/ports/repositories/I[Entidad]Repository.ts` — extender `IFilterableRepository` |
| Modificar | `src/infrastructure/persistence/repositories/Prisma[Entidad]Repository.ts` — `findFiltered()` y `countFiltered()` |
| Crear | `src/infrastructure/persistence/filters/[entidad]FilterConfig.ts` |
| Crear | `src/application/use-case/[entidades]/listFiltered[Entidades]UseCase.ts` |
| Modificar | `src/cross-cutting/container.ts` — `getListFiltered[Entidades]UseCase()` |
| Modificar | `src/infrastructure/web/controllers/[entidad]Controllers.ts` — inyectar use case + `getFiltered()` |
| Modificar | `src/presentation/routes/[entidad]Routes.ts` — resolver use case + ruta `GET /filtered` |

### 11.6. Formato de la peticion HTTP para el cliente

```
GET /api/lead/filtered?search=john&page=1&limit=20&filters=[{"field":"statusId","operator":"equals","value":"uuid-xxx"},{"field":"estimatedValue","operator":"gte","value":5000}]
```

- `search`: texto libre, busca en campos con `searchable: true` del filterConfig.
- `filters`: JSON string. Array de `{ field, operator, value }`. Validados contra filterConfig.
- `page`: numero de pagina (default: 1).
- `limit`: registros por pagina (default: 20, max: 100).

**Respuesta estandarizada:**
```json
{
  "data": [ ...DTOs ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

---

## 12. Decisiones de Diseño del Motor de Filtrado

- **Whitelist de campos y operadores:** El motor rechaza cualquier campo o combinacion campo+operador no declarada en el filterConfig. Previene acceso a columnas internas y filtros no autorizados.
- **Tenant siempre incluido:** `buildFilterWhere()` en `BasePrismaRepository` inyecta `{ tenantId }` como primera condicion, siempre, sin importar los filtros del cliente. Es imposible filtrar datos de otro tenant.
- **Restricciones de rol en el controller, no en el use case:** La logica "SALES_REP solo ve sus leads" vive en el controller porque depende de `req.user` (concepto HTTP). El caso de uso generico permanece puro y sin conocimiento de roles.
- **Type alias en lugar de subclase:** `ListFilteredLeadsUseCase` es un `type`, no una clase. Evita codigo repetido y expresa que la especializacion es solo de tipos, no de comportamiento.
