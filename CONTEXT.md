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
- ✅ Módulo de Leads: Dominio (`Lead`), DTOs, Mappers (`LeadMapper`), Puertos, Casos de Uso (`GetLeadsUseCase`, `CreateLeadUseCase`, `UpdateLeadUseCase`), Repositorio Prisma (`PrismaLeadRepository`), Controller y Rutas (`/api/lead/*`).
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
┌─────────────────────────────────────────────────────────────────────┐
│  PRESENTATION (routes/, schemas/)  ← Define URLs y validación Zod   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  INFRASTRUCTURE (web/, persistence/, services/)              │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  APPLICATION (use-case/, dtos/, ports/, mappers/)        │  │  │
│  │  │  ┌───────────────────────────────────────────────────┐  │  │  │
│  │  │  │  DOMAIN (entities/, enums/, value-objects/)      │  │  │  │
│  │  │  └───────────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  CROSS-CUTTING (container.ts, tenantContext.ts)  ← Ensamblaje / DI │
│  CONFIG (env.ts, database.ts)                   ← Configuración BD  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Estructura de Carpetas (con responsabilidades)

```
src/
├── server.ts                  # Punto de entrada. Arranca el servidor Express en el puerto configurado.
├── app.ts                     # Configura middlewares globales (helmet, cors, compression, cookieParser, rateLimit) y rutas.
│
├── config/                    # ⚙️ CONFIGURACIÓN
│   ├── env.ts                 # Variables de entorno tipadas (.env).
│   └── database.ts            # Conexión PostgreSQL vía Prisma + pg Pool (@prisma/adapter-pg).
│
├── domain/                    # 🧠 DOMINIO — Reglas de negocio puras
│   ├── entities/              # Entidades del negocio con métodos de fábrica (create, update, fromPrisma)
│   │   ├── User.ts            # Entidad Usuario
│   │   ├── Tenant.ts          # Entidad Empresa / Tenant
│   │   └── Lead.ts            # Entidad Oportunidad / Lead
│   ├── enums/                 # Enums del negocio
│   │   └── Role.ts            # Roles: OWNER, PARTNER, SALES_LEADER, SALES_REP
│   └── value-objects/         # Objetos de valor inmutables (ej. Email, Money)
│
├── application/               # 📋 APLICACIÓN — Casos de uso, DTOs, Mappers y Puertos
│   ├── dtos/                  # Data Transfer Objects
│   │   ├── RegisterCompanyDTO.ts
│   │   ├── LoginDTO.ts
│   │   ├── CreateLeadDTO.ts
│   │   ├── UpdateLeadDTO.ts
│   │   └── LeadDTO.ts
│   ├── mappers/               # Transformadores de dominio a DTOs de respuesta
│   │   └── LeadMapper.ts      # Convierte entidad Lead en LeadDTO
│   ├── ports/                 # Interfaces (Contratos)
│   │   ├── repositories/      # IUserRepository, ITenantRepository, ILeadRepository
│   │   ├── services/          # IHashService, IAuthTokenService, ITenantContext
│   │   └── mappers/           # ILeadMapper
│   └── use-case/              # Lógica orquestadora de negocio
│       ├── auth/
│       │   ├── RegisterCompanyAndOwnerUseCase.ts
│       │   └── LoginUseCase.ts
│       └── leads/
│           ├── createLeadUseCase.ts
│           ├── getLeadsUseCase.ts
│           └── updateLeadUseCase.ts
│
├── infrastructure/            # 🔧 INFRAESTRUCTURA — Implementaciones concretas
│   ├── persistence/           # Base de datos y repositorios
│   │   ├── prisma/
│   │   │   └── PrismaService.ts           # Singleton de PrismaClient
│   │   └── repositories/
│   │       ├── BasePrismaRepository.ts    # Inyección de filtro per-tenant (tenantWhere)
│   │       ├── PrismaUserRepository.ts
│   │       ├── PrismaTenantRepository.ts
│   │       └── PrismaLeadRepository.ts
│   ├── services/              # Servicios de infraestructura
│   │   ├── BcryptHashService.ts           # Implementa IHashService con bcryptjs
│   │   └── JwtTokenService.ts              # Implementa IAuthTokenService con jsonwebtoken
│   └── web/                   # Controladores HTTP y Middlewares Express
│       ├── controllers/
│       │   ├── AuthControllers.ts
│       │   └── leadControllers.ts
│       └── middleware/
│           ├── validateBody.ts            # Middleware genérico de validación Zod
│           ├── createAuthValidateCookie.ts# Extracción y verificación de JWT desde cookie HTTP
│           └── createTenantMiddleware.ts  # Inyección de TenantContext y ScopedContainer per-request
│
├── presentation/              # 🌐 PRESENTACIÓN — Rutas y Schemas Zod
│   ├── routes/
│   │   ├── authRoutes.ts      # POST /api/auth/register, POST /api/auth/login
│   │   └── leadRoutes.ts      # GET /api/lead/getAll, POST /api/lead/create
│   └── schemas/
│       ├── authSchema.ts      # registerSchema, loginSchema
│       └── leadSchema.ts      # createLeadSchema
│
├── cross-cutting/             # 🔀 CROSS-CUTTING — Inyección de Dependencias y Contexto Async
│   ├── container.ts           # ScopedContainer (DI manual por request / scope)
│   └── tenantContext.ts       # AsyncLocalStorage para propagar el tenantId activo por petición
│
└── types/                     # 📝 DECLARACIONES DE TIPOS
    └── express.d.ts           # Extensión de Express.Request con req.container y req.user

prisma/
└── schema.prisma              # Esquema completo de PostgreSQL con Prisma (Tenant, User, Lead, Contact, Product, Quote, etc.)
```

---

## 5. Conceptos Clave Explicados

### 5.1. Multi-Tenancy (Aislamiento por empresa con AsyncLocalStorage)

Cada empresa registrada es un **Tenant**. Todos los tenants comparten la misma base de datos y tablas, pero cada registro contiene la columna `tenantId`.

**¿Cómo funciona la propagación del Tenant en cada Request HTTP?**
1. **Autenticación:** `createAuthValidateCookie` lee el JWT de la cookie `accessToken`, valida la firma y extrae `userId`, `tenantId` y `role`, inyectándolos en `req.user`.
2. **Contexto:** `createTenantMiddleware` lee `req.user.tenantId` e invoca `TenantContext.run(tenantId, ...)` usando `AsyncLocalStorage` de Node.js.
3. **Contenedor Scoped:** En el mismo middleware se crea un `req.container = new ScopedContainer(tenantId)`.
4. **Filtro Automático en Repositorios:** Los repositorios que heredan de `BasePrismaRepository` usan el método `tenantWhere()`, el cual consulta a `ITenantContext` para inyectar automáticamente `WHERE tenantId = X` en las consultas de Prisma.

```
Request HTTP ──> [createAuthValidateCookie] ──> Extrae req.user (tenantId)
                     │
                     └──> [createTenantMiddleware]
                              │
                              ├──> TenantContext.run(tenantId, ...) [AsyncLocalStorage]
                              └──> req.container = new ScopedContainer(tenantId)
```

### 5.2. Inyección de Dependencias (DI) per-Request

El sistema utiliza `ScopedContainer` (`src/cross-cutting/container.ts`) para ensamblar las dependencias:
- **Scope Público (sin tenantId):** Utilizado para endpoints públicos como registro y login.
- **Scope Autenticado (con tenantId):** Instanciado en cada request por `createTenantMiddleware`, garantizando que los Casos de Uso y Repositorios operen dentro del contexto del tenant activo.

### 5.3. Restricciones de Visibilidad por Rol (CRM Leads)

En el caso de uso de Leads (`GetLeadsUseCase` y `CreateLeadUseCase`), se aplican reglas de negocio según el rol del usuario:
- **`SALES_REP` (Vendedor):** Solo puede ver y gestionar los leads que le hayan sido asignados (`assignedToId === userId`).
- **`OWNER`, `PARTNER`, `SALES_LEADER`:** Tienen acceso global a todos los leads pertenecientes a su `tenantId`.

---

## 6. Modelo de Datos (Base de Datos)

### 6.1. Diagrama de Relaciones

```
Tenant (Empresa)
 ├── User[]                    ← Usuarios de la empresa (OWNER, PARTNER, SALES_LEADER, SALES_REP)
 ├── Lead[]                    ← Oportunidades de venta (CRM)
 │    ├── LeadStatusHistory[]  ← Historial de cambios de estado
 │    └── Quote[]              ← Cotizaciones vinculadas
 ├── Contact[]                 ← Contactos persona
 ├── CompanyContact[]          ← Contactos empresa
 │    └── Contact[]            ← Personas pertenecientes a esa empresa
 ├── Product[]                 ← Productos/servicios
 │    └── Formula?             ← Fórmula matemática opcional
 ├── Quote[]                   ← Cotizaciones
 │    └── QuoteItem[]          ← Ítems de cotización
 ├── Formula[]                 ← Fórmulas de cálculo de precio
 ├── LeadStatusConfig[]        ← Estados de leads personalizables
 ├── TenantSettings            ← Configuración (estrategia de asignación de leads)
 └── AuditLog[]                ← Registro de auditoría
```

---

## 7. Endpoints API Implementados

| Método | Ruta | Autenticación | Descripción | Body / Params esperados |
|---|---|---|---|---|
| `GET` | `/health` | No | Health check de la API | — |
| `POST` | `/api/auth/register` | No | Registrar nueva empresa y usuario OWNER | `{ companyName, ownerEmail, password, ownerFirstName, ownerLastName }` |
| `POST` | `/api/auth/login` | No | Autenticar usuario y setear cookie `accessToken` | `{ email, password }` |
| `GET` | `/api/lead/getAll` | Cookie JWT | Obtener lista de leads del tenant (filtrado por rol) | — |
| `POST` | `/api/lead/create` | Cookie JWT | Crear nuevo lead en el tenant activo | `{ companyName?, contactName?, email?, phone?, statusId?, source?, assignedToId?, estimatedValue?, expectedCloseDate?, notes? }` |

---

## 8. Guía para Agregar una Nueva Funcionalidad

Pasos para implementar una nueva entidad/caso de uso en la arquitectura Clean:

1. **Dominio (`src/domain/entities/`):** Definir la entidad con constructor y métodos estáticos (`create`, `fromPrisma`).
2. **Puertos (`src/application/ports/`):** Definir la interfaz del repositorio (`IRepository`) y mappers si aplica.
3. **DTOs & Mappers (`src/application/dtos/` y `src/application/mappers/`):** Crear los objetos de transferencia de datos y mappers.
4. **Caso de Uso (`src/application/use-case/`):** Implementar la lógica de negocio orquestando los puertos inyectados.
5. **Repositorio (`src/infrastructure/persistence/repositories/`):** Extender de `BasePrismaRepository` e implementar el puerto de repositorio.
6. **Contenedor DI (`src/cross-cutting/container.ts`):** Añadir el método en `ScopedContainer` para resolver el caso de uso con sus dependencias.
7. **Controller (`src/infrastructure/web/controllers/`):** Manejar la recepción de `req` y emisión de `res`.
8. **Ruta & Schema (`src/presentation/`):** Crear el schema Zod en `schemas/`, definir las rutas en `routes/` aplicando `authMiddleware` y `tenantMiddleware`.
9. **Registrar en `app.ts`:** Conectar el router a la aplicación principal.

---

## 9. Reglas de Dependencia (Qué puede importar qué)

```
✅ domain/         → NADA externo (solo Node.js nativo como crypto)
✅ application/    → domain/
✅ infrastructure/ → domain/, application/
✅ presentation/   → infrastructure/, application/, cross-cutting/
✅ cross-cutting/  → application/, infrastructure/
✅ config/         → dotenv, prisma, pg

❌ domain/         → NO puede importar application/, infrastructure/, ni Express/Prisma
❌ application/    → NO puede importar infrastructure/ ni Express/Prisma
```

---

## 10. Decisiones Técnicas Relevantes

- **Autenticación vía Cookies HTTP-Only (`accessToken`):** Mayor seguridad contra ataques XSS en comparación con LocalStorage.
- **Inyección de Tenant con AsyncLocalStorage (`TenantContext`):** Evita pasar explícitamente el `tenantId` en cada capa de la aplicación.
- **Driver Adapter Prisma (`@prisma/adapter-pg`):** Uso de pool nativo `pg` para mejor rendimiento y gestión de conexiones PostgreSQL.
- **Inyección de Dependencias per-Request:** `createTenantMiddleware` adjunta `req.container` en cada petición HTTP autenticada.
- **Tipado estricto en Express:** Extensión de `Express.Request` mediante `src/types/express.d.ts`.
