# CONTEXT.md — QuotesFlow (SaaS Comerciales)

> **¿Qué es este archivo?** Una guía completa para que cualquier persona (o IA) entienda el proyecto sin tener que leer cada archivo. Si eres nuevo en el equipo o una IA procesando este repositorio, empieza aquí.

---

## 1. ¿Qué es este proyecto?

Un **backend API REST** para un **SaaS multi-tenant de gestión comercial** (CRM + cotizaciones). Cada empresa (tenant) que se registra obtiene su propio espacio aislado de datos dentro de la misma base de datos.

**Funcionalidades principales planeadas:**
- Registro de empresas y usuarios (autenticación)
- Gestión de leads/oportunidades de venta
- Contactos (personas y empresas)
- Productos con precios fijos o calculados por fórmulas matemáticas
- Cotizaciones con ítems y generación de PDF
- Auditoría de acciones
- Mensajería (preparado, aún no implementado)

**Estado actual:** Fase temprana. Solo está implementado el flujo de **registro de empresa + usuario owner**. Las carpetas de leads, messaging, pricing existen pero están vacías.

---

## 2. Stack Tecnológico (explicado simple)

| Tecnología | ¿Qué es? | ¿Para qué se usa aquí? |
|---|---|---|
| **TypeScript** | JavaScript con tipos. Te dice si usas mal un dato antes de ejecutar. | Todo el código fuente |
| **Node.js 20** | El motor que permite correr JavaScript/TypeScript fuera del navegador. | Entorno de ejecución del servidor |
| **Express 5** | Un framework web. Piensa en él como el "recepcionista" que recibe peticiones HTTP y las dirige al código correcto. | Rutas, middlewares, servidor HTTP |
| **Prisma 7** | Un ORM (traductor entre código TypeScript y SQL). Escribes código TS y Prisma lo convierte en consultas SQL. | Acceso a base de datos, migraciones, esquema |
| **PostgreSQL 15** | Base de datos relacional. Almacena toda la información de forma permanente. | Almacenamiento persistente |
| **Zod** | Validador de datos. Verifica que lo que envía el usuario tiene la forma correcta (email válido, campo no vacío, etc.) | Validación de request bodies |
| **bcryptjs** | Librería de hashing. Convierte contraseñas en textos irreversibles para guardarlas de forma segura. | Hash de contraseñas |
| **jsonwebtoken** | Genera y verifica tokens JWT. Son como "pases de acceso" que el usuario recibe al autenticarse. | Autenticación (preparado, no implementado aún) |
| **helmet** | Añade headers HTTP de seguridad automáticamente. | Seguridad HTTP |
| **cors** | Controla qué dominios pueden hacer peticiones al backend. | Seguridad cross-origin |
| **express-rate-limit** | Limita cuántas peticiones puede hacer un cliente en un tiempo dado (100 cada 15 min). | Protección contra abuso |
| **winston** | Logger profesional. Registra eventos con niveles (info, warn, error). | Logging (preparado) |
| **mathjs** | Motor de evaluación de expresiones matemáticas. | Cálculo de fórmulas de precios de productos |
| **pdf-lib** | Genera archivos PDF desde código. | Generación de cotizaciones en PDF |
| **nodemailer** | Envía correos electrónicos. | Envío de cotizaciones por email (preparado) |
| **multer** | Maneja subida de archivos (logos, adjuntos). | Upload de archivos (preparado) |
| **node-cron** | Programa tareas en intervalos (cada hora, cada día, etc.). | Tareas programadas (preparado) |
| **Docker** | Empaqueta la app y la BD en contenedores aislados y reproducibles. | Desarrollo local y despliegue |
| **pnpm** | Gestor de paquetes (como npm pero más rápido y eficiente en espacio). | Instalación de dependencias |

---

## 3. Arquitectura: Clean Architecture / Hexagonal

### 3.1. ¿Por qué esta arquitectura?

El código está organizado en **capas con responsabilidades separadas**. La regla de oro es:

> **Las capas internas NUNCA conocen a las externas.** El dominio no sabe que existe Express, Prisma, ni ninguna librería. Solo sabe de sus propias reglas de negocio.

Esto permite:
- Cambiar la base de datos sin tocar la lógica de negocio
- Cambiar el framework web sin tocar nada más
- Testear la lógica de negocio sin necesitar una base de datos real

### 3.2. Las Capas (de adentro hacia afuera)

```
┌─────────────────────────────────────────────────────────────────────┐
│  PRESENTATION (routes/)           ← Define URLs y conecta todo     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  INFRASTRUCTURE                ← Implementaciones reales     │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  APPLICATION                ← Casos de uso + contratos  │  │  │
│  │  │  ┌───────────────────────────────────────────────────┐  │  │  │
│  │  │  │  DOMAIN                  ← Reglas de negocio puras │  │  │  │
│  │  │  └───────────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  CROSS-CUTTING                    ← Utilidades transversales       │
│  CONFIG                           ← Variables de entorno y BD      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Estructura de Carpetas (con responsabilidades)

```
src/
├── server.ts                  # Punto de entrada. Arranca Express en el puerto configurado.
├── app.ts                     # Configura Express: middlewares, seguridad y rutas.
│
├── config/                    # ⚙️ CONFIGURACIÓN
│   ├── env.ts                 # Lee variables de entorno (.env) y las exporta tipadas.
│   └── database.ts            # Crea la conexión a PostgreSQL vía Prisma + pg Pool.
│
├── domain/                    # 🧠 DOMINIO — Reglas de negocio puras (NO depende de nada externo)
│   ├── entities/              # Objetos principales del negocio
│   │   ├── User.ts            # Entidad Usuario (id, email, passwordHash, role, tenantId...)
│   │   └── Tenant.ts          # Entidad Empresa/Tenant (id, name, logoUrl, settings)
│   ├── enums/                 # Valores fijos del negocio
│   │   └── Role.ts            # Roles: OWNER, PARTNER, SALES_LEADER, SALES_REP
│   └── value-objects/         # (Vacío) Para objetos inmutables como Email, Money, etc.
│
├── application/               # 📋 APLICACIÓN — Orquesta el negocio, define contratos
│   ├── dtos/                  # Data Transfer Objects (la "forma" de los datos que entran/salen)
│   │   └── RegisterCompanyDTO.ts  # Datos para registrar empresa: companyName, ownerEmail, password...
│   ├── ports/                 # CONTRATOS (interfaces) — "qué necesito, pero no cómo se hace"
│   │   ├── repositories/      # Contratos de acceso a datos
│   │   │   ├── IUserRepository.ts     # create(), findByEmail(), findById()
│   │   │   └── ITenantRepository.ts   # create(), findById()
│   │   ├── services/          # Contratos de servicios técnicos
│   │   │   ├── IHashService.ts        # hash(), compare() — para contraseñas
│   │   │   └── ITenantContext.ts      # getTenantId() — saber qué empresa está activa
│   │   └── messaging/         # (Vacío) Contratos de mensajería futura
│   └── use-case/              # CASOS DE USO — La lógica de cada operación del negocio
│       ├── auth/
│       │   └── RegisterCompanyAndOwnerUseCase.ts  # Registra empresa + usuario owner
│       ├── leads/             # (Vacío) Futuros CU de leads
│       ├── messaging/         # (Vacío) Futuros CU de mensajería
│       └── pricing/           # (Vacío) Futuros CU de cotizaciones/fórmulas
│
├── infrastructure/            # 🔧 INFRAESTRUCTURA — Implementaciones concretas
│   ├── persistence/           # Todo lo relacionado con la base de datos
│   │   ├── prisma/
│   │   │   └── PrismaService.ts           # Singleton que gestiona la instancia de PrismaClient
│   │   ├── repositories/                  # Implementaciones reales de los contratos (ports)
│   │   │   ├── BasePrismaRepository.ts    # Clase base: filtra automáticamente por tenantId
│   │   │   ├── PrismaUserRepository.ts    # Implementa IUserRepository con Prisma
│   │   │   └── PrismaTenantRepository.ts  # Implementa ITenantRepository con Prisma
│   │   └── mappers/           # (Vacío) Para convertir entre modelos de Prisma y entidades de dominio
│   ├── services/              # Implementaciones de servicios técnicos
│   │   └── BcryptHashService.ts   # Implementa IHashService usando bcryptjs
│   ├── web/                   # Capa HTTP de infraestructura
│   │   ├── controllers/
│   │   │   └── AuthControllers.ts     # Recibe HTTP request → llama al use case → devuelve HTTP response
│   │   └── middleware/
│   │       └── validateBody.ts        # Middleware genérico: valida req.body con un schema Zod
│   └── messaging/             # (Vacío) Futura infraestructura de email/WhatsApp
│
├── presentation/              # 🌐 PRESENTACIÓN — Define las rutas HTTP (URLs)
│   └── routes/
│       └── authRoutes.ts      # POST /api/auth/register — conecta schema Zod + controller
│
└── cross-cutting/             # 🔀 CROSS-CUTTING — Utilidades que cruzan todas las capas
    ├── container.ts           # Contenedor de Inyección de Dependencias (DI manual)
    └── tenantContext.ts       # Almacena el tenantId activo por request usando AsyncLocalStorage

prisma/
└── schema.prisma              # Esquema de la base de datos (todas las tablas y relaciones)
```

---

## 5. Conceptos Clave Explicados

### 5.1. Multi-Tenancy (Aislamiento por empresa)

Cada empresa que se registra es un **Tenant**. Todos los tenants comparten la **misma base de datos y las mismas tablas**, pero cada registro tiene un campo `tenantId` que indica a qué empresa pertenece.

```
┌──────────────────── Tabla users ────────────────────┐
│ id │ email          │ tenantId  │ role      │ ...   │
│ 1  │ ana@acme.com   │ tenant_A  │ OWNER     │       │  ← Empresa Acme
│ 2  │ bob@acme.com   │ tenant_A  │ SALES_REP │       │  ← Empresa Acme
│ 3  │ carlos@xyz.com │ tenant_B  │ OWNER     │       │  ← Empresa XYZ
└─────────────────────────────────────────────────────┘
```

**¿Cómo se filtra?** El `BasePrismaRepository` tiene métodos helper (`tenantWhere()`, `withTenant()`, `validateTenant()`) que inyectan automáticamente el filtro `WHERE tenantId = X` en cada consulta. Así un usuario de Acme **nunca** puede ver datos de XYZ.

**¿Cómo se sabe qué tenant está activo?** Usando `AsyncLocalStorage` (API nativa de Node.js). Al principio de cada petición HTTP se establece el `tenantId` en un almacenamiento por request. Los repositorios lo leen a través de la interfaz `ITenantContext`.

### 5.2. Inyección de Dependencias (DI) Manual

En vez de importar directamente `PrismaUserRepository` en los casos de uso, el código usa **interfaces** (contratos). Un caso de uso pide "dame algo que sepa crear usuarios" (`IUserRepository`), y el `ScopedContainer` le entrega la implementación concreta (`PrismaUserRepository`).

```
Caso de uso dice:  "Necesito un IUserRepository"
Container dice:    "Aquí tienes un PrismaUserRepository"
```

**¿Por qué?** Porque mañana puedes cambiar a MongoDB y solo cambias lo que el Container entrega, sin tocar los casos de uso.

El `ScopedContainer` se crea por tipo de contexto:
- **Sin tenantId**: Para operaciones públicas (registro, login)
- **Con tenantId**: Para operaciones dentro de una empresa autenticada

### 5.3. Ports & Adapters (Puertos y Adaptadores)

- **Port (Puerto):** Una interfaz en `application/ports/`. Es el "contrato" que dice QUÉ se necesita pero no CÓMO.
  - Ejemplo: `IHashService` → "necesito poder hashear y comparar passwords"
- **Adapter (Adaptador):** Una clase en `infrastructure/` que IMPLEMENTA ese contrato.
  - Ejemplo: `BcryptHashService` → "yo lo hago usando la librería bcryptjs"

### 5.4. Entidades de Dominio vs Modelos de Prisma

Son cosas **diferentes** aunque se parecen:

| Concepto | Ubicación | Propósito |
|---|---|---|
| **Entidad de Dominio** | `domain/entities/User.ts` | Clase TS pura con reglas de negocio. No sabe que Prisma existe. Tiene un `static create()` que genera IDs. |
| **Modelo de Prisma** | `prisma/schema.prisma` (modelo `User`) | Define la estructura de la tabla en la BD. Prisma genera tipos automáticos desde aquí. |
| **Mapper** | `infrastructure/persistence/mappers/` (vacío por ahora) | Convierte entre uno y otro. Actualmente la conversión se hace inline en los repositorios (`toDomain()`). |

### 5.5. Flujo de Datos de una Petición

Ejemplo: `POST /api/auth/register`

```
1. CLIENTE envía JSON → { companyName, ownerEmail, password, ownerFirstName, ownerLastName }
       │
2. EXPRESS recibe en app.ts → pasa por helmet, cors, json parser, rate limit
       │
3. ROUTER (presentation/routes/authRoutes.ts)
   → validateBody(registerSchema)           ← Zod valida el body
   → controller.register                    ← Pasa al controller
       │
4. CONTROLLER (infrastructure/web/controllers/AuthControllers.ts)
   → Llama a registerUseCase.execute(req.body)
       │
5. USE CASE (application/use-case/auth/RegisterCompanyAndOwnerUseCase.ts)
   → Verifica que el email no exista         ← via IUserRepository
   → Crea la entidad Tenant                 ← Tenant.create()
   → Hashea el password                     ← via IHashService
   → Crea la entidad User (como OWNER)      ← User.create()
   → Persiste Tenant y User                 ← via ITenantRepository e IUserRepository
   → Retorna { tenantId, ownerId }
       │
6. CONTROLLER recibe el resultado → res.status(201).json(result)
       │
7. CLIENTE recibe → { tenantId: "abc123", ownerId: "def456" }
```

---

## 6. Modelo de Datos (Base de Datos)

### 6.1. Diagrama de Relaciones

```
Tenant (Empresa)
 ├── User[]                    ← Usuarios de la empresa
 ├── Lead[]                    ← Oportunidades de venta
 │    ├── LeadStatusHistory[]  ← Historial de cambios de estado
 │    └── Quote[]              ← Cotizaciones vinculadas
 ├── Contact[]                 ← Contactos persona
 ├── CompanyContact[]          ← Contactos empresa
 │    └── Contact[]            ← Personas de esa empresa
 ├── Product[]                 ← Productos/servicios
 │    └── Formula?             ← Fórmula de precio opcional
 ├── Quote[]                   ← Cotizaciones
 │    └── QuoteItem[]          ← Ítems de la cotización
 ├── Formula[]                 ← Fórmulas matemáticas
 ├── LeadStatusConfig[]        ← Estados de leads personalizables
 ├── TenantSettings            ← Configuración (estrategia de asignación)
 └── AuditLog[]                ← Registro de auditoría
```

### 6.2. Enums en BD

| Enum | Valores | Uso |
|---|---|---|
| `Role` | OWNER, PARTNER, SALES_LEADER, SALES_REP | Rol del usuario dentro de la empresa |
| `LeadAssignmentStrategy` | MANUAL, ROUND_ROBIN, LOAD_BALANCED | Cómo se asignan leads a vendedores |
| `QuoteStatus` | DRAFT, SENT, ACCEPTED, REJECTED | Estado de una cotización |

### 6.3. Tablas principales

| Tabla | Descripción | Campos clave |
|---|---|---|
| `Tenant` | Empresa registrada | name, logoUrl, settings (JSON) |
| `User` | Usuario del sistema | email (unique), passwordHash, role, tenantId |
| `Lead` | Oportunidad de venta | companyName, contactName, statusId, assignedToId, estimatedValue |
| `LeadStatusConfig` | Estados de leads personalizables por tenant | name, color (hex), order, isDefault |
| `Contact` | Persona de contacto | firstName, lastName, email, phone, companyId |
| `CompanyContact` | Empresa de contacto | name, industry, taxNumber, address... |
| `Product` | Producto/servicio a vender | name, basePrice, formulaId |
| `Formula` | Fórmula matemática para precios dinámicos | expression, variables (JSON array) |
| `Quote` | Cotización | status, total, discount, leadId, contactId |
| `QuoteItem` | Línea de una cotización | productId, quantity, variables (JSON), unitPrice, total |
| `TenantSettings` | Configuración del tenant | leadAssignmentStrategy |
| `AuditLog` | Registro de acciones | action, entity, entityId, metadata (JSON) |

---

## 7. Cómo Ejecutar el Proyecto

### Requisitos previos
- Docker y Docker Compose instalados
- (Opcional) Node.js 20+ y pnpm para desarrollo sin Docker

### Con Docker (recomendado)
```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Levantar todo (PostgreSQL + Backend)
docker-compose up --build

# La API estará en http://localhost:4000
# La BD PostgreSQL estará en localhost:5433
```

### Sin Docker (desarrollo local)
```bash
# 1. Copiar variables de entorno y configurar DATABASE_URL apuntando a tu PostgreSQL
cp .env.example .env

# 2. Instalar dependencias
pnpm install

# 3. Generar cliente Prisma
pnpm prisma:generate

# 4. Ejecutar migraciones
pnpm prisma:migrate

# 5. Iniciar en modo desarrollo (hot reload)
pnpm dev
```

### Comandos útiles
| Comando | Qué hace |
|---|---|
| `pnpm dev` | Arranca con nodemon + tsx (hot reload) |
| `pnpm build` | Compila TypeScript a JavaScript (dist/) |
| `pnpm start` | Ejecuta la versión compilada |
| `pnpm prisma:generate` | Regenera el cliente Prisma desde el schema |
| `pnpm prisma:migrate` | Crea/aplica migraciones de BD |
| `pnpm prisma:studio` | Abre GUI web para explorar la BD |

---

## 8. Variables de Entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Connection string de PostgreSQL | `postgresql://user:pass@localhost:5432/saas?schema=public` |
| `JWT_SECRET` | Clave secreta para firmar tokens JWT | `una-clave-secreta-muy-larga` |
| `JWT_EXPIRATION` | Duración del token JWT | `7d` |
| `PORT` | Puerto del servidor Express | `4000` |
| `NODE_ENV` | Entorno de ejecución | `development` / `production` |

---

## 9. Endpoints API Implementados

| Método | Ruta | Descripción | Body esperado |
|---|---|---|---|
| `GET` | `/health` | Health check | — |
| `POST` | `/api/auth/register` | Registrar empresa + usuario owner | `{ companyName, ownerEmail, password, ownerFirstName, ownerLastName }` |

---

## 10. Guía para Agregar una Nueva Funcionalidad

Supongamos que quieres agregar "Crear un Lead". Estos son los pasos **en orden**:

### Paso 1 — Dominio
Crear la entidad `src/domain/entities/Lead.ts` con su `static create()`.

### Paso 2 — Puerto (contrato)
Crear `src/application/ports/repositories/ILeadRepository.ts` con los métodos necesarios (create, findById, etc.).

### Paso 3 — DTO
Crear `src/application/dtos/CreateLeadDTO.ts` con la forma de los datos de entrada.

### Paso 4 — Caso de uso
Crear `src/application/use-case/leads/CreateLeadUseCase.ts`. Recibe interfaces en el constructor, nunca implementaciones.

### Paso 5 — Repositorio
Crear `src/infrastructure/persistence/repositories/PrismaLeadRepository.ts`. Extiende `BasePrismaRepository` e implementa `ILeadRepository`.

### Paso 6 — Controller
Crear `src/infrastructure/web/controllers/LeadController.ts`. Recibe el use case y maneja req/res.

### Paso 7 — Container
Agregar un método en `src/cross-cutting/container.ts` para construir el use case con sus dependencias.

### Paso 8 — Ruta
Crear `src/presentation/routes/leadRoutes.ts` con el schema Zod de validación y conectar controller.

### Paso 9 — Registrar en app.ts
Agregar `app.use('/api/leads', leadRouter(container))` en `src/app.ts`.

---

## 11. Reglas de Dependencia (Qué puede importar qué)

```
✅ domain/         → NADA externo (solo Node.js nativo como crypto)
✅ application/    → domain/
✅ infrastructure/ → domain/, application/
✅ presentation/   → infrastructure/, application/, cross-cutting/
✅ cross-cutting/  → application/, infrastructure/ (ensambla todo)
✅ config/         → Librerías externas (dotenv, prisma, pg)

❌ domain/         → NO puede importar application/, infrastructure/, ni librerías externas
❌ application/    → NO puede importar infrastructure/ ni librerías externas
❌ Nadie           → NO debe importar directamente de cross-cutting/ excepto presentation/ y app.ts
```

---

## 12. Patrones de Diseño en Uso

| Patrón | Dónde | Qué hace |
|---|---|---|
| **Singleton** | `PrismaService` | Garantiza una sola instancia de PrismaClient en toda la app |
| **Repository** | `PrismaUserRepository`, `PrismaTenantRepository` | Encapsula el acceso a datos detrás de una interfaz |
| **Factory Method** | `User.create()`, `Tenant.create()` | Crea entidades con ID auto-generado sin exponer el constructor completo |
| **Dependency Injection** | `ScopedContainer` | Construye objetos inyectando sus dependencias por constructor |
| **Ports & Adapters** | `IHashService` → `BcryptHashService` | Separa contrato de implementación |
| **Middleware** | `validateBody()` | Intercepta peticiones para validar datos antes de llegar al controller |
| **Scoped Container** | `ScopedContainer` | Crea un conjunto de dependencias con contexto (con/sin tenant) |

---

## 13. Decisiones Técnicas Relevantes

- **Prisma con driver adapter (`@prisma/adapter-pg`):** Se usa un pool de pg nativo en vez del driver por defecto de Prisma, lo que da más control sobre conexiones.
- **IDs tipo CUID:** Generados por Prisma (`@default(cuid())`), pero las entidades de dominio usan `crypto.randomUUID()` (UUIDv4). Esto podría necesitar alinearse en el futuro.
- **ESM (ES Modules):** El proyecto usa `"type": "module"` y todas las importaciones llevan extensión `.js` (requerido por NodeNext).
- **Sin framework de DI:** La inyección de dependencias es manual (sin librerías como tsyringe o inversify). El `ScopedContainer` hace ese trabajo explícitamente.
- **Validación en capa de presentación:** Los schemas Zod se definen en las rutas (`presentation/routes/`), no en los DTOs. Así la validación HTTP queda separada de la lógica de negocio.
