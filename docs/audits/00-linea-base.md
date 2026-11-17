# Auditoría de línea base de seguridad (F0-T10)

| Campo | Valor |
|---|---|
| Alcance | Todo `src/`, `prisma/`, `Dockerfile`, `docker-compose.yml`, `package.json` |
| Código auditado | `develop` en `a0b4587` (antes de F0) y ramas `feat/F0-*` hasta `feat/F0-T06-github-actions-ci` |
| Fecha | 2026-11-16 |
| Autor | Opus (Claude Code) |
| Marcos | OWASP Top 10:2025 (A01–A10), OWASP API Security Top 10:2023 (API1–API10) |
| Estado | **Pendiente de firma humana** (R10) |

## 1. Metodología

1. Lectura del código: auth, middleware, casos de uso, repositorios, configuración, esquema de Prisma e imagen Docker.
2. Comprobación ejecutable: la suite de F0-T02 deja cada hallazgo de código como test `itKnownDefect`, que hoy falla porque el defecto existe y fallará el día que se corrija (`tests/README.md`).
3. Herramientas: `pnpm audit`, `gitleaks` 8.30.1 sobre todo el historial (46 commits, sin secretos), ESLint con `eslint-plugin-security`, `dependency-cruiser` (capas) y prueba de la imagen de producción contra PostgreSQL.

Severidad: **crítica** (explotable sin autenticación con impacto entre tenants o total), **alta** (compromete cuentas, datos de otro tenant o el despliegue), **media** (requiere condiciones o agrava otro fallo), **baja** (endurecimiento o higiene).

## 2. Hallazgos

Estado: **abierto**, **resuelto en F0** (pendiente de merge) o **riesgo aceptado**.

| # | Hallazgo | Archivo | OWASP | Severidad | Tarea | Estado | Evidencia |
|---|---|---|---|---|---|---|---|
| H1 | `JWT_SECRET` cae a `'default-secret'` si falta la variable: cualquiera podría firmar tokens válidos de cualquier tenant | `src/config/env.ts` | A04, A02 | Alta | F1-T01 | Abierto. En `docker-compose.yml` ya no hay valor por defecto (F0-T08) | Lectura de código |
| H2 | `jwt.verify` sin algoritmo fijo; token de 7 días sin revocación ni logout; rol congelado en el token | `src/infrastructure/services/JwtTokenService.ts` | A07 | Alta | F2-T02 | Abierto | 2 tests `itKnownDefect('H2')` |
| H3 | El login no comprueba `isActive` ni `deleted` del usuario ni del tenant | `src/application/use-case/auth/LoginUseCase.ts` | A07, A01 | Alta | F1-T13 | Abierto | 3 tests en `api/auth.test.ts` |
| H4 | `cors()` sin lista blanca de orígenes | `src/app.ts` | A02 | Media | F1-T06 | Abierto. La cookie `SameSite=Strict` y `cors()` sin `credentials` limitan el impacto | 1 test en `api/security/hardening.test.ts` |
| H5 | Sin manejador global de errores: "no encontrado" o "sin permiso" responden 500; en desarrollo se ve la traza | `src/app.ts` | A10 | Media | F1-T02 | Abierto | 13 tests |
| H6 | Solo un límite global (100/15 min, en memoria por proceso); sin límite propio de login ni bloqueo; `trust proxy` sin configurar | `src/app.ts` | A07, API4 | Alta | F1-T06, F2-T03 | Abierto. Con varias instancias cada una cuenta por separado | Lectura de código |
| H7 | Contraseña mínima de 6 caracteres; sin verificación de correo ni recuperación | `src/presentation/schemas/authSchema.ts` | A07 | Media | F2-T03, F2-T04 | Abierto | 1 test en `unit/presentation/schemas.test.ts` |
| H8 | Registro no transaccional (tenant, usuario y 5 estados en escrituras separadas); revela si un correo existe | `RegisterCompanyAndOwnerUseCase.ts` | A10, A08 | Media | F1-T03 | Abierto | Lectura de código |
| H9 | Reasignar un lead acepta un `assignedToId` de otro tenant; un contacto acepta un `companyId` de otro tenant | `updateLeadUseCase.ts`, `use-case/contacts/` | A01, API1 | Alta | F1-T13, F1-T16 | Abierto | 2 tests |
| H10 | `findById` de contactos y empresas ignora `deleted`; no existe borrado | `PrismaContactRepository.ts`, `PrismaCompanyContactRepository.ts` | A01 | Media | F1-T16 | Abierto | 3 tests |
| H11 | `filters[].value` llega a Prisma sin tipo; errores de filtro responden 500 | `BasePrismaRepository.ts`, controllers | A05, A10, API8 | Media | F1-T12 | Abierto | 2 tests |
| H12 | Autorización dispersa en `if (role === …)` entre casos de uso y controllers | varios | A01, API5 | Media | F1-T04 | Abierto | Lectura de código |
| H13 | Sin logging estructurado ni auditoría (`AuditLog` sin escribir) | — | A09 | Media | F1-T07 | Abierto | Lectura de código |
| H14 | `express.json({ limit: '10mb' })` | `src/app.ts` | API4 | Baja | F1-T06 | Abierto | 1 test |
| H15 | `QuoteItem` y `LeadStatusHistory` no tienen `tenantId` | `prisma/schema.prisma` | A01 | Media | F1-T10 | Abierto. Hoy nada escribe en esas tablas | 1 test en `integration/schema/databaseSchema.test.ts` |
| H16 | Imagen Docker única de desarrollo, como root, pnpm sin fijar, sin `--frozen-lockfile` | `Dockerfile` | A02, A03 | Media | F0-T08 | **Resuelto en F0** | `Dockerfile` multi-etapa, usuario `node`; job `docker-image` |
| H17 | Node 20 sin soporte | `Dockerfile` | A03 | Media | F0-T08 | **Resuelto en F0** | Node 24.18.0 fijado por digest (D-04) |
| H18 | Sin tests, lint, CI ni escaneo de dependencias y secretos | — | A03 | Alta | F0-T02 a F0-T06 | **Resuelto en F0**, salvo lo que hace un humano: protección de ramas y Dependabot/Renovate | 483 tests, ESLint, hooks, `.github/workflows/ci.yml` |
| H19 | Dependencias instaladas sin uso | `package.json` | A03 | Baja | F0-T09 | **Resuelto en F0** | Fuera `nodemailer`, `node-cron`, `http-status-codes` |
| H20 | `pnpm build` roto y alias `@/` sin reescribir en `dist/` | `tsconfig.json` | — | Alta | F0-T07 | **Resuelto en F0** | Proyecto de tests `build` |
| H21 | Dinero convertido a `number` | `src/domain/entities/Lead.ts` | A06 | Media | F3-T01 | Abierto | Lectura de código |
| H22 | **Nuevo.** El login responde sin ejecutar bcrypt cuando el correo no existe: por el tiempo de respuesta se sabe qué correos están registrados | `LoginUseCase.ts` | A07 | Media | F2-T03 | Abierto | Lectura de código (`findByEmail` devuelve antes de `compare`) |
| H23 | **Nuevo.** La cookie `accessToken` caduca siempre a los 7 días (`maxAge` fijo), aunque `JWT_EXPIRATION` diga otra cosa | `AuthControllers.ts` | A07 | Baja | F2-T02 | Abierto | Lectura de código |
| H24 | **Nuevo.** `validateBody` usa `error: any`: un error que no sea de Zod responde 400 con `{ errors: undefined }` en lugar de pasar al manejador de errores | `validateBody.ts` | A10 | Baja | F1-T02 | Abierto | Lectura de código; congelado en `eslint-suppressions.json` |
| H25 | **Nuevo.** En `NODE_ENV=development` Prisma registra cada consulta (`log: ['query', …]`); si alguien arranca así fuera de local, los registros incluyen consultas con datos de clientes | `src/config/database.ts` | A09 | Baja | F1-T07 | Abierto | Lectura de código |
| H26 | **Nuevo.** Dos avisos moderados solo de desarrollo: `glob` 10.5.0 y `minimatch` 5.1.9/9.0.9, vía `@testcontainers/postgresql` → `archiver` 7 | `pnpm-lock.yaml` | A03 | Baja | Revisar al actualizar testcontainers | **Riesgo aceptado**: no llegan a producción (`pnpm audit --prod` limpio) y la CI falla desde severidad alta | `pnpm audit` |

## 3. Resumen

| Severidad | Abiertos | Resueltos en F0 | Aceptados |
|---|---|---|---|
| Crítica | 0 | 0 | 0 |
| Alta | 5 (H1, H2, H3, H6, H9) | 2 (H18, H20) | 0 |
| Media | 11 (H4, H5, H7, H8, H10, H11, H12, H13, H15, H21, H22) | 2 (H16, H17) | 0 |
| Baja | 4 (H14, H23, H24, H25) | 1 (H19) | 1 (H26) |

H18 cuenta como resuelto en lo técnico y abierto en lo que depende de un humano.

Ninguno es crítico porque H1 solo se explota si se despliega sin `JWT_SECRET`. Aun así, F1-T01 debe ser la primera tarea de F1.
Antes de F0, `pnpm audit` daba 94 avisos (1 crítico, `proxy-addr`). Tras F0-T09, producción queda sin avisos.

## 4. Orden recomendado en F1

1. F1-T01 (H1) y F1-T02 (H5, H24): son la base del resto de correcciones.
2. F1-T13 y F1-T16 (H3, H9, H10): aislamiento entre tenants y cuentas desactivadas.
3. F1-T06 (H4, H6, H14) y F1-T04 (H12).
4. F1-T03, F1-T07, F1-T10, F1-T12.

Cada corrección convierte su `itKnownDefect` en `it` (test de regresión, R1).

## 5. Firma

`Aprobado por KoryCarreraDev el 15-11-2026`
