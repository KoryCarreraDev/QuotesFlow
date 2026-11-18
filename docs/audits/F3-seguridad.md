# Informe de seguridad de la fase F3

| Campo | Valor |
|---|---|
| Alcance | Diff de F3 (`develop..fix/F3-audit-findings`): T01 a T11 y las correcciones de la auditoría de Opus (`AUDIT.md`) |
| Fecha | 2026-11-18 |
| Autor | Opus (auditoría) y Sonnet (correcciones), Claude Code |
| Marcos | OWASP Top 10:2025, OWASP API Security Top 10:2023, reglas R1 a R15 de `PLAN.md` |
| Estado | **Pendiente de firma humana** (R10) |

F3 añade dinero exacto, productos, fórmulas de precio, cotizaciones (numeración, versiones, estados), el PDF, el logo con almacenamiento de archivos, el envío por correo y la cotización desde un lead. Este informe resume la auditoría y lo que se corrigió; el detalle de cada hallazgo está en `AUDIT.md`.

## Metodología

1. Auditoría de Opus sobre el diff completo de F3 (93 archivos de `src/`, `prisma/` y `scripts/`) contra los dos marcos de OWASP y las reglas de `PLAN.md`.
2. Corrección de cada hallazgo en un commit propio, con el test escrito antes (R1). Los tests existentes que cambiaron por un cambio de comportamiento deseado se nombran en el mensaje del commit (R2).
3. Herramientas: ESLint con `eslint-plugin-security` (cero errores), `dependency-cruiser` (`pnpm arch:check`), `pnpm typecheck`, y las suites de seguridad que recorren todo el inventario de rutas (aislamiento por empresa, permisos por rol, auditoría, atomicidad de la auditoría), ampliadas con las rutas nuevas.
4. Resultado de la suite: **2114** tests en verde, cobertura **98,19 % de sentencias y 93,59 % de ramas** (umbrales: 80 % global, 90 % en `domain` y `application`).

## 1. Hallazgos resueltos

| ID | Hallazgo | Severidad | Corrección |
|---|---|---|---|
| F3-A03 | Borrar el borrador de una revisión dejaba la cotización sin versión activa | Media | Se guarda el estado previo (`supersededFromStatus`, migración `add_superseded_from_status`); descartar la revisión restaura la anterior en la misma transacción, y la versión siguiente usa el mayor número ya usado + 1 |
| F3-A04 | Borrar un borrador no comparaba el estado | Baja | `deleteDraft` con compare-and-swap |
| F3-A05 | Enviar no volvía a comprobar el tope de descuento | Baja | Se comprueba con el tope vigente de quien envía |
| F3-A06 | Los importes de una cotización emitida se recalculaban al leer | Baja | Se leen y se imprimen los importes guardados al emitir |
| F3-A07 | El listado cargaba todos los ítems | Baja | Resumen sin ítems con los totales guardados (cambio de contrato del listado) |
| F3-A10 | La migración no comprobaba las filas antiguas | Baja | Migración nueva `check_quote_rows_before_launch`, probada con filas inválidas |
| F3-A11 | Filtros de importes con `number` (R8) | Baja | Tipo de filtro `money`: texto decimal exacto |
| F3-A12 (parte 1) | El correo salía a datos que el actor no puede ver y la auditoría no decía a quién | Media | Solo clientes visibles; la auditoría guarda `recipientSource` y `emailLogId` |
| F3-A14 | La descarga del PDF no se auditaba (H13) | Media | `QUOTE_PDF_DOWNLOADED` |
| F3-A15 | Generar el PDF no tenía límite de tasa propio | Baja | `RATE_LIMIT_DOCUMENT_MAX_REQUESTS` (20 cada 15 min por IP) para PDF y envío |
| F3-A16 | `pdf-lib` sin mantenimiento | Info | Anotado como deuda (F8-T02); el puerto `IPdfGenerator` aísla el cambio |
| F3-A17 | Multer cargaba el archivo antes de comprobar el permiso | Baja | `requirePermission` antes de leer el cuerpo |
| F3-A18 | En producción arrancaba con almacenamiento en disco por defecto | Media | `FILE_STORAGE_DIRECTORY` obligatoria en producción y comprobación de escritura al arrancar |
| F3-A19 | Dos subidas de logo simultáneas dejaban un archivo huérfano | Baja | La clave anterior sale del mismo cambio, con la fila bloqueada |
| F3-A20 | Borrar una fórmula mientras se asignaba a un producto rompía las cotizaciones (500) | Baja | Bloqueos de fila (`FOR UPDATE` / `FOR SHARE`) dentro de la transacción; fórmula ausente al cotizar = 400 |
| F3-A21 | Cambios de precio, fórmula, IVA y topes sin valor anterior ni nuevo | Baja | `changedValues` en la auditoría, con lista cerrada de campos |
| F3-A22 | Subclase vacía `RejectQuoteUseCase` (R13) | Info | Renombrado |
| F3-A23 | API de pruebas por ngrok accesible directamente | Baja | Guía para cerrar el acceso con un secreto compartido (solo documentación) |

## 2. Qué se revisó sin hallazgos

| Área | Resultado |
|---|---|
| Aislamiento por empresa (A01, API1) | Todos los repositorios nuevos filtran por `tenantWhere()`; las escrituras usan `updateMany` con `tenantId`; cliente, producto y fórmula se buscan en la empresa de la sesión |
| Autorización por objeto (API1, API5) | `own` se comprueba contra `createdById` en cada acción; el listado fuerza el filtro del dueño |
| Numeración | `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` en la transacción del alta: sin huecos ni repetidos |
| Evaluador de fórmulas (A05) | Lista blanca de nodos, topes de tamaño, sin potencia ni funciones peligrosas |
| Logo (A04, A05) | Tipo por contenido (PNG/JPEG), tope de tamaño y medidas, ruta fuera del directorio raíz imposible, clave interna fuera de la API |
| Dependencias (A03) | `pnpm audit --prod` sin avisos |

## 3. Hallazgos abiertos (esperan una decisión humana)

| ID | Hallazgo | Severidad | Pregunta | Recomendada |
|---|---|---|---|---|
| F3-A01 | El tope de descuento por rol se evade cambiando el precio unitario | Media | Q-021 | a) El precio manual por debajo del calculado cuenta para el tope |
| F3-A02 | Un ítem sin producto lleva cualquier precio sin motivo ni auditoría | Media | Q-022 | a) Exigir motivo y auditar |
| F3-A08 | `validUntil` sin fecha máxima | Baja | Q-023 | 365 días |
| F3-A09 | IVA por ítem libre aunque haya uno por defecto | Baja | Q-024 | b) Solo 0, 5 o 19 y con auditoría |
| F3-A12 (parte 2) | `recipientEmail` acepta cualquier dirección | Media | Q-025 | a) Solo los correos del cliente |
| F3-A13 | El correo sale antes de guardar el estado | Baja | Q-029 | b) Reserva con estado `SENDING` |

**Riesgo residual mientras tanto:** los cuatro primeros permiten a un comercial rebajar un precio más allá de su tope sin dejar rastro (A01, A02), dar una vigencia indefinida (A08) o vender sin IVA (A09). A12-2 permite usar el correo de la plataforma para escribir a terceros. Todos requieren un usuario autenticado de una empresa real; recomendamos resolver A01, A02 y A12-2 antes de abrir F5 (pruebas gratuitas).

## 4. Pendiente humano

- Fusionar los PR en orden y re-firmar `docs/security/matriz-permisos.md` (cambió con productos, fórmulas, cotizaciones y logo).
- Aplicar en producción las migraciones de F3 (R6): `add_quote_details`, `check_quote_rows_before_launch`, `add_superseded_from_status`.
- Marcar D-57 y D-58 en `PLAN.md` (F3-P02).
- Cuenta de Cloudflare R2 y adaptador S3 para `IFileStorage` antes de escalar a más de una instancia (Q-017).
- Resend con dominio verificado.
- Revisión visual de un PDF real: en este entorno no se pudo abrir.

## 5. Firma

Aprobado por ______ el ____-__-__
