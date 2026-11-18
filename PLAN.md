# PLAN.md — QuotesFlow: de base actual a MVP

> **Estado: F2 fusionada el 2026-11-17 (PR #45 a #55), pendiente de firma de `docs/audits/F2-seguridad.md` y de la matriz de permisos. F3 lista para empezar: D-20 a D-26 respondidas; sus detalles abiertos están en `QUESTION.md` (Q-015 a Q-020), ninguno bloquea F3-T01 a F3-T04.** Las tareas hechas se marcan aquí y quedan pendientes de PR y revisión humana hasta su merge.
> Este archivo es la fuente de verdad del trabajo pendiente. `CONTEXT.md` es la fuente de verdad de lo ya hecho. `QUESTION.md` recoge las dudas de los modelos.

## 0. Contexto

QuotesFlow es un backend multi-tenant (Express 5 + Prisma 7 + PostgreSQL, arquitectura hexagonal). Hoy tiene auth básica, leads, estados de lead, contactos y un motor de filtrado. No tiene tests, CI, manejo de errores, logging ni auditoría, y arrastra fallos de seguridad (sección 4). Faltan los módulos que lo hacen vendible: cotizaciones, suscripciones, panel de administración, correos, integración con Siigo, cartera y analíticas.

Objetivo: llegar a un MVP seguro (OWASP), testeado y mantenible, desarrollado por modelos (Opus y Sonnet) bajo supervisión y aprobación humana.

Alcance acordado: **solo backend** (la API entrega datos listos para graficar y archivos descargables; el frontend se planea aparte). Orden funcional: **cotizaciones primero**. Cartera: la factura de Siigo pertenece al comercial responsable del cliente en QuotesFlow, emparejando el documento/NIT del cliente con el de Siigo.

---

## 1. Reglas inviolables

| # | Regla |
|---|---|
| R1 | **Tests obligatorios.** Ninguna tarea se considera hecha sin tests unitarios (dominio y casos de uso), de integración (repositorios contra PostgreSQL real) y de API (supertest). Todo bug corregido lleva test de regresión. |
| R2 | **Tests insaltables.** Prohibido `.skip`, `.only`, `--no-verify`, bajar umbrales de cobertura o borrar/debilitar un test para que pase. Lo bloquean lint, hook de pre-push y CI. Si un test existente debe cambiar, el PR lo declara y un humano lo aprueba expresamente. |
| R3 | **CONTEXT.md se actualiza solo con cambios confirmados y testeados.** Cada PR que toque `src/` o `prisma/` incluye la actualización de `CONTEXT.md` (estado, endpoints, reglas, deuda y una línea en "Registro de cambios": fecha, ID de tarea, PR). El merge humano es la confirmación. CI falla si falta. Lo planeado nunca va a `CONTEXT.md`; va aquí. |
| R4 | **Arquitectura hexagonal.** `domain` no importa nada externo; `application` solo importa `domain`; toda librería o servicio externo entra por un puerto en `application/ports` con adaptador en `infrastructure`. Lo verifica `dependency-cruiser` en CI. |
| R5 | **Aislamiento por tenant.** Toda consulta filtra por `tenantId` y `deleted`. Todo endpoint nuevo entra en la matriz de tests de aislamiento (recurso de otro tenant → 404) y en la matriz de roles. |
| R6 | **Humanos aprueban.** Los modelos no hacen merge, no hacen push a `develop`/`main`, no ejecutan migraciones en producción, no manejan secretos reales y no toman decisiones abiertas de la sección 9. |
| R7 | **Decisiones abiertas bloquean.** Si una tarea depende de una decisión sin marcar, el modelo se detiene, lo anota en `QUESTION.md` y toma otra tarea no bloqueada. |
| R8 | **Seguridad por defecto.** Entrada validada con Zod en el borde, salida por DTO (nunca la entidad Prisma), dinero con decimales exactos (nunca `number`), SQL crudo solo con plantillas parametrizadas (`$queryRaw`, nunca `$queryRawUnsafe`), secretos solo por variables de entorno. |
| R9 | **PRs pequeños.** Una tarea = una rama `feat/F<fase>-T<nn>-descripcion` = un PR contra `develop`. El nombre de la rama va en inglés (R11). |
| R10 | **Auditoría por fase.** Ninguna fase se cierra sin su informe de seguridad en `docs/audits/` firmado por un humano. |
| R11 | **Idioma.** La documentación va en español: archivos `.md`, `docs/`, descripciones de OpenAPI, comentarios del código y JSDoc, mensajes de commit, títulos y descripciones de PR (Q-002). Todo lo demás va en inglés: nombres de ramas, variables, funciones, clases, archivos, carpetas, rutas, campos de base de datos, códigos y mensajes de error, logs. El contenido que lee el cliente final (correos, PDF, notificaciones) va en español. |
| R12 | **Documentación obligatoria.** Cada módulo entrega `docs/modulos/<modulo>.md` (propósito, reglas de negocio, endpoints, ejemplos de petición y respuesta) en el mismo PR. Puertos, casos de uso y entidades llevan JSDoc. Sin documentación no hay merge. |
| R13 | **Código autodocumentado obligatorio.** Nombres completos, obvios y sin abreviaturas ni genéricos (`data`, `tmp`, `leadmap`, `rolUser`). Funciones cortas con un solo propósito y un nombre que dice qué hacen. Sin números ni cadenas mágicas: constantes con nombre o enums. Sin `any`. Los comentarios explican el porqué (regla de negocio, decisión de seguridad, caso límite), nunca repiten lo que el código ya dice. Prohibido dejar código comentado. Lo verifican lint y la revisión. |
| R14 | **Las dudas van a `QUESTION.md`.** Un modelo con una duda o pregunta no supone ni inventa: la escribe en `QUESTION.md` con el formato de ese archivo y sigue con otra tarea si la duda bloquea. Las preguntas no se borran; se responden en las rondas de dudas. |
| R15 | **Versionamiento con git y github.** Todos los cambios confirmados y testeados se suben a github segun su rama, se realiza un push (Todos los push son pequeños por seguridad y facilidad de validación humana), todo será revisado por humanos si y solo si pasan todos los test unitarios. (En comentario del commit agregar el por qué y para qué del codigo adjunto al commit) |

---

## 2. Responsables

**Humanos** (pueden ser la misma persona):
- **Dueño de producto:** marca las decisiones de la sección 9, fija precios y prioridades.
- **Revisor técnico:** revisa y aprueba cada PR, hace el merge, firma la puerta de cada fase.
- **Responsable de seguridad:** firma los informes de auditoría y la matriz de permisos.
- **Operaciones:** secretos, DNS, cuenta de Resend, credenciales de Siigo, migraciones y despliegues en producción, backups.

**Modelos:**
- **Opus `[O]`:** tareas sensibles (auth, autorización, aislamiento, transacciones, evaluador de fórmulas, facturación, sincronización con Siigo, auditorías) y revisión del código escrito por Sonnet.
- **Sonnet `[S]`:** módulos CRUD que siguen el patrón, DTOs, mappers, tests, documentación.

**Flujo por tarea:**
1. Leer `CONTEXT.md` y la fase correspondiente de este plan.
2. Escribir primero los tests de la tarea (deben fallar).
3. Implementar hasta que pasen typecheck, lint, tests y cobertura.
4. Revisión cruzada por el otro modelo (`/code-review` y `/security-review`).
5. Actualizar `CONTEXT.md`, la documentación del módulo y marcar la tarea en `PLAN.md` dentro del mismo PR.
6. Revisión y merge humanos.

En cualquier paso: si surge una duda, se anota en `QUESTION.md` (R14).

**Rondas de dudas y auditoría.** Cada cierto tiempo el humano abre una ronda con un modelo:
1. Recorrer las preguntas abiertas de `QUESTION.md`, responderlas y pasar a este plan las que resulten ser decisiones.
2. Auditar lo fusionado desde la ronda anterior contra R1 a R15: tests, capas, aislamiento, idioma, nombres, documentación, versionamiento y `CONTEXT.md`.
3. Dejar el resultado en `docs/audits/ronda-<fecha>.md` y convertir cada hallazgo en una tarea de este plan.

---

## 3. Puerta de cierre de cada fase

- [ ] Todas las tareas de la fase con PR aprobado y fusionado por un humano
- [ ] CI en verde; cobertura dentro del umbral
- [ ] Matrices de aislamiento y de roles actualizadas y en verde
- [ ] Informe `docs/audits/F<n>-seguridad.md` (OWASP Top 10:2025 + OWASP API Top 10:2023 sobre el diff de la fase) firmado
- [ ] `CONTEXT.md` refleja el estado real
- [ ] Documentación en español de cada módulo de la fase entregada (R12)
- [ ] `QUESTION.md` sin preguntas bloqueantes abiertas de la fase
- [ ] Firma: `Aprobado por ______ el ____-__-__`

---

## 4. Auditoría inicial (hallazgos sobre el código actual)

Formalizada en `docs/audits/00-linea-base.md` (F0-T10), con severidad, estado y evidencia de cada hallazgo. H22 a H26 salieron de esa auditoría.

| # | Hallazgo | Archivo | OWASP 2025 | Fase |
|---|---|---|---|---|
| H1 | `JWT_SECRET` cae a `'default-secret'` si falta la variable | `src/config/env.ts` | A04, A02 | F1 |
| H2 | `jwt.verify` sin algoritmo fijo; token de 7 días sin revocación ni logout; el rol queda congelado en el token | `src/infrastructure/services/JwtTokenService.ts` | A07 | F2 |
| H3 | Login no comprueba `isActive` ni `deleted` del usuario o del tenant | `src/application/use-case/auth/LoginUseCase.ts` | A07, A01 | F1 |
| H4 | `cors()` abierto a cualquier origen | `src/app.ts` | A02 | F1 |
| H5 | Sin manejador global de errores: todo error es 500 y puede filtrar stack trace | `src/app.ts` | A10 | F1 |
| H6 | Solo límite global 100/15 min; sin límite propio de login ni bloqueo; `trust proxy` sin configurar | `src/app.ts` | A07 | F1 |
| H7 | Contraseña mínima de 6; sin verificación de correo ni recuperación | `src/presentation/schemas/authSchema.ts` | A07 | F2 |
| H8 | Registro no transaccional (tenant, usuario y 5 estados en escrituras separadas); revela si un correo existe | `RegisterCompanyAndOwnerUseCase.ts` | A10, A08 | F1 |
| H9 | `UpdateLeadUseCase` acepta `assignedToId` sin validar que el usuario sea del tenant; contactos aceptan `companyId` sin validarlo | `updateLeadUseCase.ts`, `use-case/contacts/` | A01 | F1 |
| H10 | `findById` de contactos y empresas ignora `deleted`; no existe borrado | `PrismaContactRepository.ts`, `PrismaCompanyContactRepository.ts` | A01 | F1 |
| H11 | `filters[].value` sin tipo llega a Prisma; errores de filtro son 500 | `BasePrismaRepository.ts`, controllers | A05, A10 | F1 |
| H12 | Autorización dispersa en `if (role === …)` entre casos de uso y controllers | varios | A01 | F1 |
| H13 | Sin logging ni auditoría (`winston` sin usar, `AuditLog` sin escribir) | — | A09 | F1 |
| H14 | `express.json({ limit: '10mb' })` | `src/app.ts` | API4 | F1 |
| H15 | `QuoteItem` y `LeadStatusHistory` no tienen `tenantId` | `prisma/schema.prisma` | A01 | F1 |
| H16 | Imagen Docker única de desarrollo: usuario root, pnpm sin fijar, sin `--frozen-lockfile` | `Dockerfile` | A02, A03 | F0 |
| H17 | Node 20 (fin de soporte abril 2026) | `Dockerfile` | A03 | F0 |
| H18 | Sin tests, sin configuración de ESLint, sin CI, sin escaneo de dependencias ni de secretos | — | A03 | F0 |
| H19 | Dependencias instaladas sin uso (axios, nodemailer, multer, node-cron, mathjs, pdf-lib, winston, http-status-codes) | `package.json` | A03 | F0 |
| H20 | `pnpm build` roto (verificado 2026-11-16): `TS5101` por `baseUrl` obsoleto en TypeScript 6 y, detrás, `TS2322` en `PrismaTenantRepository.ts`. Falta verificar además que `tsc` reescriba el alias `@/` | `tsconfig.json` | — | F0 |
| H21 | Dinero convertido a `number` (`Number(estimatedValue)`) | `src/domain/entities/Lead.ts` | A06 | F3 |
| H22 | El login no ejecuta bcrypt si el correo no existe: el tiempo de respuesta revela qué correos están registrados (F0-T10) | `src/application/use-case/auth/LoginUseCase.ts` | A07 | F2 |
| H23 | La cookie `accessToken` caduca siempre a los 7 días (`maxAge` fijo), aunque `JWT_EXPIRATION` diga otra cosa (F0-T10) | `src/infrastructure/web/controllers/AuthControllers.ts` | A07 | F2 |
| H24 | `validateBody` usa `error: any`; un error que no es de Zod responde 400 con `{ errors: undefined }` (F0-T10) | `src/infrastructure/web/middleware/validateBody.ts` | A10 | F1 |
| H25 | Con `NODE_ENV=development` Prisma registra todas las consultas (F0-T10) | `src/config/database.ts` | A09 | F1 |
| H26 | Riesgo aceptado: 2 avisos moderados solo de desarrollo (`glob`, `minimatch` vía testcontainers). Revisar al actualizar testcontainers (F0-T10) | `pnpm-lock.yaml` | A03 | — |

Riesgos de lo que viene, a diseñar desde el inicio: inyección en fórmulas con mathjs (A05), inyección de fórmulas en Excel/CSV (A05), credenciales de Siigo en reposo (A04), consumo inseguro de API externa (API10), panel admin como objetivo de alto valor (A01, A07).

---

## 5. Fases

### F0 — Fundaciones (sin esto no se escribe funcionalidad)
Bloqueada por: D-01 a D-05.

- F0-T01 `[S]` Crear `docs/audits/`, `docs/security/`, `docs/modulos/`, plantilla de PR con lista de verificación (R1 a R15) y `CODEOWNERS`. **Hecha el 2026-11-16, pendiente de PR y revisión humana.** `docs/README.md`, `.github/pull_request_template.md`, `.github/CODEOWNERS`.
- F0-T11 `[S]` `docs/guia-de-codigo.md`: convenciones de idioma, nombres, comentarios y JSDoc con ejemplos buenos y malos tomados del código actual (R11 a R13). **Hecha el 2026-11-16, pendiente de PR y revisión humana.**
- F0-T02 `[O]` Framework de tests, estructura `tests/unit`, `tests/integration`, `tests/api`, dobles en memoria de los puertos, base de datos de test efímera, fábricas de datos. **Hecha el 2026-11-16, pendiente de PR y revisión humana.** Guía: `tests/README.md`.
- F0-T03 `[S]` ESLint (typescript-eslint, reglas de seguridad, prohibición de tests deshabilitados o enfocados, convención de nombres, sin `any`, sin números mágicos, sin código comentado) y Prettier. **Hecha el 2026-11-16, pendiente de PR y revisión humana.** Violaciones heredadas congeladas en `eslint-suppressions.json` (Q-008).
- F0-T04 `[O]` `dependency-cruiser` con las reglas de capas de R4. **Hecha el 2026-11-16, pendiente de PR y revisión humana.** `pnpm arch:check`; tests de las reglas en `tests/unit/tooling/`.
- F0-T05 `[S]` Hooks de git (pre-commit: lint; pre-push: typecheck + tests unitarios). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** lefthook; el pre-push añade `pnpm arch:check`.
- F0-T06 `[O]` CI en GitHub Actions: typecheck, lint, capas, tests con PostgreSQL, cobertura con umbral, `pnpm audit`, escaneo de secretos (gitleaks), verificación de `CONTEXT.md`. **Hecha el 2026-11-16, pendiente de PR y revisión humana.** `.github/workflows/ci.yml`; además construye y prueba la imagen Docker. Checks a marcar como obligatorios: `quality`, `tests`, `dependency-audit`, `secret-scan`, `context-updated`, `docker-image`.
- F0-T07 `[S]` Verificar y corregir H20 (build de producción con alias). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** Se confirmó que `tsc` no reescribe `@/`: se añadió `tsc-alias`. Regresión en `tests/build/`.
- F0-T08 `[S]` Dockerfile multi-etapa de producción (no root, pnpm fijado, `--frozen-lockfile`), Node LTS vigente; compose de desarrollo aparte. **Hecha el 2026-11-16, pendiente de PR y revisión humana.** Node 24.18.0 (D-04); la CI construye y prueba la imagen (F0-T06).
- F0-T09 `[S]` Limpiar dependencias sin uso que no entren en fases próximas (según decisiones). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** Fuera `nodemailer` (D-30), `node-cron` (D-27) y `http-status-codes`; `axios` fijado (D-49); dependencias actualizadas; pnpm fijado a 11.28.10.
- F0-T10 `[O]` `docs/audits/00-linea-base.md` con los hallazgos de la sección 4, severidad y tarea asignada. **Hecha el 2026-11-16, pendiente de PR y firma humana.** Añade H22 a H26.
- **Humano:** protección de ramas `develop` y `main` (checks obligatorios + 1 aprobación), Dependabot o Renovate.

### F1 — Endurecimiento y mejora de lo existente
Bloqueada por: D-06, D-07, D-15 a D-19.

Transversal:
- F1-T01 `[O]` Variables de entorno validadas con Zod al arrancar; sin valores por defecto para secretos (H1). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** `parseEnvironment` en `src/config/env.ts`; `JWT_SECRET` de 32 caracteres o más y `NODE_ENV` obligatorias.
- F1-T02 `[O]` Jerarquía de errores (`NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`, `UnauthorizedError`) en dominio/aplicación + manejador global en infraestructura con formato único y sin stack trace (H5). Sustituir los `throw new Error` existentes. `validateBody` pasa al manejador los errores que no sean de Zod (H24). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** Formato `{ error: { code, message, details? } }`; los `Error` que quedan son invariantes internas (500).
- F1-T03 `[O]` Puerto `ITransactionManager` (adaptador Prisma `$transaction`) y registro atómico (H8). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** La parte de H8 "revela si un correo existe" sigue abierta: sin verificación de correo (F2-T04) el registro tiene que avisar del duplicado.
- F1-T04 `[O]` Políticas de autorización centralizadas en `application/policies` (`can(usuario, acción, recurso)`); retirar los `if (role …)` dispersos (H12). Generar `docs/security/matriz-permisos.md`. **Hecha el 2026-11-16, pendiente de PR, revisión humana y firma de la matriz.** Las acciones permitidas a todos (contactos, empresas cliente, listar estados) se conectan a la política en F1-T16/F1-T17.
- F1-T05 `[O]` Suite de aislamiento por tenant y suite de roles que recorren el inventario de rutas; CI falla si una ruta no está cubierta (R5). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** `tests/api/security/routeCoverage*.test.ts`; escenarios en `tests/support/http/routeSecurityScenarios.ts`.
- F1-T06 `[S]` CORS con lista blanca y credenciales, `trust proxy`, límite de cuerpo 100 kb, límites de tasa por ruta (H4, H6, H14). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** Cupos por defecto en Q-011. De H6 quedan los contadores compartidos entre instancias (F8) y el bloqueo por cuenta (F2-T03).
- F1-T07 `[O]` Logger estructurado detrás de puerto `ILogger` (winston), id de petición, redacción de datos sensibles; puerto `IAuditLogger` que escribe `AuditLog` en toda mutación, evento de auth y descarga (H13). El log de consultas de Prisma solo en local y sin datos (H25). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** No hay descargas todavía (se auditarán al crearlas en F6/F7). Limitación: fuera de registro y cambio de estado la auditoría no comparte transacción con la modificación.
- F1-T08 `[S]` `/health` (vida) y `/ready` (BD), apagado ordenado. **Hecha el 2026-11-16, pendiente de PR y revisión humana.** Resuelve F0-S4. Las sondas cuentan para el límite global de peticiones: el orquestador no debe sondear más de una vez cada 10 s por instancia.
- F1-T09 `[S]` Dividir `cross-cutting/container.ts` por módulo. **Hecha el 2026-11-16, pendiente de PR y revisión humana.** `src/cross-cutting/modules/`.
- F1-T10 `[S]` Migración: `tenantId` en `QuoteItem` y `LeadStatusHistory` (H15). **Hecha el 2026-11-16, pendiente de PR, revisión humana y aplicación en producción por Operaciones (R6).**
- F1-T11 `[S]` Si D-06 = Sí: rutas REST bajo `/api/v1`. Si D-07 = Sí: OpenAPI generado desde los esquemas Zod. **Hecha el 2026-11-16, pendiente de PR y revisión humana.** Contrato en `docs/openapi.json`; cambia todas las rutas, así que el frontend tiene que usar las nuevas.

Motor de filtrado:
- F1-T12 `[O]` Validar `filters` con Zod según tipo declarado por campo (texto, número, fecha, id); errores 400; ordenamiento por lista blanca (`sortBy`, `sortDir`); mover el alcance por rol del controller a la política (H11). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** `src/infrastructure/web/filters/parseFilterQuery.ts`.

Leads y estados:
- F1-T13 `[O]` Cambio de estado como caso de uso propio que escribe `LeadStatusHistory` en transacción; validar `assignedToId` al actualizar (H9); login comprueba usuario y tenant activos (H3). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** `PATCH /api/lead/status/:id`. Leer el historial (línea de tiempo, C-02) queda para cuando se planifique C-02.
- F1-T14 `[S]` Estados: campo `type` (abierto/ganado/perdido, ver D-51), borrado suave con regla (no es el predeterminado y no tiene leads: reutilizar `countLeadByStatus`), reordenamiento transaccional. **Hecha el 2026-11-16, pendiente de PR, revisión humana y migración en producción (R6).** El motivo obligatorio al marcar perdido (C-06) aún no tiene tarea asignada.
- F1-T15 `[S]` Correcciones de nombres y tipos: `PrismaLeadStatusConfig.ts`, `LeadConfigStatusMapper.ts`, `updateAt`, uso real del enum `DeletedState`, `map(this.mapper.toDTO)` sin enlazar. **Hecha el 2026-11-16, pendiente de PR y revisión humana.**
- F1-T18 `[S]` Poner el código existente al día con R11 a R13: renombrar identificadores poco claros (`leadmap`, `rolUser`, `existingRepo`, `leadProperty`), JSDoc en puertos, casos de uso y entidades, y `docs/modulos/` de auth, leads, estados, contactos y filtrado. **Hecha el 2026-11-16, pendiente de PR y revisión humana.** `eslint-suppressions.json` queda vacío (Q-008); bcrypt pasa a coste 12 (D-10).

Contactos y empresas:
- F1-T16 `[S]` Borrado suave, `findById` filtra `deleted` (H10), validar `companyId` (H9). **Hecha el 2026-11-16, pendiente de PR y revisión humana.** Quién borra y qué pasa con los contactos de una empresa borrada: Q-012.
- F1-T17 `[O]` Migración: `ownerId` (comercial responsable) en `Contact` y `CompanyContact`; `documentType` y `documentNumber` en `Contact`; documento normalizado en ambos (solo dígitos, sin dígito de verificación). Visibilidad por rol según D-18, unicidad según D-19. Es la base de la cartera. **Hecha el 2026-11-16, pendiente de PR, revisión humana, firma de la matriz y migración en producción (R6).** La unicidad del documento la comprueba la aplicación (sin índice único parcial).

### F2 — Identidad, sesiones y usuarios
Bloqueada por: D-09 a D-14. Requiere cuenta de Resend y dominio verificado.

- F2-T01 `[S]` Puerto `IEmailService` + adaptador Resend + registro de envíos (`EmailLog`) + plantillas base. **Hecha el 2026-11-17, pendiente de PR y revisión humana.** Resend por axios (sin el SDK); plantillas en MJML compiladas (D-28). Clave de Resend de ejemplo hasta verificar el dominio (Operaciones).
- F2-T02 `[O]` Sesiones según D-09: token de acceso corto, refresh rotatorio guardado con hash, detección de reutilización, logout y logout global, algoritmo fijo, `iss`/`aud` (H2). La caducidad de la cookie sale de la del token (H23). **Hecha el 2026-11-17, pendiente de PR, revisión humana, firma de la matriz y migración en producción (R6).** El rol se lee de la base en cada petición (H2 resuelto); H23 resuelto.
- F2-T03 `[O]` Política de contraseñas, límite por cuenta e IP, bloqueo progresivo, respuestas genéricas (H7). El login tarda lo mismo exista o no el correo (H22). **Hecha el 2026-11-17, pendiente de PR, revisión humana y migración en producción (R6).** H7 y H22 resueltos. El bloqueo por IP sigue siendo el limitador de F1-T06; los contadores compartidos entre instancias quedan para F8.
- F2-T04 `[O]` Verificación de correo y recuperación de contraseña (tokens de un solo uso, con hash y caducidad). **Hecha el 2026-11-17, pendiente de PR, revisión humana y migración en producción (R6).** Completa H8: el registro ya no revela si el correo existe. Los correos salen por Resend con la clave de ejemplo hasta verificar el dominio.
- F2-T05 `[O]` Usuarios del tenant: invitar por correo, aceptar invitación, listar, cambiar rol, desactivar (revoca sesiones). Reglas según D-16 y D-17. **Hecha el 2026-11-17, pendiente de PR, revisión humana, firma de la matriz y migración en producción (R6).** El límite de usuarios por plan (D-34) llega con F5-T03.
- F2-T06 `[S]` Perfil del tenant y `TenantSettings` (nombre, logo, zona horaria; por defecto `America/Bogota`). **Hecha el 2026-11-17, pendiente de PR, revisión humana, firma de la matriz y migración en producción (R6).** El logo se sube con `IFileStorage` en F3-T07; aquí solo se lee.
- F2-T07 `[O]` Protección CSRF acorde a D-14 (verificación de `Origin` en peticiones que modifican). **Hecha el 2026-11-17, pendiente de PR y revisión humana.** `createOriginCheckMiddleware`; sin `Origin` usa `Referer`.
- F2-T08 `[O]` Auditoría en la misma transacción que la modificación en todos los casos de uso que escriben (F1-S1 de `docs/audits/F1-seguridad.md`). **Hecha el 2026-11-17, pendiente de PR y revisión humana.** Suite `auditAtomicity.test.ts` sobre todo el inventario.
- F2-T09 `[S]` Índice único parcial `(tenantId, documentNumber) WHERE deleted = 'INUSE'` en contactos y empresas cliente, con SQL propio en la migración, y traducción del conflicto a 409 (F1-S2). **Hecha el 2026-11-17, pendiente de PR, revisión humana y migración en producción (R6).** Declarado en `schema.prisma` con la función preview `partialIndexes`.
- **Cierre:** informe `docs/audits/F2-seguridad.md` con la verificación de extremo a extremo (rama `feat/F2-security-audit`), pendiente de firma (R10).
- F2-T10 `[S]` Sacar `/health` y `/ready` del limitador global de peticiones, o documentar la frecuencia máxima de sondeo para el orquestador (F1-S5). **Hecha el 2026-11-17, pendiente de PR y revisión humana.** Las sondas se registran antes del limitador.

### F3 — Productos, fórmulas y cotizaciones
Bloqueada por: D-20 a D-26.

- F3-T01 `[O]` Objeto de valor `Money` con decimales exactos; corregir H21. **Hecha el 2026-11-17, pendiente de PR y revisión humana.** `Money` y `Percentage` sin librerías (R4); `decimal.js` no hace falta.
- F3-T02 `[S]` Productos: CRUD, filtrado, borrado suave.
- F3-T03 `[O]` Puerto `IFormulaEvaluator` + adaptador mathjs endurecido: funciones peligrosas deshabilitadas (`import`, `createUnit`, `evaluate`, `parse`, `simplify`, `derivative`), lista blanca de nodos, longitud máxima, solo variables declaradas y numéricas. Tests de inyección obligatorios.
- F3-T04 `[S]` Fórmulas: CRUD; la expresión se valida al guardar.
- F3-T05 `[O]` Cotizaciones: numeración consecutiva por tenant sin huecos por concurrencia, ítems con precio calculado en servidor y guardado como instantánea, descuento, impuestos, vigencia, máquina de estados, reglas por rol. Todo en transacción.
- F3-T06 `[S]` Puerto `IPdfGenerator` + adaptador pdf-lib (logo, datos del tenant, ítems, totales, condiciones).
- F3-T07 `[O]` Puerto `IFileStorage` + subida de logo con validación de tipo real y tamaño.
- F3-T08 `[S]` Enviar cotización por correo con PDF adjunto; pasa a `SENT`; queda en auditoría.
- F3-T09 `[S]` Crear cotización desde un lead; al aceptar, el lead puede pasar a ganado.
- F3-T10 `[S]` Canal de correo por empresa (D-57): `TenantSettings.emailDeliveryEnabled`, desactivado por defecto, lo cambian dueño y socio. Con el correo desactivado, enviar una cotización la marca como `SENT` sin correo y el comercial comparte el PDF; las notificaciones de F4 quedan solo dentro de la aplicación. Los correos de la cuenta (verificación, recuperación, invitación) no dependen de este ajuste.
- F3-T11 `[S]` Entorno de pruebas (D-58): frontend en Vercel con proxy (`rewrites`) hacia la API publicada por ngrok, para que las cookies sigan siendo del mismo sitio (D-14). Test de que CORS acepta la cabecera `ngrok-skip-browser-warning`. Guía en `docs/despliegue-pruebas.md`. **Hecha el 2026-11-17, pendiente de PR y revisión humana.** La API no cambia: CORS ya devolvía como permitidas las cabeceras pedidas; ahora lo fija un test.

Detalles de cotización respondidos el 2026-11-17 (`QUESTION.md`): cada ítem guarda el precio calculado y el manual, con motivo obligatorio y auditoría; la alerta al líder llega en F4-T06 (Q-015). F3 añade `EXPIRED` calculado al leer, en la zona horaria de la empresa; F4 lo guarda con una tarea diaria (Q-016). Una versión nueva conserva el número: `COT-000123 v2`, y la anterior queda de solo lectura (Q-018). Descuento porcentual global y por ítem; topes por defecto: `SALES_REP` 10 %, `SALES_LEADER` 20 %, `OWNER` y `PARTNER` sin tope, configurables por dueño y socio (Q-019). Se cotiza antes de IVA y luego se suma el IVA: tasa por defecto configurada por dueño o socio; mientras no se configure, se pide al cotizar (Q-020).

### F4 — Tareas en segundo plano, alertas y notificaciones
Bloqueada por: D-27 a D-30.

- F4-T01 `[O]` Puerto `IJobQueue` + adaptador; reintentos, ejecución única entre instancias, historial de ejecuciones (`JobRun`).
- F4-T02 `[S]` Envío de correo por cola con idempotencia; webhook de Resend con firma verificada (entregado, rebotado, queja) y lista de supresión.
- F4-T03 `[S]` Notificaciones in-app: modelo, listar, contador de no leídas, marcar leídas.
- F4-T04 `[S]` Preferencias por usuario, tipo y canal (correo / in-app).
- F4-T05 `[O]` Servicio de notificación único que resuelve destinatarios, preferencias y canales.
- F4-T06 `[S]` Alertas iniciales: lead asignado, cotización aceptada o rechazada, cotización por vencer, tarea de seguimiento vencida (si C-01 = Sí), precio cambiado a mano en una cotización (a los líderes y al dueño, D-24, Q-015). Por correo solo si la empresa lo activó (D-57).

### F5 — Suscripciones y administración de plataforma
Bloqueada por: D-31 a D-39 y la tabla de precios (sección 8).

Suscripciones:
- F5-T01 `[O]` Modelos `Plan`, `Subscription` (prueba, activa, vencida, suspendida, cancelada), `SubscriptionEvent` (historial inmutable: quién, qué, cuándo, motivo), `ManualPayment`.
- F5-T02 `[O]` Máquina de estados; prueba automática al registrarse (D-31); tarea diaria de vencimientos.
- F5-T03 `[O]` Guardas: `subscriptionGuard` (comportamiento al vencer según D-33), `requireFeature(...)`, límite de usuarios al invitar (D-34).
- F5-T04 `[S]` Endpoints del tenant: ver plan, estado, uso e historial.
- F5-T05 `[S]` Correos: fin de prueba a 7, 3 y 1 día; activada; vencida; suspendida.

Administración (`/api/v1/admin/*`, identidad separada de los tenants):
- F5-T06 `[O]` Modelo `PlatformAdmin` sin tenant, login propio con 2FA TOTP obligatorio, cookie y secreto distintos, sesión corta, límite estricto. El primer admin se crea por script de consola, nunca por endpoint.
- F5-T07 `[O]` Repositorios de admin separados de los de tenant (no heredan el filtro), `AdminAuditLog` inmutable de cada acción.
- F5-T08 `[S]` Empresas: listar, ver detalle y uso, suspender, reactivar.
- F5-T09 `[O]` Suscripciones manuales: activar (plan, periodo, referencia de pago), extender, suspender, cancelar, cambiar plan y **otorgar prueba gratuita manual** (días y motivo).
- F5-T10 `[S]` Logs: auditoría entre tenants, acciones de admin, correos, tareas y sincronizaciones, con filtros y paginación.
- F5-T11 `[O]` Tareas de mantenimiento: lista cerrada ejecutable a mano (purgar borrados antiguos, limpiar tokens y sesiones caducadas, reintentar correos fallidos, resincronizar un tenant, recalcular cartera), historial y modo mantenimiento (503 con mensaje).
- F5-T12 `[O]` Mantenimiento de base de datos: salud (tamaño, tablas, índices, conexiones, consultas largas, estado de migraciones), acciones de lista cerrada (`VACUUM (ANALYZE)`, `REINDEX CONCURRENTLY` sobre tablas predefinidas) y estado de backups. Nunca SQL libre.
- F5-T13 `[S]` Alertas al admin: tarea fallida, pico de errores, sincronización caída, prueba por convertir.

### F6 — Integración con Siigo y cartera
Bloqueada por: D-40 a D-49. Requiere credenciales de API de Siigo de una cuenta de pruebas.

- F6-T01 `[O]` + humano. **Investigación previa:** contrastar con la documentación oficial de Siigo autenticación, endpoints de clientes y facturas (saldo, vencimiento, vendedor), paginación, límites y webhooks. Resultado en `docs/integrations/siigo.md`. No se programa sobre supuestos.
- F6-T02 `[O]` Puerto `ISecretCipher` (AES-256-GCM, clave por entorno con versión) y modelo `SiigoConnection`: la clave de acceso se guarda cifrada y nunca se devuelve por la API.
- F6-T03 `[O]` Puerto `IAccountingProvider` + adaptador Siigo: URL base fija, tiempo máximo, reintentos con espera, respeto de límites, respuestas validadas con Zod.
- F6-T04 `[O]` Sincronización idempotente por tenant (`SiigoCustomer`, `ReceivableInvoice`, `SyncRun`), programada y manual con enfriamiento (D-41).
- F6-T05 `[O]` Emparejamiento: documento normalizado de Siigo contra `CompanyContact` y `Contact` del tenant. El comercial de la factura es el `ownerId` del cliente emparejado. Sin coincidencia o con conflicto → "Sin asignar" (D-42), con endpoint de vinculación manual y de crear cliente desde Siigo.
- F6-T06 `[O]` Cartera: por factura con saldo, comercial, cliente, documento, número de factura, emisión, vencimiento, **días vencidos**, saldo, interés de mora y **deuda total**; totales por cliente y por comercial; tramos de antigüedad.
- F6-T07 `[O]` Interés por mora configurable en `TenantSettings` (activo, tasa, días de gracia) según D-43 a D-45 y D-48; cálculo con decimales exactos.
- F6-T08 `[O]` Puerto `IExcelExporter` + adaptador; `GET /api/v1/receivables/export`: dueño y líder comercial descargan la completa (filtrable por comercial); el comercial recibe solo la suya, forzado en servidor. Celdas saneadas contra inyección de fórmulas; cada descarga queda en auditoría; límite de tasa.
- F6-T09 `[S]` Alertas de cartera: factura que cruza umbrales de días vencidos (comercial y líder), resumen semanal, fallo de sincronización (dueño), cambio de la configuración de mora hecho por el líder comercial (dueño, D-45).

### F7 — Analíticas
Bloqueada por: D-50 a D-52.

Cada reporte responde `{ series, rows }` (series para graficar, filas crudas) y acepta `?format=csv|xlsx` para descarga. El comercial solo ve lo suyo. Rango de fechas acotado.

- F7-T01 `[O]` Base común: parámetros validados (`from`, `to`, `groupBy`, `userId`), alcance por rol, exportación reutilizando `IExcelExporter`, índices necesarios.
- F7-T02 `[S]` Embudo de leads por estado (cantidad y valor estimado).
- F7-T03 `[S]` Leads creados, ganados y perdidos por periodo, con tasa de conversión.
- F7-T04 `[S]` Cotizaciones por estado y monto, con tasa de aceptación.
- F7-T05 `[S]` Ventas (cotizaciones aceptadas) por comercial y periodo.
- F7-T06 `[S]` Cartera por antigüedad y por comercial.

### F8 — Auditoría final y salida del MVP
Bloqueada por: D-53 a D-56.

- F8-T01 `[O]` Verificación ASVS: nivel 1 completo, nivel 2 en autenticación, sesiones y control de acceso. Informe en `docs/audits/`.
- F8-T02 `[O]` Revisión completa de arquitectura (capas, puertos, dependencias) e inventario de dependencias con licencias (SBOM).
- F8-T03 `[S]` Escaneo dinámico contra staging (si D-53 = Sí) y corrección de hallazgos.
- F8-T04 **Humano:** simulacro de restauración de backup, revisión legal (D-56), prueba externa de penetración (si D-54 = Sí), despliegue.
- F8-T05 `[S]` Guía de operación: variables, despliegue, rotación de claves, respuesta a incidentes.

### F9 — Después del MVP
Lo marcado "No" en las sugerencias de CRM (sección 9.8), pasarela de pago, SSE, 2FA para usuarios, otros ERP.

---

## 6. Dependencias

**Paquetes** (versiones exactas se fijan al instalar; cada alta pasa por `pnpm audit` y revisión humana):

| Fase | Añadir | Quitar |
|---|---|---|
| F0 | vitest, @vitest/coverage-v8, supertest, @types/supertest, @testcontainers/postgresql, typescript-eslint, eslint-plugin-security, @vitest/eslint-plugin, dependency-cruiser, lefthook, tsc-alias (si H20 se confirma) | jest, ts-jest, @types/jest (si D-01 = Sí) |
| F1 | @asteasolutions/zod-to-openapi (si D-07 = Sí) | — |
| F2 | mjml (devDependency, D-28). `resend` no se añadió: el adaptador usa axios (F2-T01) | nodemailer, @types/nodemailer (si D-30 = Sí) |
| F3 | file-type, cliente S3 (si D-26 = Sí). `decimal.js` no se añadió: `Money` usa `bigint` (F3-T01) | — |
| F4 | pg-boss (si D-27 = Sí), svix | node-cron (si D-27 = Sí) |
| F5 | otplib, qrcode | — |
| F6 | exceljs | axios (si D-49 = Sí) |

Ya instaladas y que se usarán: zod, winston, mathjs, pdf-lib, multer, bcryptjs, jsonwebtoken, helmet, express-rate-limit.

**Externas, a cargo de humanos:**

| Necesario para | Dependencia |
|---|---|
| F0 | Protección de ramas en GitHub; Dependabot o Renovate |
| F2 | Cuenta de Resend, dominio verificado (SPF, DKIM, DMARC), `RESEND_API_KEY`, dirección remitente |
| F3 | Almacenamiento de archivos para producción |
| F5 | Precios y planes; términos del servicio |
| F6 | Credenciales de API de Siigo de una cuenta de pruebas; clave de cifrado en gestor de secretos; tasa máxima legal de mora vigente |
| F8 | Hosting, PostgreSQL gestionado con backups y recuperación a un punto en el tiempo, dominio y TLS, gestor de secretos, revisión legal de tratamiento de datos (Ley 1581 de 2012) |

---

## 7. Auditorías
| Auditoría | Cuándo | Quién | Entregable |
|---|---|---|---|
| Línea base de seguridad | F0 | Opus, firma humano | `docs/audits/00-linea-base.md` |
| Seguridad de fase (OWASP Top 10:2025 + API Top 10:2023) | Cierre de cada fase | Opus, firma humano | `docs/audits/F<n>-seguridad.md` |
| Arquitectura (capas y puertos) | Cada PR (automática) y cierre de fase | CI + Opus | Reporte de `dependency-cruiser` |
| Aislamiento por tenant | Cada PR | CI | Suite de aislamiento |
| Permisos por rol | Cada PR | CI, firma humano de la matriz | `docs/security/matriz-permisos.md` + suite |
| Dependencias y secretos | Cada PR y semanal | CI | `pnpm audit`, gitleaks, PRs de actualización |
| Auditoría de negocio (dentro de la app) | Continua desde F1 | Sistema | `AuditLog`, `AdminAuditLog`, `SubscriptionEvent` |
| Verificación ASVS, escaneo dinámico, SBOM | F8 | Opus + humano | `docs/audits/F8-*.md` |

---

## 8. Suscripciones: planes y precios (a decidir)

Propuesta de estructura; nombres, límites y precios los fija el dueño de producto.

| Plan | Usuarios incluidos | Funciones propuestas | Precio mensual | Precio anual |
|---|---|---|---|---|
| Básico | ____ | Leads, contactos, cotizaciones y PDF | ______ | ______ |
| Profesional | ____ | Básico + analíticas + alertas | ______ | ______ |
| Empresarial | ____ | Profesional + Siigo y cartera | ______ | ______ |
| Usuario adicional | — | — | ______ | ______ |

Moneda de cobro: ______ · Días de prueba: ____ · Días de gracia al vencer: ____

---

## 9. Decisiones a tomar

Marca **Sí** o **No**, o escribe en **Otro**. Las decisiones sin marcar bloquean su fase (R7).

### 9.1 Proceso y herramientas (bloquean F0 y F1)
| ID | Decisión | Recomendado | Sí | No | Otro (explicación) |
|---|---|---|---|---|---|
| D-01 | Usar Vitest en lugar de Jest (el proyecto es ESM con alias) | Sí | [X] | [ ] | |
| D-02 | Tests de integración contra PostgreSQL real en contenedor efímero | Sí | [X] | [ ] | |
| D-03 | Cobertura mínima: 90 % en dominio y aplicación, 80 % global | Sí | [X] | [ ] | |
| D-04 | Subir a la versión LTS vigente de Node | Sí | [ ] | [ ] | Sí, pero se fijara a la versión de Node 24 LTS |
| D-05 | CI en GitHub Actions y ramas protegidas con 1 aprobación humana | Sí | [X] | [ ] | |
| D-06 | Migrar ahora las rutas a REST bajo `/api/v1` (`GET /leads`, `DELETE /leads/:id`) | Sí | [X] | [ ] | |
| D-07 | Generar documentación OpenAPI desde los esquemas Zod (contrato para el frontend) | Sí | [X] | [ ] | |
| D-08 | Revisión cruzada entre modelos antes de la revisión humana | Sí | [X] | [ ] | |

### 9.2 Seguridad e identidad (bloquean F1 y F2)
| ID | Decisión | Recomendado | Sí | No | Otro (explicación) |
|---|---|---|---|---|---|
| D-09 | Sesión con token de 15 min + refresh rotatorio en BD (reemplaza el JWT de 7 días) | Sí | [X] | [ ] | |
| D-10 | Mantener bcrypt (coste 12) en lugar de migrar a argon2id | Sí | [X] | [ ] | |
| D-11 | Contraseña mínima de 12 caracteres y rechazo de contraseñas filtradas | Sí | [X] | [ ] | |
| D-12 | Verificar el correo antes de poder usar la cuenta | Sí | [X] | [ ] | |
| D-13 | 2FA para usuarios de empresas en el MVP (en admin es obligatorio siempre) | No | [ ] | [X] | |
| D-14 | Frontend y API bajo el mismo dominio (`app.` y `api.`) para mantener cookies `SameSite=Strict` | Sí | [X] | [ ] | |
| D-15 | Row Level Security de PostgreSQL como segunda barrera en el MVP | No | [ ] | [X] | |
| D-16 | PARTNER tiene los permisos de OWNER excepto suscripción y borrar la empresa | Sí | [X] | [ ] | |
| D-17 | SALES_LEADER puede invitar y gestionar a los SALES_REP | Sí | [X] | [ ] | |
| D-18 | SALES_REP solo ve los clientes de los que es responsable | Sí | [X] | [ ] | |
| D-19 | Un documento/NIT no puede repetirse entre clientes del mismo tenant | Sí | [X] | [ ] | |

### 9.3 Cotizaciones (bloquean F3)
| ID | Decisión | Recomendado | Sí | No | Otro (explicación) |
|---|---|---|---|---|---|
| D-20 | IVA por ítem con tasa configurable (19 % por defecto) | Sí | [ ] | [ ] |Por defecto poner IVA de colombia, permitir configuracion a la hora de realizar cotizaciones|
| D-21 | Solo pesos colombianos en el MVP | Sí | [x] | [ ] | |
| D-22 | Una cotización enviada no se edita; los cambios generan una versión nueva | Sí | [x] | [ ] | |
| D-23 | Estado "vencida" automático al pasar la fecha de vigencia | Sí | [x] | [ ] | |
| D-24 | El comercial puede cambiar a mano el precio calculado | No | [ ] | [ ] |Si, pero realizar una alerta al lider comercial, sea mayor o menor, debido a asociaciones con clientes, negociacion o descuentos|
| D-25 | Descuento máximo por rol, configurable por el dueño | Sí | [x] | [ ] | |
| D-26 | Archivos (logos, PDF) en almacenamiento tipo S3 en producción | Sí | [ ] | [ ] |Si, pero para mvp optar por algun servicio gratuito|

### 9.4 Correos, notificaciones y tareas (bloquean F4)
| ID | Decisión | Recomendado | Sí | No | Otro (explicación) |
|---|---|---|---|---|---|
| D-27 | Cola sobre PostgreSQL (pg-boss) en lugar de node-cron | Sí | [X] | [ ] | |
| D-28 | Plantillas de correo HTML propias, sin react-email | Sí | [ ] | [ ] | Usar MJML para no tener que mantener a mano HTML de correo compatible con Gmail, Outlook, Apple Mail y Yahoo |
| D-29 | Notificaciones in-app por consulta periódica en el MVP (tiempo real después) | Sí | [X] | [ ] | |
| D-30 | Eliminar nodemailer (Resend lo reemplaza) | Sí | [X] | [ ] | |

### 9.5 Suscripciones y administración (bloquean F5)
| ID | Decisión | Recomendado | Sí | No | Otro (explicación) |
|---|---|---|---|---|---|
| D-31 | Prueba gratuita automática al registrarse (días en sección 8) | Sí | [ ] | [ ] |Dar la opcion de solicitarla dejando datos y el por qué la solicita|
| D-32 | MVP sin pasarela de pago: activación manual por admin | Sí | [x] | [ ] | |
| D-33 | Al vencer: solo lectura y exportación de datos, sin bloqueo total | Sí | [ ] | [ ] | Solo por 1 mes y con constantes avisos, al vencer el mes, inhabilitar el acceso pero no borrar la información a menos que se solicite|
| D-34 | Límite de usuarios por plan | Sí | [x] | [ ] | |
| D-35 | Dos roles de admin: SUPER_ADMIN y SUPPORT (solo lectura) | Sí | [x] | [ ] | |
| D-36 | Lista de IP permitidas para el panel admin | No | [] | [X] | |
| D-37 | Backups a cargo del proveedor de BD; el panel solo muestra su estado | Sí | [X] | [ ] | |
| D-38 | Soporte puede entrar como un tenant (suplantación) | No | [ ] | [ ] |Solo los super admin|
| D-39 | Purgar definitivamente lo borrado tras un plazo (días: 60) | Sí | [x] | [ ] | |

### 9.6 Siigo y cartera (bloquean F6)
| ID | Decisión | Recomendado | Sí | No | Otro (explicación) |
|---|---|---|---|---|---|
| D-40 | Puerto contable genérico para sumar otros ERP más adelante | Sí | [x] | [ ] | |
| D-41 | Sincronización nocturna diaria + botón "sincronizar ahora" con espera mínima | Sí | [x] | [ ] | |
| D-42 | Facturas sin cliente emparejado van a "Sin asignar", visibles para dueño y líder, con asignación manual | Sí | [x] | [ ] | |
| D-43 | Mora con interés simple diario: saldo × (tasa mensual ÷ 30) × días en mora | Sí | [ ] | [ ] |Por defecto deshabilitada, darle la opcion a dueño, socio y lider comercial de configurarlo en panel (ver D-45)|
| D-44 | La tasa no puede superar el máximo legal, que mantiene el admin de plataforma | Sí | [x] | [ ] | |
| D-45 | Dueño, socio y líder comercial configuran el interés por mora | Sí | [ ] | [ ] |Dueño, socio y lider comercial. Si lo cambia el lider comercial, le llega una alerta al dueño|
| D-46 | PARTNER también puede descargar la cartera completa | No | [ ] | [ ] |Solo su cartera|
| D-47 | Enviar recordatorios de cobro por correo al cliente final | No | [ ] | [ ] |Solo al comercial, no al cliente final, a menos que manualmente un usuario lo active, solo que el dueño lo active para que se envie automatico, manualmente o lo inhabilite a los clientes finales en el panel admin|
| D-48 | Días de gracia configurables antes de generar mora | Sí | [X] | [ ] | |
| D-49 | Usar `fetch` nativo y eliminar axios | Sí | [ ] | [ ] |Fijar versiones estables de axios y sin vulnerabilidades publicas|

### 9.7 Analíticas y salida (bloquean F7 y F8)
| ID | Decisión | Recomendado | Sí | No | Otro (explicación) |
|---|---|---|---|---|---|
| D-50 | Los 5 reportes de F7 son suficientes para el MVP | Sí | [X] | [ ] | |
| D-51 | Cada estado de lead declara su tipo: abierto, ganado o perdido | Sí | [X] | [ ] | |
| D-52 | Rango máximo de consulta de 24 meses | Sí | [ ] | [ ] |Configurable por cada usuario, fijable por lider comercial y dueño/socio|
| D-53 | Escaneo dinámico (OWASP ZAP) contra staging antes de salir | Sí | [X] | [ ] | |
| D-54 | Prueba de penetración externa antes de tener clientes de pago | Sí | [X] | [ ] | |
| D-55 | Proveedor de hosting y de PostgreSQL: escribir en "Otro" | — | [ ] | [ ] |PostgreSQL en Neon (plan Free): crear el proyecto en Neon, generar la migración y poner la URL de conexión en `.env` (`DATABASE_URL`). Hosting del backend: por definir|
| D-56 | Revisión legal de términos y política de datos (Ley 1581) antes de salir | Sí | [ ] | [ ] |Dejar genericos mientras se establece el mvp luego de testeos|
| D-57 | Cada empresa decide si usa solo las notificaciones del sistema o también el correo | Sí | [ ] | [ ] | Pedido por el dueño el 2026-11-17, falta marcarla: correo desactivado por defecto; Resend listo para cuando se compre el dominio |
| D-58 | Entorno de pruebas: frontend en Vercel (gratis) y API por ngrok (`https://crepe-waviness-ploy.ngrok-free.dev`) hasta comprar dominio | Sí | [ ] | [ ] | Pedido por el dueño el 2026-11-17, falta marcarla: las peticiones llevan `ngrok-skip-browser-warning` |

### 9.8 Funcionalidades comunes de CRM sugeridas (¿entran al MVP?)
"Sí" las agrega a F1/F3/F4 como tareas nuevas; "No" las deja en F9.

| ID | Funcionalidad | Recomendado | Sí | No | Otro (explicación) |
|---|---|---|---|---|---|
| C-01 | Actividades y tareas de seguimiento (llamada, reunión, nota, recordatorio con fecha) | Sí | [X] | [ ] | |
| C-02 | Línea de tiempo del lead (estados, actividades, cotizaciones) | Sí | [X] | [ ] | |
| C-03 | Convertir un lead ganado en cliente | Sí | [X] | [ ] | |
| C-04 | Importar leads y contactos desde CSV o Excel | Sí | [X] | [ ] | |
| C-05 | Aviso de duplicados por correo, teléfono o documento | Sí | [X] | [ ] | |
| C-06 | Motivo obligatorio al marcar un lead como perdido | Sí | [X] | [ ] | |
| C-07 | Enlace público firmado para que el cliente vea y acepte la cotización | No | [ ] | [X] | |
| C-08 | Asignación automática de leads (el esquema ya prevé rotación y balanceo) | No | [ ] | [X] | |
| C-09 | Etiquetas en leads y contactos | No | [ ] | [X] | |
| C-10 | Campos personalizados por tenant | No | [ ] | [X] | |
| C-11 | Metas de venta por comercial | No | [ ] | [X] | |
| C-12 | Formulario web o webhook de captura de leads | No | [ ] | [X] | |
| C-13 | Plantillas de cotización y de correo por tenant | No | [ ] | [X] | |
| C-14 | Búsqueda global | No | [ ] | [X] | |
| C-15 | Integración con calendario o WhatsApp | No | [ ] | [X] | |

---

## 10. Verificación

Por PR (automática, obligatoria):
```bash
pnpm typecheck && pnpm lint && pnpm arch:check
pnpm test:unit
pnpm test:integration     # PostgreSQL efímero
pnpm test:api             # supertest, incluye suites de aislamiento y de roles
pnpm test:coverage        # falla bajo el umbral
pnpm audit
```

De extremo a extremo al cerrar cada fase (manual, humano o modelo con evidencia en el PR):
- F1: una petición con un recurso de otro tenant responde 404; un error de dominio responde con su código y sin stack trace.
- F2: registro → correo de verificación → login → refresh → logout; un refresh reutilizado revoca la sesión.
- F3: crear producto con fórmula → cotización → PDF → envío por correo; una expresión maliciosa es rechazada.
- F5: admin otorga prueba, activa y suspende una suscripción; al vencer, el tenant queda en solo lectura y exportación durante 1 mes con avisos constantes; pasado ese mes pierde el acceso, pero sus datos no se borran salvo que lo solicite (D-33); todo aparece en `AdminAuditLog`.
- F6: sincronizar la cuenta de pruebas de Siigo → cartera con días vencidos y mora → el comercial descarga solo su Excel y el dueño el completo.
- F7: cada reporte devuelve series y filas, y descarga CSV/XLSX respetando el rol.

## 11. Primer paso tras aprobar

1. El dueño de producto marca D-01 a D-08 y responde las preguntas abiertas de `QUESTION.md`.
2. Arranca F0. No se escribe funcionalidad nueva hasta cerrar la puerta de F0.
