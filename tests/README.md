# Tests de QuotesFlow

Guía para personas e IAs. Léela antes de escribir o tocar un test.
Reglas de fondo: R1 (tests obligatorios), R2 (tests insaltables) y R5 (aislamiento por tenant) de `PLAN.md`.

## Cómo ejecutarlos

```bash
pnpm test               # todo: unit + integration + api + build
pnpm test:unit          # solo unitarios (no necesita Docker, ~1 s)
pnpm test:integration   # repositorios contra PostgreSQL real
pnpm test:api           # API completa con supertest
pnpm test:build         # compila como `pnpm build` y arranca el servidor compilado (no necesita Docker)
pnpm test:coverage      # todo + cobertura; falla bajo el umbral
pnpm test:watch         # unitarios en modo observación
pnpm typecheck:tests    # tipos de tests/ y de lo que importan de src/
```

Un solo archivo o un solo test:

```bash
pnpm exec vitest run tests/api/leads.test.ts
pnpm exec vitest run -t "SALES_REP no puede"
```

**Requisito:** `integration` y `api` necesitan Docker en marcha. No usan la base de datos del `.env` ni el contenedor `saas_db`: levantan su propio PostgreSQL efímero y lo destruyen al terminar.

## Estructura

```
vitest.config.ts               cuatro proyectos (unit, integration, api, build), alias y umbrales de cobertura
tests/
  setup/                       arranque: entorno, contenedor de PostgreSQL, base de datos por archivo
  support/
    builders/                  entidades de dominio listas para usar (tests unitarios)
    doubles/                   dobles en memoria de los puertos de application/ports
    database/                  fábricas que escriben en la base de datos y utilidades de limpieza
    http/                      rutas de la API, cookie de sesión, inventario de rutas
    knownDefect.ts             `itKnownDefect`: defectos conocidos pendientes de corregir
  fixtures/architecture/       mini proyecto con violaciones de capas a propósito (lo usa unit/tooling)
  unit/                        dominio, casos de uso, mappers, esquemas Zod, middleware, motor de filtrado, configuración de entorno
    tooling/                   reglas propias de calidad: lint (código comentado), arquitectura (R4) y comprobación de R3 de la CI
  integration/                 repositorios Prisma y esquema, contra PostgreSQL real
  build/                       build de producción y arranque del servidor compilado
  api/                         endpoints de extremo a extremo
    security/                  inventario de rutas, autenticación, aislamiento por tenant, roles, endurecimiento
```

| Proyecto | Qué prueba | Con qué | Qué NO usa |
|---|---|---|---|
| `unit` | Reglas de negocio de `domain` y `application`, y piezas puras de infraestructura | Dobles en memoria y constructores de entidades | Base de datos, red, Express |
| `integration` | Que cada repositorio lee y escribe bien, filtra por tenant y por borrado | PostgreSQL real con las migraciones de `prisma/migrations` | Express |
| `api` | Lo que ve un cliente: códigos, cuerpos, cookies, permisos | La aplicación real (`src/app.ts`) + PostgreSQL real | Dobles |
| `build` | Que el build de producción compila, reescribe el alias `@/` y el servidor compilado arranca (H20) | `tsc` + `tsc-alias` en `node_modules/.cache/production-build-test` | Base de datos |

## Cómo funciona la base de datos de test

1. `setup/databaseContainer.globalSetup.ts` arranca **un** contenedor `postgres:15`, regenera el cliente de Prisma y aplica `prisma migrate deploy` sobre una base plantilla. Una migración rota hace fallar toda la ejecución.
2. `setup/database.setup.ts` crea, para **cada archivo de test**, una base propia copiando la plantilla y apunta `DATABASE_URL` a ella antes de que se cargue `src/`.
3. Antes de **cada test** se vacían todas las tablas. Ningún test depende de datos de otro.

Consecuencias: los archivos corren en paralelo sin pisarse, y no hay que limpiar nada a mano.
`support/database/testDatabase.ts` se niega a vaciar una base cuyo nombre no empiece por `test_`.

Otra imagen de PostgreSQL: variable `TEST_POSTGRES_IMAGE` (por ejemplo `postgres:17`).

## Cómo escribir un test

Convenciones (regla R11 y R13):
- Títulos de `describe` e `it` en **español**, describiendo la regla de negocio, no la implementación. Identificadores en inglés.
- Estructura preparar / ejecutar / comprobar, separada por líneas en blanco.
- Sin números ni cadenas mágicas: constantes con nombre. Sin `any`.
- Imports con alias: `@/` es `src/`, `@tests/` es `tests/`. Terminan en `.js`, igual que en `src/`.
- Un test prueba una regla. Si necesita un "y" en el título, probablemente son dos tests.

### Unitario (caso de uso)

```ts
const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
const leadRepository = new InMemoryLeadRepository(tenantContext);
leadRepository.seed(buildLead({ assignedToId: salesRep.id }));

const useCase = new GetLeadsUseCase(leadRepository, new LeadMapper());
```

- Entidades: `buildLead`, `buildUser`, `buildLeadStatusConfig`, `buildContact`, `buildCompanyContact`, `buildTenant` (`support/builders/entityBuilders.ts`). Declara solo lo que le importa al test.
- Dobles: `InMemory*Repository`, `FakeHashService`, `FakeAuthTokenService`, `FixedTenantContext` (`support/doubles/`). Los repositorios en memoria respetan tenant y borrado igual que los reales; `seed()` carga datos y `findStoredById()` / `listStored()` leen lo guardado sin filtros.
- Los `findFiltered` en memoria **no interpretan filtros**: solo paginan. El motor de filtrado se prueba en `unit/infrastructure/filterEngine.test.ts` y contra PostgreSQL en `integration/`.

### Integración (repositorio)

```ts
const company = await persistTenantWithTeam();
const repository = new PrismaLeadRepository(prisma, new FixedTenantContext(company.tenant.id));
```

- Datos: `persistTenant`, `persistUser`, `persistLead`, `persistLeadStatus`, `persistContact`, `persistCompanyContact` y `persistTenantWithTeam` (una empresa con un usuario por rol, un segundo comercial y los cinco estados por defecto), en `support/database/persistenceFactories.ts`.
- Todo repositorio nuevo prueba como mínimo: guardar y leer, no ver registros de otro tenant, no ver borrados, y que escribir sobre un registro de otro tenant falla y lo deja intacto.

### API

```ts
const company = await persistTenantWithTeam();

const response = await request(app)
  .post(apiPaths.leads.create)
  .set('Cookie', sessionCookieFor(company.salesRep))
  .send({ contactName: 'Ana Gómez' });
```

- Rutas: siempre desde `apiPaths` (`support/http/apiRoutes.ts`), nunca escritas a mano. Así un cambio de rutas (D-06, `/api/v1`) se corrige en un solo archivo.
- Sesión: `sessionCookieFor(usuario)` firma una cookie válida sin pasar por el login.
- Además de la respuesta, comprueba el estado en la base de datos con `prisma` cuando la petición debía (o no debía) escribir.
- **Límite de peticiones:** `src/app.ts` admite 100 peticiones cada 15 minutos por IP. Cada archivo de test recibe una aplicación nueva con el contador en cero, pero **un archivo no puede pasar de 100 peticiones**. Si te acercas, divide el archivo.

## Al añadir un endpoint o una entidad

Lista obligatoria (el inventario de rutas hace fallar la suite si olvidas el primer punto):

1. Declarar la ruta en `apiPaths` y en `routeInventory` (`support/http/apiRoutes.ts`). Con eso entra sola en `api/security/authentication.test.ts` (401 sin sesión, token falsificado).
2. Declarar su escenario en `support/http/routeSecurityScenarios.ts`: la acción de `permissionMatrix` que la autoriza, el recurso y la operación (`list`, `create`, `update`, `delete`). Sin escenario, `api/security/routeCoverageTenantIsolation.test.ts` falla (F1-T05). Con él, la ruta entra sola en las dos suites de cobertura: aislamiento entre empresas y permisos de cada rol según la matriz.
3. Si tiene reglas de negocio propias por tenant o por rol (qué campos se ignoran, qué ve cada uno), añadir esos casos concretos a `api/security/tenantIsolation.test.ts` y `api/security/roles.test.ts`.
   Cada archivo de API admite como mucho 100 peticiones (limitador global) y 50 a `/api/auth` (en los tests `RATE_LIMIT_AUTH_MAX_REQUESTS=50`, fijado en `setup/testEnvironment.setup.ts`); por eso la suite de permisos por rol se reparte en grupos de recursos (`ROLE_COVERAGE_GROUPS` en `support/http/rolePermissionCoverage.ts`), un archivo por grupo: `routeCoverageRoles.test.ts` (leads y estados) y `routeCoverageRolesContacts.test.ts` (contactos y empresas cliente). Un recurso nuevo va a un grupo; si un archivo se acerca a 100 peticiones, se crea otro grupo.
4. Puerto nuevo en `application/ports`: su doble en `support/doubles/`.
5. Entidad nueva: su constructor en `entityBuilders.ts` y su fábrica en `persistenceFactories.ts`.
6. Tests unitarios del caso de uso, de integración del repositorio y de API del endpoint (R1).

## Defectos conocidos (`itKnownDefect`)

Algunos tests describen el comportamiento **correcto** de algo que hoy está mal (hallazgos de la sección 4 de `PLAN.md`). No están omitidos: se ejecutan siempre y Vitest los cuenta como `expected fail` mientras el defecto exista.

**Cuando corrijas un defecto**, su test empezará a fallar con "expected to fail but passed". En ese mismo PR cambia `itKnownDefect('H3', '...', ...)` por `it('...', ...)`: pasa a ser el test de regresión. No lo borres.

Para ver por qué falla hoy cada uno:

```bash
SHOW_KNOWN_DEFECTS=1 pnpm test                       # bash
$env:SHOW_KNOWN_DEFECTS = '1'; pnpm test             # PowerShell
```

No uses `itKnownDefect` para esquivar un test que no consigues hacer pasar. Solo vale para un hallazgo registrado en `PLAN.md` o en una auditoría, y hay que añadirlo a esta tabla.

Corregidos y convertidos en regresión: H5 (13 tests, F1-T02), la parte de H11 del campo no permitido (1 test, F1-T02), H4 y H14 (1 test cada uno, F1-T06), H15 (1 test, F1-T10), H3 (3 tests) y la parte de leads de H9 (1 test), F1-T13; H10 (3 tests) y la parte de contactos de H9 (1 test), F1-T16.

| Hallazgo | Comportamiento esperado | Tests | Dónde |
|---|---|---|---|
| H2 | Un usuario desactivado o con el rol cambiado pierde los permisos de su token ya emitido | 2 | `api/security/authentication.test.ts`, `api/security/roles.test.ts` |
| H7 | Contraseña mínima de 12 caracteres (D-11) | 1 | `unit/presentation/schemas.test.ts` |
| H11 | Un filtro con un valor de tipo incorrecto responde 400 (el campo no permitido ya responde 400 desde F1-T02) | 1 | `api/leads.test.ts` |
| F1-T14 | Si falla crear un estado predeterminado (orden repetido), la empresa conserva su predeterminado anterior. Hoy se queda sin ninguno | 1 | `api/leadStatusConfig.test.ts` |

## Cobertura

Umbrales de la decisión D-03, en `vitest.config.ts`: 80 % global y 90 % en `src/domain` y `src/application`.
Solo tienen sentido con los tres proyectos a la vez (`pnpm test:coverage`); con `--project unit` no se alcanzan.
Prohibido bajarlos o activar `thresholds.autoUpdate` (R2). Si un cambio baja la cobertura, faltan tests.

## Qué no hacer (R2)

- `.skip`, `.only`, `.todo`, comentar un test o borrar uno que estorba. ESLint lo bloquea (`pnpm lint`) y en `tests/` no admite comentarios `eslint-disable`.
- Debilitar una aserción para que pase. Si un test existente debe cambiar, el PR lo declara y un humano lo aprueba.
- Importar algo de `src/` en los archivos de `tests/setup/` de forma estática: se cargaría antes de fijar el entorno y los tests podrían apuntar a la base de desarrollo.
- Tocar la base de datos desde un test unitario. `unit.setup.ts` apunta `DATABASE_URL` a una dirección inalcanzable a propósito.
- Depender del orden de ejecución o de datos que dejó otro test.

## Problemas frecuentes

| Síntoma | Causa y arreglo |
|---|---|
| `Could not start the PostgreSQL test container` | Docker no está en marcha. |
| `Cannot find module '.prisma/client/default'` en unitarios | Falta generar el cliente: `pnpm prisma generate` (los proyectos con base de datos lo generan solos). |
| `expected to fail but passed` | Corregiste un defecto conocido: convierte su `itKnownDefect` en `it` (ver arriba). |
| Un test de API recibe 429 | El archivo superó las 100 peticiones del límite global: divídelo. |
| `pnpm typecheck:tests` marca un error en `src/` | Es un error de tipos real de `src/`; ver "Deuda" en `CONTEXT.md`. |
