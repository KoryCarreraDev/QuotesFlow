# Informe de seguridad de la fase F1

| Campo | Valor |
|---|---|
| Alcance | Diff de F1: ramas `feat/F1-T01` … `feat/F1-T18` (merges 7 a 24), apiladas sobre las ramas de F0 |
| Fecha | 2026-11-16 |
| Autor | Opus (Claude Code) |
| Marcos | OWASP Top 10:2025, OWASP API Security Top 10:2023 |
| Estado | **Pendiente de firma humana** (R10) |

F1 endurece el código existente: configuración, errores, transacciones, autorización, aislamiento, HTTP, logs y auditoría, filtros, borrado suave, responsables de clientes y API versionada. No añade módulos de negocio nuevos.

## Metodología

1. Lectura del diff de cada rama de F1 contra la anterior: casos de uso, repositorios, middleware, configuración, migraciones y esquemas.
2. Comprobación ejecutable: cada corrección convirtió su `itKnownDefect` en test de regresión (R1). Las suites de seguridad recorren todo el inventario de rutas (aislamiento, roles y auditoría) y fallan si una ruta queda sin cubrir.
3. Herramientas: ESLint con `eslint-plugin-security` (sin violaciones congeladas desde F1-T18), `dependency-cruiser`, `pnpm audit`, `prisma migrate diff` contra una base desechable y la prueba de extremo a extremo de la sección 4 con la imagen de producción.

## 1. Hallazgos de la línea base resueltos en F1

| # | Hallazgo (`00-linea-base.md`) | Tarea | Evidencia |
|---|---|---|---|
| H1 | `JWT_SECRET` por defecto | F1-T01 | `parseEnvironment`: obligatorio, 32 caracteres o más; el servidor compilado no arranca sin él (`tests/build`) |
| H3 | Login de cuentas inactivas o borradas | F1-T13 | `findActiveByEmail`; 3 tests de regresión en `api/auth.test.ts` |
| H4 | CORS abierto | F1-T06 | Lista blanca `CORS_ALLOWED_ORIGINS` con credenciales |
| H5 | Todo error era 500 y podía filtrar traza | F1-T02 | Manejador global, formato `{ error: { code, message } }`; 13 tests de regresión |
| H8 | Registro no transaccional | F1-T03 | `ITransactionManager`; test con fallo simulado y con registros simultáneos |
| H9 | Referencias a otro tenant (responsable, empresa cliente) | F1-T13, F1-T16 | Validación de usuario activo y de empresa cliente del tenant |
| H10 | Lecturas de registros borrados | F1-T16 | `findById` y `update` filtran `deleted` |
| H11 | Filtros sin tipo | F1-T02, F1-T12 | `parseFilterQuery` valida por tipo; un objeto `{ "not": … }` ya no llega a Prisma |
| H12 | Autorización dispersa | F1-T04, F1-T17 | `permissionMatrix`, `can`, `scopeFor`; matriz generada en `docs/security/matriz-permisos.md` |
| H13 | Sin logging ni auditoría | F1-T07 | `ILogger` estructurado y `IAuditLogger`; suite que exige auditoría en toda ruta que modifica |
| H14 | Cuerpo de 10 MB | F1-T06 | Límite de 100 kb, 413 |
| H15 | Tablas sin `tenantId` | F1-T10 | Migración; test de esquema: todo `tenantId` NOT NULL con FK |
| H24 | `validateBody` con `any` | F1-T02 | Errores que no son de Zod pasan al manejador global |
| H25 | Prisma registraba consultas con datos | F1-T07 | Fuera de desarrollo solo `warn`/`error`; en desarrollo, SQL sin parámetros |

Parcialmente resuelto: **H6**. Hay límite propio en `/api/v1/auth` y `trust proxy` configurable. Siguen pendientes los contadores compartidos entre instancias (F8) y el bloqueo por cuenta (F2-T03).

Siguen abiertos, asignados a F2/F3: H2, H7, H21, H22 y H23. Los tres defectos conocidos que quedan (`itKnownDefect`) son de H2 y H7.

## 2. Qué se revisó en el diff de F1

| Área | Comprobación | Resultado |
|---|---|---|
| Control de acceso (A01, API1, API5) | Matriz única de permisos, denegación por defecto (rol desconocido, `own` sin usuario). Suites que recorren todo el inventario de rutas: aislamiento entre empresas y permisos por rol, derivados de la matriz. Visibilidad de clientes por responsable (D-18) | Correcto |
| Configuración (A02, A05) | Variables validadas al arrancar, sin secretos por defecto; CORS por lista blanca; `trust proxy` en 0 por defecto (X-Forwarded-For no falsifica la IP); helmet | Correcto |
| Cadena de suministro (A03) | Dependencia nueva `@asteasolutions/zod-to-openapi` 9.1.0, más `openapi3-ts` 4.6.2, solo de desarrollo; las dos con más de dos semanas publicadas. `pnpm audit --prod` sin avisos | Correcto |
| Criptografía (A04) | bcrypt pasa al coste 12 de D-10 (antes 10). Los mensajes de error nunca incluyen valores de variables, URLs con contraseña ni secretos | Correcto |
| Inyección (A05, API8) | Filtros validados por tipo antes de Prisma, orden por lista blanca, `$queryRawUnsafe` prohibido por lint. Única consulta cruda: `SELECT 1` sin parámetros | Correcto |
| Integridad (A08) | Registro, cambio de estado, estados de lead y reordenamiento en transacción. Migraciones verificadas con `prisma migrate diff` y sobre una base con datos | Correcto |
| Logs y auditoría (A09) | Redacción de claves sensibles y credenciales en URLs; `X-Request-Id` validado (8-64 `[A-Za-z0-9-]`) para que no se puedan inyectar líneas de log; auditoría con nombres de campos, nunca valores | Correcto |
| Errores (A10) | Formato único sin trazas; los errores inesperados solo se registran en el servidor | Correcto |
| Consumo de recursos (API4) | Límite de cuerpo, límites de tasa, `in` como mucho de 100 valores y como mucho 20 filtros | Correcto |

## 3. Hallazgos nuevos del diff de F1

| # | Hallazgo | Severidad | Acción |
|---|---|---|---|
| F1-S1 | Fuera de registro, cambio de estado y estados de lead, el registro de auditoría se escribe después de la modificación y no en su transacción. Si esa escritura falla, la modificación queda hecha sin auditoría (responde 500 y se registra en el log técnico) | Baja | F2-T08 |
| F1-S2 | La unicidad del documento de clientes (D-19) la comprueba la aplicación. Dos altas simultáneas con el mismo documento podrían pasar las dos | Baja | F2-T09 |
| F1-S3 | Los contadores de límite de tasa viven en memoria de cada proceso: con varias instancias, cada una cuenta por separado (resto de H6) | Media | Almacén compartido al desplegar (F8). Cupos por defecto en Q-011 |
| F1-S4 | F1-T11 cambia todas las rutas a `/api/v1` sin mantener las anteriores. Cualquier cliente que use las rutas viejas recibe 404 | Baja (operativa) | El frontend debe usar `docs/openapi.json`; desplegar F1 a la vez que el frontend actualizado |
| F1-S5 | Las sondas `/health` y `/ready` cuentan para el límite global de peticiones. Un orquestador que sondee muy seguido puede recibir 429 | Baja | F2-T10 |
| F1-S6 | Tres migraciones nuevas (F1-T10, F1-T14, F1-T17) pendientes en producción | — | Operaciones, con la imagen `migrator` (R6) |

Ninguno es crítico ni alto.

## 4. Verificación de extremo a extremo (sección 10 de `PLAN.md`)

Ejecutada el 2026-11-16 contra la imagen de producción (`docker build --target runtime` y `migrator`), con PostgreSQL 15 en contenedor y `NODE_ENV=production`:

| Comprobación | Resultado |
|---|---|
| `GET /ready` con la base de datos accesible | 200 `{ "status": "ready" }` |
| Migraciones con la imagen `migrator` | Todas aplicadas |
| La empresa B modifica el lead de la empresa A (`PATCH /api/v1/leads/:id`) | 404 |
| La empresa B borra el lead de la empresa A (`DELETE /api/v1/leads/:id`) | 404 `LEAD_NOT_FOUND`; el lead sigue intacto para A |
| La empresa B lista leads | Lista vacía: no ve el de A |
| Error de dominio (estado de otra empresa) | 400 `INVALID_LEAD_STATUS`, sin traza |
| JSON mal formado / ruta inexistente | 400 `MALFORMED_JSON` / 404 `ROUTE_NOT_FOUND` |
| `X-Request-Id` en la respuesta | Presente (UUID) |
| Auditoría | `COMPANY_REGISTERED` (2), `LOGIN_SUCCEEDED` (2), `LEAD_CREATED` (1) |
| Log técnico | Una línea JSON por petición con `requestId`, método, ruta, código y duración |
| SIGTERM (`docker stop`) | Apagado ordenado |

## 5. Puerta de cierre de F1 (sección 3 de `PLAN.md`)

| Condición | Estado |
|---|---|
| Todas las tareas con PR aprobado y fusionado | Pendiente: 18 ramas subidas, con el orden de merge en el título de cada commit desde el 17 (los anteriores, del 7 al 16, en el orden de `PLAN.md`) |
| CI en verde; cobertura dentro del umbral | En local: 988 tests (985 pasan, 3 defectos conocidos). Falta la primera ejecución en GitHub |
| Matrices de aislamiento y de roles actualizadas y en verde | Sí: recorren todo el inventario de rutas (F1-T05) |
| Este informe firmado | Pendiente |
| `CONTEXT.md` refleja el estado real | Sí |
| Documentación de los módulos de la fase | Sí: `docs/modulos/` (auth, leads, estados de lead, contactos, filtrado) y `docs/openapi.json` |
| `QUESTION.md` sin preguntas bloqueantes de la fase | Sí: Q-006 a Q-012 no bloquean |
| Firma de `docs/security/matriz-permisos.md` | Pendiente |

## 6. Firma

`Aprobado por ______ el ____-__-__`
