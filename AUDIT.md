# AUDIT.md — Auditoría de la fase F3 (productos, fórmulas y cotizaciones)

| Campo | Valor |
|---|---|
| Alcance | Diff de F3 (`develop..feat/F3-T09-quote-from-lead`, la punta de la pila): T01 a T11, 93 archivos de `src/`, `prisma/`, `scripts/` |
| Fecha | 2026-11-18 |
| Autor | Opus (Claude Code) |
| Marcos | OWASP Top 10:2025, OWASP API Security Top 10:2023, reglas R1 a R15 de `PLAN.md` |
| Estado | Hallazgos abiertos. **Nada está corregido**: este archivo es la guía para que Sonnet los corrija |

Este informe no sustituye a `docs/audits/F3-seguridad.md` (R10). Cuando los hallazgos estén resueltos, su contenido pasa a ese informe para la firma humana.

## Cómo trabajar esta auditoría (para Sonnet)

1. Lee `CONTEXT.md` (secciones 5 y 6), `docs/modulos/cotizaciones.md` y este archivo completo antes de tocar código.
2. Trabaja en una rama nueva sobre la punta de la pila, `fix/F3-audit-findings` desde `feat/F3-T09-quote-from-lead`. No reescribas las ramas apiladas: un commit por hallazgo, con el ID en el mensaje (`fix/ F3-A01 ...`, en español, con el porqué, R15).
3. Los hallazgos marcados **Requiere decisión** no se programan sin respuesta (R7, R14). Primero escribe la pregunta en `QUESTION.md` con el formato del archivo y el ID libre siguiente (hoy, `Q-021`). Incluye las opciones y la recomendada que da este informe. Después pasa a otro hallazgo.
4. Cada corrección lleva primero su test, que falla antes del cambio y pasa después (R1). No debilites ni borres tests existentes (R2). Si un test existente tiene que cambiar, dilo en el commit.
5. Al terminar cada hallazgo: `pnpm typecheck && pnpm lint && pnpm arch:check && pnpm test`. Actualiza `CONTEXT.md` (reglas y registro de cambios, R3) y el `docs/modulos/*.md` afectado (R12).
6. Si cambias la matriz de permisos, regenera `docs/security/matriz-permisos.md` con `pnpm docs:permissions`. Si cambias un esquema Zod, regenera `docs/openapi.json`.
7. Cuando termines un hallazgo, marca su casilla en la tabla de resumen.

Orden sugerido: primero los de severidad Media que no requieren decisión (A03, A12 parte 1, A14, A18), después los Baja, y al final los que dependan de respuestas.

## Resumen

Ninguno es crítico ni alto. Severidad: **Media** = rompe una regla de negocio o de seguridad acordada, o es explotable por un usuario autenticado. **Baja** = carrera poco probable, defensa en profundidad o consumo de recursos. **Info** = deuda o calidad.

| Hecho | ID | Tarea | Hallazgo | Severidad | Decisión |
|---|---|---|---|---|---|
| [ ] | F3-A01 | T05 | El tope de descuento por rol (D-25) se evade cambiando el precio unitario | Media | Requiere decisión |
| [ ] | F3-A02 | T05 | Un ítem sin producto lleva cualquier precio sin motivo ni auditoría (evade D-24) | Media | Requiere decisión |
| [x] | F3-A03 | T05 | Borrar el borrador de una versión nueva deja la cotización sin versión activa | Media | No |
| [x] | F3-A04 | T05 | Borrar un borrador no compara el estado: puede borrar una cotización recién enviada | Baja | No |
| [x] | F3-A05 | T05 | Revisar y enviar no vuelven a comprobar el tope de descuento | Baja | No |
| [x] | F3-A06 | T05 | Los importes de una cotización enviada se recalculan al leer en vez de leerse de la instantánea | Baja | No |
| [x] | F3-A07 | T05 | El listado carga hasta 100 cotizaciones con hasta 200 ítems cada una | Baja | No |
| [ ] | F3-A08 | T05 | `validUntil` no tiene fecha máxima | Baja | Requiere decisión (valor) |
| [ ] | F3-A09 | T05 | El comercial pone cualquier IVA por ítem aunque la empresa tenga uno configurado, sin auditoría | Baja | Requiere decisión |
| [x] | F3-A10 | T05 | La migración no comprueba que las filas antiguas cumplan las reglas nuevas | Baja | No |
| [x] | F3-A11 | T01, T02, T05 | Los filtros de importes (`total`, `basePrice`, `estimatedValue`) usan `number` (R8) | Baja | No |
| [ ] | F3-A12 | T08 | El correo de la cotización sale a cualquier dirección y la auditoría no guarda a quién | Media | Parte 2 requiere decisión |
| [ ] | F3-A13 | T08 | El correo sale antes de guardar el estado: duplicados y correo enviado con estado sin cambiar | Baja | No |
| [x] | F3-A14 | T06 | La descarga del PDF no queda en auditoría (incumple F1-T07, H13) | Media | No |
| [x] | F3-A15 | T06, T08 | Generar el PDF es caro y no tiene un límite de tasa propio | Baja | No |
| [x] | F3-A16 | T06 | `pdf-lib` 1.17.1 no tiene mantenimiento desde 2021 | Info | No |
| [x] | F3-A17 | T07 | Multer carga el archivo en memoria antes de comprobar el permiso | Baja | No |
| [x] | F3-A18 | T07 | En producción arranca con almacenamiento en disco por defecto, que la imagen no puede escribir | Media | No |
| [x] | F3-A19 | T07 | Dos subidas de logo simultáneas dejan un archivo huérfano | Baja | No |
| [x] | F3-A20 | T02, T04 | Borrar una fórmula mientras se asigna a un producto rompe las cotizaciones de ese producto (500) | Baja | No |
| [x] | F3-A21 | T02, T04, T05 | Cambios de precio, fórmula, IVA y topes se auditan sin valor anterior ni nuevo | Baja | No |
| [x] | F3-A22 | T09 | `RejectQuoteUseCase` es un alias vacío de `DecideQuoteUseCase` (R13) | Info | No |
| [x] | F3-A23 | T11 | La API de pruebas, pública por ngrok, corre con `NODE_ENV=development` y admite `X-Forwarded-For` falso | Baja | No |
| [ ] | F3-P01 | Proceso | Ramas 8 a 12 sin subir, `QUESTION.md` sin commit, sin informe F3 ni firma de la matriz | — | Humano |
| [ ] | F3-P02 | Proceso | T10 y T11 se programaron con D-57 y D-58 sin marcar (R7) | — | Humano |
| [x] | F3-P03 | Proceso | Supuestos de producto sin entrada en `QUESTION.md` (R14) | — | Sonnet escribe las preguntas |

### Estado de la corrección (rama `fix/F3-audit-findings`, 2026-11-18)

- **Corregidos** (un commit por hallazgo, con su test): A03, A04, A05, A06, A07, A10, A11, A14, A15, A16, A17, A18, A19, A20, A21, A22 y A23. A12 parte 1 también; su parte 2 sigue abierta.
- **Esperan respuesta, sin tocar el código** (R7, R14): A01 → Q-021, A02 → Q-022, A08 → Q-023, A09 → Q-024, A12 parte 2 → Q-025.
- **A13 (correo antes de guardar el estado)**: queda como riesgo documentado y se pregunta si se hace la reserva con `SENDING` (Q-029), como permite el hallazgo. Cambia la máquina de estados y necesita una tarea de limpieza en F4.
- **P03**: escritas Q-026 a Q-031 (los cinco supuestos más el cupo de documentos de A15).
- **P01 y P02**: son humanos. Ver el resumen del PR.
- Desviaciones: A18 no añade `FILE_STORAGE_PROVIDER` (un enum con un solo valor no aporta nada hasta que exista el adaptador S3); A12 enlaza la auditoría con `EmailLog` por `emailLogId` en vez de copiar el correo; A10 es una migración nueva (`check_quote_rows_before_launch`) porque `add_quote_details` ya se aplicó en local; A03 añade la migración `add_superseded_from_status`.

---

## T01 · Dinero exacto (`Money`, `Percentage`)

Revisado sin hallazgos propios: `Money` guarda centavos en `bigint`, rechaza notación científica, separadores y más de 15 cifras enteras; `Percentage` limita de 0 a 100 con dos decimales; el redondeo es mitad hacia arriba y está probado. H21 queda resuelto en `Lead`. El único resto de `number` en importes está en los filtros: ver **F3-A11**.

## T02 · Catálogo de productos

Ver **F3-A11** (filtro `basePrice`), **F3-A20** (fórmula borrada) y **F3-A21** (auditoría sin valores). Los permisos de gestión son un supuesto sin pregunta: ver **F3-P03**.

## T03 · Evaluador de fórmulas

Revisado sin hallazgos. Se analiza el árbol con lista blanca de nodos (sin `AccessorNode`, `ArrayNode`, asignaciones ni cadenas), hay tope de 500 caracteres y 100 nodos, no hay potencia ni factorial, y las funciones peligrosas están deshabilitadas. Se probó a mano (2026-11-18): `round(a, 999999999999999)`, `min()`, una multiplicación de 8 factores de 15 cifras y una división por cero responden `FORMULA_EVALUATION_FAILED` en menos de 5 ms. Un resultado negativo lo rechaza `QuoteItem` con 400 `INVALID_MONEY_AMOUNT`.

## T04 · Fórmulas (CRUD)

Ver **F3-A20** y **F3-A21**.

## T05 · Cotizaciones

### F3-A01 · T05: el tope de descuento por rol se evade cambiando el precio unitario

- **Severidad:** Media. OWASP API6:2023 (flujo de negocio sensible), A01:2025.
- **Dónde:** `src/application/use-case/quotes/QuoteContentResolver.ts:91-103` (`assertDiscountsWithinRoleLimit`) y `:113-140` (`resolveItemData`).
- **Problema:** el tope de D-25 solo mira `discountRate` del ítem y el global. El precio manual de D-24 (`unitPrice` distinto del calculado) no cuenta como descuento.
- **Escenario:** un `SALES_REP` (tope 10 %) cotiza un producto de 1.000.000 con `unitPrice: "100000"` y `priceOverrideReason: "x"`. Es un 90 % de descuento real, y la API responde 201. La alerta al líder (F4-T06) todavía no existe, así que nadie se entera.
- **Requiere decisión (Q-021).** Pregunta para `QUESTION.md`: "¿Un precio manual por debajo del calculado cuenta para el tope de descuento del rol?" Opciones:
  - a) Sí: la rebaja del precio manual se suma al descuento del ítem y al global, y el total no puede pasar el tope. Si lo pasa, 403 `DISCOUNT_ABOVE_ROLE_LIMIT`.
  - b) No: el precio manual queda libre (D-24), y solo lo controla la alerta de F4-T06.
  - c) Como a), pero solo hasta que exista la alerta de F4-T06.
  - **Recomendada: a).**
- **Solución si la respuesta es a):**
  1. Añade al dominio, en `Quote.ts` o en un helper de `money.ts`, el cálculo del descuento efectivo de un ítem con precio calculado: `1 − neto / (precio calculado × cantidad)`. Exprésalo en `Percentage`, redondeado hacia arriba a puntos básicos para que el redondeo no ayude a evadir el tope. Sin precio calculado no se aplica (ver F3-A02).
  2. En `assertDiscountsWithinRoleLimit`, compara ese descuento efectivo con el tope, no solo `item.discountRate.combinedWith(global)`.
  3. Un precio manual **más alto** que el calculado no es descuento: el efectivo se queda en 0 o negativo y no bloquea.
- **Tests:** unitarios del cálculo efectivo (precio rebajado, precio subido, con y sin descuentos); caso de uso: un comercial con un precio manual al 85 % responde `DISCOUNT_ABOVE_ROLE_LIMIT`, y el dueño pasa; API: `POST /quotes` → 403.
- **Docs:** `docs/modulos/cotizaciones.md` (reglas de descuento) y `CONTEXT.md` §6.

### F3-A02 · T05: un ítem sin producto lleva cualquier precio sin motivo ni auditoría

- **Severidad:** Media. API6:2023, A09:2025.
- **Dónde:** `QuoteContentResolver.ts:113-118` y `src/domain/entities/Quote.ts:80` (`isOverridden` exige `calculatedUnitPrice`).
- **Problema:** sin `productId` no hay precio calculado. Cualquier `unitPrice` se acepta sin `priceOverrideReason`, no se marca `isPriceOverridden` y no deja `QUOTE_PRICE_OVERRIDDEN`.
- **Escenario:** un comercial escribe el producto del catálogo como texto libre (`description: "Ventana 1x1"`) con el precio que quiera. Así esquiva D-24 (motivo y alerta) y, con F3-A01 corregido, también D-25.
- **Requiere decisión (Q-022).** Pregunta para `QUESTION.md`: "¿Quién puede añadir ítems sin producto del catálogo, y con qué control?" Opciones:
  - a) Todos, pero el ítem libre exige `priceOverrideReason` y queda en auditoría (`QUOTE_FREE_ITEM_ADDED`, con las posiciones).
  - b) Solo gestión. Para un comercial, 403 `FREE_ITEM_NOT_ALLOWED`.
  - c) Todos, sin control (como hoy, documentado como riesgo aceptado).
  - **Recomendada: a)**, y b) si el dueño quiere un catálogo cerrado.
- **Solución con a):**
  1. En `QuoteItem`, el ítem sin `productId` exige motivo (nuevo código `FREE_ITEM_REASON_REQUIRED`, o reutiliza `PRICE_OVERRIDE_REASON_REQUIRED`).
  2. Guarda el motivo en `priceOverrideReason`. Hoy solo se guarda si hay override, ver `Quote.ts:90`.
  3. En `QuoteUseCases.ts`, `recordPriceOverrides` también registra las posiciones libres. Hazlo con una acción nueva en `AuditAction` (`IAuditLogger.ts`) o con un campo `freeItemPositions` en la misma metadata.
- **Tests:** dominio (ítem libre sin motivo → error); caso de uso (la auditoría lleva las posiciones libres); API.
- **Docs:** `cotizaciones.md`, `CONTEXT.md`, OpenAPI (descripción de `priceOverrideReason` en `quoteSchema.ts:327`).

### F3-A03 · T05: borrar el borrador de una versión nueva deja la cotización sin versión activa

- **Severidad:** Media (integridad del negocio). A08:2025.
- **Dónde:** `QuoteUseCases.ts:335-347` (`DeleteQuoteUseCase`), `Quote.ts:341-364` (`revise`, `assertDeletable`).
- **Problema:** revisar deja la v1 en `SUPERSEDED` y crea la v2 en `DRAFT`. La v2 se puede borrar. Después, la v1 sigue `SUPERSEDED`, no se puede revisar (`revise` solo acepta `SENT`/`REJECTED`) y la v2 borrada sigue ocupando `(tenantId, number, version)` en el índice único. El número `COT-000123` queda congelado para siempre.
- **Solución (sin decisión; la opción 1 respeta D-22 y Q-018):**
  - **Opción 1 (recomendada).** Borrar un borrador con `previousVersionId` restaura la anterior al estado que tenía antes de revisarla, en la misma transacción y con compare-and-swap (`saveState(previous, SUPERSEDED)`). Para eso hay que guardar el estado previo. Añade `supersededFromStatus QuoteStatus?` en `Quote`: es una migración nueva, `add_superseded_from_status`, que se aplica en producción por Operaciones (R6). Audita `QUOTE_REVISION_DISCARDED`.
  - **Opción 2.** Prohibir borrar un borrador con versión anterior: 409 `QUOTE_REVISION_NOT_DELETABLE`. Es más simple, pero el borrador queda colgado sin poder quitarlo.
  - El siguiente `revise` sobre la v1 restaurada calcula `version + 1 = 2`, que choca con la v2 borrada (el índice único incluye las borradas). Usa `max(version) + 1` del número, leído en la transacción, en vez de `this.version + 1`.
- **Tests:** caso de uso e integración: revisar → borrar v2 → la v1 vuelve a `SENT`/`REJECTED` → revisar otra vez crea la v3 sin error de unicidad. Añade también el test de auditoría (`auditAtomicity` ya recorre la ruta).
- **Docs:** `cotizaciones.md` (ciclo de vida), `CONTEXT.md` §6 y §7 (migración).

### F3-A04 · T05: borrar un borrador no compara el estado

- **Severidad:** Baja. A04:2025 (diseño, carrera).
- **Dónde:** `PrismaQuoteRepository.ts:181-183` (`delete` usa `softDeleteRegister` sin condición de estado); `QuoteUseCases.ts:336-337` comprueba `assertDeletable` antes de la transacción.
- **Escenario:** `DELETE /quotes/:id` y `POST /quotes/:id/send` a la vez. Los dos leen `DRAFT`, el envío guarda `SENT` y el borrado la marca `DELETED`. Una cotización enviada (y quizá ya en el correo del cliente) desaparece.
- **Solución:** añade a `IQuoteRepository` el método `deleteDraft(quoteId): Promise<boolean>`, con `updateMany({ where: { id, ...tenantWhere(), status: DRAFT }, data: { deleted: DELETED, updatedAt } })` y `count === 1`. En el caso de uso, si devuelve `false`, lanza `ConflictError(QUOTE_NOT_EDITABLE)`. Mantén `InMemoryQuoteRepository` (tests) con el mismo comportamiento.
- **Tests:** integración del repositorio (no borra una `SENT`); unitario del caso de uso con el doble.

### F3-A05 · T05: revisar y enviar no vuelven a comprobar el tope de descuento

- **Severidad:** Baja. API6:2023.
- **Dónde:** `QuoteUseCases.ts:393-412` (`SendQuoteUseCase`) y `:596-612` (`ReviseQuoteUseCase`).
- **Escenario:** el dueño baja el tope del comercial del 10 % al 5 %. Un borrador del comercial con 10 % creado antes se envía igual. O bien un líder edita la cotización de un comercial con un 20 %, y el comercial la revisa y la envía como suya con el 20 %.
- **Solución:** en `SendQuoteUseCase.execute`, antes de `markSent`, llama `contentResolver.assertDiscountsWithinRoleLimit(actor, profile, quote.discountRate, quote.items)`: hay que inyectar `QuoteContentResolver` en el caso de uso y en `QuoteModule.ts`. En `ReviseQuoteUseCase` no hace falta: la versión nueva es un borrador y el envío la comprobará.
- **Tests:** unitario: con el tope bajado, enviar responde 403 `DISCOUNT_ABOVE_ROLE_LIMIT`; el dueño sigue pudiendo enviar.

### F3-A06 · T05: los importes de una cotización enviada se recalculan al leer

- **Severidad:** Baja. A08:2025 (integridad de documentos emitidos).
- **Dónde:** `QuoteMapper.ts` (`toQuoteDTO` llama a `quote.totals()` e `item.amounts()`), `QuotePdfUseCase.ts:112-137`, y `PrismaQuoteRepository.ts:28-40` (lee `unitPrice` y las tasas, pero ignora `netAmount`, `taxAmount`, `total` y los totales guardados).
- **Problema:** F3-T05 pide la instantánea guardada. Si mañana cambia el redondeo de `Money` o el orden de los descuentos, las cotizaciones ya enviadas o aceptadas mostrarían otro total en la API y en el PDF.
- **Solución:**
  1. Lee del registro los importes guardados (`netAmount`, `taxAmount`, `total` del ítem; `subtotal`, `discountTotal`, `taxTotal`, `total` de la cotización) y pásalos a `Quote.restore`.
  2. Para todo estado distinto de `DRAFT`, el DTO y el PDF usan los guardados. El borrador puede seguir calculando.
  3. Alternativa mínima: un test de integración que compruebe que, para cada cotización guardada, lo calculado coincide con lo guardado. Detecta el cambio, pero no protege.
- **Tests:** integración: guarda una cotización `SENT`, cambia a mano en la base un `total` de ítem y comprueba que la API devuelve el guardado.

### F3-A07 · T05: el listado carga todos los ítems de cada cotización

- **Severidad:** Baja. API4:2023 (consumo de recursos).
- **Dónde:** `PrismaQuoteRepository.ts:196-207` (`findFiltered` con `include: quoteInclude`); la página máxima es 100 (`BasePrismaRepository.ts:12`) y cada cotización admite 200 ítems.
- **Escenario:** `GET /quotes/search?limit=100` en una empresa con cotizaciones grandes construye 20.000 ítems, con su cálculo de importes, en una sola petición.
- **Solución:** el listado devuelve un resumen sin ítems (`QuoteSummaryDTO`: id, referencia, estados, cliente, vigencia y totales guardados, ver F3-A06). `GET /quotes/:id` sigue con los ítems. Es un cambio de contrato: avísalo en el PR y actualiza OpenAPI.
- **Tests:** API: el listado no trae `items`; el detalle sí.

### F3-A08 · T05: `validUntil` no tiene fecha máxima

- **Severidad:** Baja. API6:2023.
- **Dónde:** `QuoteUseCases.ts:104-108` (`assertValidityNotPast`) y `quoteSchema.ts:304-307`.
- **Escenario:** `validUntil: "9999-12-31"` crea una cotización que nunca vence y que el cliente puede aceptar con precios de hace años. Eso anula D-23.
- **Requiere decisión del valor (Q-023):** "¿Cuál es la vigencia máxima de una cotización?" Recomendado: 365 días desde hoy, en la zona horaria de la empresa.
- **Solución:** constante `MAXIMUM_VALIDITY_DAYS` en `QuoteUseCases.ts`. `assertValidityNotPast` pasa a `assertValidityInRange(validUntil, today)`, con el error `INVALID_VALIDITY_DATE`.
- **Tests:** unitario y API con `today + 366`.

### F3-A09 · T05: el IVA por ítem es libre aunque la empresa tenga uno configurado

- **Severidad:** Baja (riesgo fiscal). API6:2023.
- **Dónde:** `QuoteContentResolver.ts:124` (`input.taxRate ?? profile.defaultTaxRate`).
- **Problema:** con `defaultTaxRate = 19`, un comercial puede mandar `taxRate: "0"` en todos los ítems. No queda rastro en la auditoría, y Q-020 dice que "se suma el IVA configurado por el owner o partner".
- **Requiere decisión (Q-024):** "Con IVA por defecto configurado, ¿el comercial puede cambiarlo por ítem?" Opciones:
  - a) No: con IVA por defecto, solo gestión cambia el IVA del ítem.
  - b) Sí, pero solo a 0, 5 o 19 (tasas de Colombia) y queda en auditoría.
  - c) Libre (como hoy).
  - **Recomendada: b).**
- **Solución con b):** valida la tasa contra una lista en `domain` (`COLOMBIAN_VAT_RATES`). Si difiere de `defaultTaxRate`, añade las posiciones a la metadata de auditoría (`taxRateChangedPositions`).

### F3-A10 · T05: la migración no comprueba que las filas antiguas cumplan las reglas nuevas

- **Severidad:** Baja (operativa, antes de producción).
- **Dónde:** `prisma/migrations/20261117180000_add_quote_details/migration.sql` y `Quote.ts:194-204` / `:74-79` (las invariantes se comprueban también al **leer**, en `restore` y en el constructor de `QuoteItem`).
- **Problema:** una cotización antigua sin lead, contacto ni empresa, o un ítem con `quantity = 0` (la migración ya contempla `NULLIF("quantity", 0)`), hace que `toQuote` lance `ValidationError`. Como el listado mapea todas las filas, `GET /quotes/search` responde 400 para toda la empresa.
- **Solución:** añade al bloque `DO $$` inicial la detención con mensaje claro si hay `Quote` sin ninguno de los tres clientes o `QuoteItem` con `quantity < 1`, como ya se hace con `discount`. No edites la migración si ya se aplicó en algún entorno compartido: en ese caso crea una migración nueva que solo compruebe. Pregunta a Operaciones antes (R6) y deja la consulta de comprobación en `PROGRESO-F3.md` (pendiente humano).
- **Tests:** el test de migraciones (`tests/integration/schema/`) con una fila antigua inválida espera el fallo.

### F3-A11 · T01, T02, T05: los filtros de importes usan `number` (R8)

- **Severidad:** Baja. A06:2025 (diseño inseguro de datos), incumple R8.
- **Dónde:** `quoteFilterConfig.ts:15` (`total`), `productFilterConfig.ts:8-9` (`basePrice`), `leadFilterConfig.ts:42-43` (`estimatedValue`); `parseFilterQuery.ts:26` (`z.number().finite()`).
- **Problema:** el valor del filtro llega como `number` de JSON: `0.1`, `1e15` o importes con céntimos pierden exactitud al compararse con la columna `Decimal`.
- **Solución:** añade el tipo de filtro `money` en `IFilterFieldConfig` y `parseFilterQuery`: acepta texto que cumpla `isNonNegativeMoneyText` y lo pasa a Prisma como texto (Prisma acepta `string` para `Decimal`). Cambia los tres campos a `money`. Documéntalo en `docs/modulos/filtrado.md`.
- **Tests:** unitario de `parseFilterQuery` (texto válido, `number` rechazado con 400 `INVALID_FILTER_VALUE`); API: filtrar `total gte "1000000.50"`.

## T06 · PDF de la cotización

### F3-A14 · T06: la descarga del PDF no queda en auditoría

- **Severidad:** Media (incumple una regla acordada). A09:2025.
- **Dónde:** `src/application/use-case/quotes/QuotePdfUseCase.ts:72-80`. `CONTEXT.md` §6 dice "se genera al pedirlo, no se guarda ni se audita", pero F1-T07 (`PLAN.md`) y H13 exigen auditar "toda mutación, evento de auth y **descarga**".
- **Solución:**
  1. Inyecta `IAuditLogger` en `GenerateQuotePdfUseCase`. En `execute`, no en `renderQuote`, que también usa el envío, registra `QUOTE_PDF_DOWNLOADED` (nueva en `AuditAction`), con `entityId: quoteId` y `metadata: { version }`.
  2. No hace falta transacción: no hay escritura de negocio. Regístralo **después** de generar el PDF, para no auditar descargas que fallaron.
  3. Actualiza `CONTEXT.md` §6 ("se audita como `QUOTE_PDF_DOWNLOADED`") y `cotizaciones.md`.
- **Tests:** unitario (queda el evento); API: `auditTrail.test.ts` ya recorre el inventario, así que añade el escenario de `GET /quotes/:id/pdf` si la suite lo pide.

### F3-A15 · T06, T08: generar el PDF es caro y no tiene un límite de tasa propio

- **Severidad:** Baja. API4:2023.
- **Dónde:** `quoteRoutes.ts` (`GET /:id/pdf`, `POST /:id/send`); `PdfLibQuoteGenerator.ts:241-245` incrusta el logo (hasta 2 MB y 2000 × 2000 px) y pdf-lib decodifica el PNG en JavaScript en cada petición.
- **Escenario:** un usuario autenticado pide el PDF de una cotización de 200 ítems en bucle. Solo lo frena el cupo global (100 cada 15 min por IP), y cada petición ocupa el hilo de Node.
- **Solución:**
  1. Crea un limitador propio con `createRateLimiter` (por ejemplo `RATE_LIMIT_DOCUMENT_MAX_REQUESTS`, por defecto 20 cada 15 min). Valídalo en `env.ts` y aplícalo a `GET /quotes/:id/pdf` y `POST /quotes/:id/send`. El valor por defecto es un supuesto: anótalo en `QUESTION.md` como Q no bloqueante.
  2. Opcional: al subir el logo (T07), reescálalo para que el PDF no decodifique 2000 px. Eso necesita una librería de imágenes, así que es una decisión humana: déjalo anotado y no lo hagas.
- **Tests:** API: la petición número N+1 responde 429.

### F3-A16 · T06: `pdf-lib` 1.17.1 sin mantenimiento

- **Severidad:** Info. A03:2025 (cadena de suministro).
- **Dónde:** `package.json` (`"pdf-lib": "^1.17.1"`), sin versiones nuevas desde 2021. `pnpm audit --prod` hoy no avisa de nada.
- **Solución:** no la cambies. Añade la entrada a la sección de deuda de `CONTEXT.md` ("revisar en F8-T02 junto al SBOM; alternativa mantenida: el fork `@pdfme/pdf-lib`"). El puerto `IPdfGenerator` ya aísla el cambio.

## T07 · Logo y almacenamiento de archivos

### F3-A17 · T07: multer carga el archivo antes de comprobar el permiso

- **Severidad:** Baja. API4:2023.
- **Dónde:** `src/presentation/routes/tenantRoutes.ts:39`: `receiveLogoUpload` va antes del caso de uso, que es quien comprueba `tenant:update`.
- **Escenario:** cualquier comercial autenticado hace que el servidor lea 2 MB en memoria por petición, antes de recibir el 403.
- **Solución:** crea un middleware pequeño `requirePermission(Action.TENANT_UPDATE)` en `src/infrastructure/web/middleware/`. Responde 403 `INSUFFICIENT_PERMISSIONS` usando `can(req.user)` y va antes de `receiveLogoUpload`. Mantén la comprobación del caso de uso (defensa en profundidad). Las capas lo permiten: `infrastructure` importa `application`.
- **Tests:** API: un `SALES_REP` que envía 2 MB recibe 403 sin leer el cuerpo. Basta comprobar el 403 y que `UploadTenantLogoUseCase` no se llama.

### F3-A18 · T07: en producción arranca con almacenamiento en disco por defecto

- **Severidad:** Media (configuración). A02:2025.
- **Dónde:** `src/config/env.ts:90` y `:229` (`FILE_STORAGE_DIRECTORY` con valor por defecto `storage` en cualquier entorno). `PROGRESO-F3.md` ya avisa de que la imagen de producción no tiene carpeta escribible.
- **Problema:** en producción la subida de logo falla con 500 en tiempo de ejecución, en vez de fallar al arrancar. Además, con varias instancias, cada una tendría su propio disco y el logo "desaparecería" según la instancia.
- **Solución:**
  1. En el esquema de producción de `env.ts`, sigue el patrón de `EMAIL_PROVIDER`. Añade `FILE_STORAGE_PROVIDER` (`local` | `s3`, hoy solo `local`). En `NODE_ENV=production`, exige que `FILE_STORAGE_DIRECTORY` venga **explícito**, sin valor por defecto, y documenta que debe ser un volumen montado.
  2. Al arrancar, comprueba que la carpeta es escribible: crea y borra un archivo temporal. Si no lo es, sal con un mensaje claro.
  3. Deja anotado en `PROGRESO-F3.md` y en el pendiente humano que el adaptador S3/R2 (Q-017) sigue faltando antes de varias instancias.
- **Tests:** `tests/unit/config/environment.test.ts`: producción sin `FILE_STORAGE_DIRECTORY` falla; desarrollo usa `storage`.

### F3-A19 · T07: dos subidas simultáneas dejan un archivo huérfano

- **Severidad:** Baja. API4:2023 (almacenamiento que crece sin control).
- **Dónde:** `src/application/use-case/tenant/TenantLogoUseCases.ts:68`: `previousKey` se lee fuera de la transacción.
- **Escenario:** las subidas A y B leen el mismo `previousKey`. A confirma su clave y borra la anterior; B confirma la suya y borra otra vez la anterior. El archivo de A queda en disco sin referencia.
- **Solución:** dentro de la transacción, haz que `updateLogoKey` devuelva la clave que había justo antes. Usa `UPDATE ... RETURNING` con `$queryRaw` parametrizado, o lee con `SELECT ... FOR UPDATE` antes de cambiarla. Después de confirmar, borra **esa** clave.
- **Tests:** unitario con el doble del repositorio: dos subidas seguidas sin confirmar la primera borran los dos archivos anteriores correctos.

**Revisado sin hallazgos en T07:** la ruta del archivo no sale del directorio raíz (`LocalDiskFileStorage.pathFor`, segmentos en lista blanca y comprobación de prefijo); el tipo se decide por el contenido; la clave no sale por la API; `nosniff` lo pone helmet y el `Content-Type` sale de la extensión de la clave, no del cliente; multer tiene límite de partes, campos y tamaño. Queda la deuda de la versión: `multer` 2.5.0 no tiene avisos.

## T08 · Enviar la cotización por correo

### F3-A12 · T08: el correo sale a cualquier dirección y la auditoría no guarda a quién

- **Severidad:** Media. API6:2023, A09:2025.
- **Dónde:** `QuoteUseCases.ts:451-469` (`resolveRecipient` acepta `recipientEmail` libre) y `:402-410` (la auditoría `QUOTE_SENT` solo guarda `{ emailed }`).
- **Problema:**
  1. Cualquier usuario con `quote:send` manda desde el dominio de QuotesFlow un correo con PDF a cualquier dirección. El asunto y el cuerpo llevan el nombre de la empresa, que pone el propio tenant (`PATCH /tenant`). Cuando haya pruebas gratuitas (F5), una empresa falsa puede usarlo para phishing con la reputación del dominio de la plataforma.
  2. Si un cliente se reasigna a otro comercial, el comercial original todavía envía la cotización al correo de ese cliente. `resolveRecipient` no comprueba que el actor pueda ver el contacto, aunque el PDF sí oculta sus datos (`describeCustomer`).
  3. La auditoría no registra el destinatario: no se puede saber a quién salió un documento comercial.
- **Solución, parte 1 (sin decisión):**
  - Añade a la metadata de `QUOTE_SENT` el destinatario y su origen: `{ emailed, recipientSource: 'explicit' | 'contact' | 'company' | 'lead' }`. Para el correo mismo, confirma primero si `EmailLog` ya guarda el destinatario: si lo guarda, enlaza con `emailLogId`; si no, guarda el correo en la auditoría, porque es un dato de negocio de la empresa.
  - En `resolveRecipient`, usa solo los correos del contacto, empresa o lead que el actor **puede ver** (`can(..., LIST, { ownerUserId })`), igual que `describeCustomer` en `QuotePdfUseCase.ts:159-185`.
- **Parte 2. Requiere decisión (Q-025):** "¿`recipientEmail` puede ser cualquier dirección?" Opciones:
  - a) Solo los correos del cliente de la cotización. Para otro, 400 `QUOTE_RECIPIENT_NOT_ALLOWED`.
  - b) Cualquiera, con un cupo diario de envíos por empresa (por ejemplo 50) y aviso al dueño.
  - c) Cualquiera (como hoy).
  - **Recomendada: a) en el MVP**, y b) si los comerciales necesitan enviar a terceros.
- **Tests:** unitario: la metadata lleva el origen; un comercial con el contacto reasignado y sin `recipientEmail` recibe `QUOTE_RECIPIENT_REQUIRED`. API según la respuesta a Q-025.

### F3-A13 · T08: el correo sale antes de guardar el estado

- **Severidad:** Baja (ya documentada en `cotizaciones.md` y en `PROGRESO-F3.md`).
- **Dónde:** `QuoteUseCases.ts:393-412`.
- **Escenario:** dos `POST /send` simultáneos con el correo activo. Los dos envían el correo y uno recibe 409 por el compare-and-swap. El cliente recibe dos correos, y el que recibió 409 ve un error aunque su correo salió.
- **Solución (reserva con compare-and-swap):**
  1. Añade el estado transitorio `SENDING`. Es una migración: `ALTER TYPE "QuoteStatus" ADD VALUE 'SENDING'`, que aplica Operaciones (R6).
  2. Primera transacción: `saveState(DRAFT → SENDING)`. Solo una petición gana; la otra recibe 409 sin enviar nada.
  3. Envía el correo fuera de la transacción.
  4. Segunda transacción: `SENDING → SENT` y la auditoría. Si el correo falla, `SENDING → DRAFT` y 503 `QUOTE_EMAIL_FAILED`.
  5. Un `SENDING` que se quede colgado (el proceso cae entre los pasos): `displayStatus` lo muestra como `DRAFT` pasados N minutos, y F4 lo limpia con una tarea. Anótalo en `PLAN.md`, en F4.
  - Es un cambio de máquina de estados: si te parece demasiado para el MVP, anota la alternativa en `QUESTION.md` y deja el comportamiento actual documentado como riesgo aceptado.
- **Tests:** unitario con dos ejecuciones intercaladas (el doble del repositorio): un solo `emailSender.send`.

## T09 · Cotización desde un lead

### F3-A22 · T09: `RejectQuoteUseCase` es un alias vacío de `DecideQuoteUseCase`

- **Severidad:** Info. R13 (nombres que dicen lo que hacen).
- **Dónde:** `QuoteUseCases.ts:473-496` y `:569-578`. `DecideQuoteUseCase` solo rechaza, y su JSDoc lo dice, pero su nombre sugiere aceptar o rechazar. La subclase solo repite el constructor.
- **Solución:** renombra `DecideQuoteUseCase` a `RejectQuoteUseCase`, borra la subclase y ajusta `QuoteModule.ts` y los tests. La acción de política `quote:decide` se mantiene: cubre aceptar y rechazar.

**Revisado sin hallazgos en T09:** el lead de la ruta manda sobre el del cuerpo (`createQuoteFromLeadSchema` lo omite y el caso de uso lo fija). Mover el lead a ganado va en la misma transacción que aceptar y usa `ChangeLeadStatusUseCase`, con su permiso y su historial. Un lead no abierto no se mueve.

## T10 · Canal de correo por empresa

Sin hallazgos de código: `emailDeliveryEnabled` es `false` por defecto, solo lo cambian dueño y socio, y los correos de la cuenta no dependen de él. Ver **F3-P02**: D-57 sigue sin marcar.

## T11 · Entorno de pruebas (Vercel + ngrok)

### F3-A23 · T11: la API de pruebas, pública por ngrok, corre en modo desarrollo y admite `X-Forwarded-For` falso

- **Severidad:** Baja (solo entorno de pruebas). A02:2025, A07:2025.
- **Dónde:** `docs/despliegue-pruebas.md:51` (`NODE_ENV=development`), `:56-58` (`TRUST_PROXY=2`) y `:84-86` (riesgo ya anotado). La URL de ngrok está publicada en el repositorio (`PLAN.md` D-58).
- **Problema:** cualquiera que conozca la URL llama a ngrok directamente: se salta el límite por IP falseando `X-Forwarded-For` y habla con una API en modo desarrollo, donde `env.ts` relaja las exigencias de producción.
- **Solución (solo documentación y configuración, sin código):**
  1. En la guía, añade una política de tráfico de ngrok (`--traffic-policy-file`) que solo deje pasar peticiones con una cabecera secreta (por ejemplo `x-proxy-secret`). Vercel la añade en `rewrites` → `headers`. El secreto vive en variables de entorno de Vercel y de ngrok, nunca en el repositorio.
  2. Indica de forma explícita: datos de prueba, `JWT_SECRET` distinto del de producción y cuentas de prueba.
  3. No cambies `NODE_ENV` sin decisión humana: con `production`, `EMAIL_PROVIDER=log` no está permitido.

---

## Transversal: T02, T04 y T05

### F3-A20 · T02, T04: borrar una fórmula mientras se asigna a un producto rompe sus cotizaciones

- **Severidad:** Baja. A04:2025 (carrera de comprobación y uso).
- **Dónde:** `FormulaUseCases.ts:155-170` (`isUsedByProducts` fuera de la transacción) y `ProductUseCases.ts:85` y `:120` (`assertFormulaBelongsToTenant` fuera de la transacción). La consecuencia aparece en `QuoteContentResolver.ts:158`: `throw new Error('Formula of the product not found')`, que responde 500.
- **Escenario:** el líder A borra la fórmula F mientras el líder B la asigna al producto P. Las dos comprobaciones pasan, P queda apuntando a una fórmula borrada y cada cotización con P responde 500.
- **Solución:**
  1. Mueve las dos comprobaciones **dentro** de `runInTransaction` y bloquea la fila de la fórmula con `SELECT ... FOR UPDATE` (`$queryRaw` parametrizado) en `IFormulaRepository.lockById` / `IProductRepository`. Así dos transacciones sobre la misma fórmula se ordenan.
  2. Además, en `QuoteContentResolver.priceFromProduct`, una fórmula ausente responde `ValidationError(PRODUCT_NOT_AVAILABLE)` (400) en vez de `Error` (500). No es una invariante interna: puede pasar por datos.
- **Tests:** integración con dos transacciones intercaladas (hay ejemplos en las pruebas de numeración de `PrismaQuoteRepository.test.ts`); unitario del resolver con fórmula ausente → 400.

### F3-A21 · T02, T04, T05: los cambios sensibles se auditan sin valor anterior ni nuevo

- **Severidad:** Baja. A09:2025.
- **Dónde:** `ProductUseCases.ts` (`PRODUCT_UPDATED` con `changedFields`), `FormulaUseCases.ts:128-136` (`FORMULA_UPDATED`) y `TenantProfileUseCases.ts:60-63` (`TENANT_UPDATED`, que ahora incluye `defaultTaxRate` y los topes de descuento).
- **Problema:** se sabe que cambió `basePrice`, `expression`, `maximumDiscountRateSalesRep` o `defaultTaxRate`, pero no de qué a qué. Subir el tope del comercial al 100 % y volver a bajarlo no deja rastro útil.
- **Solución:** para esos campos, y solo esos (no hay datos personales), añade a la metadata `{ field: { from, to } }` como texto decimal o la expresión. Hazlo con un helper en `IAuditLogger.ts` (`changedValues(before, after, fields)`), con la lista de campos explícita. Nunca copies el objeto entero.
- **Tests:** unitarios de los tres casos de uso: la metadata lleva `from` y `to`.

---

## Proceso (R1 a R15)

### F3-P01 · Ramas sin subir, dudas sin commit, sin informe ni firma

- **Reglas:** R10, R15.
- **Estado:** `feat/F3-T05` a `feat/F3-T09` solo están en local (`git branch -vv` no muestra remoto). `QUESTION.md` tiene las respuestas de Q-017 sin commit. No existe `docs/audits/F3-seguridad.md`. La firma de la matriz de permisos quedó obsoleta con `product:*`, `formula:*`, `quote:*` y el logo.
- **Acción:** humana. Sonnet **no** sube ramas a `develop` (R6). Cuando termine `fix/F3-audit-findings`, prepara `docs/audits/F3-seguridad.md` con el formato de `F2-seguridad.md`, a partir de este archivo.

### F3-P02 · T10 y T11 se programaron con D-57 y D-58 sin marcar

- **Regla:** R7. `PLAN.md` §9.7 tiene D-57 y D-58 con "falta marcarla", y las tareas ya están hechas.
- **Acción:** humana: marcar D-57 y D-58. Sonnet no las marca (R6).

### F3-P03 · Supuestos de producto sin entrada en `QUESTION.md`

- **Regla:** R14. Estos supuestos están en `PLAN.md`, `CONTEXT.md` o `PROGRESO-F3.md`, pero no como pregunta:
  1. Permisos de productos y fórmulas: gestión los administra (F3-T02, F3-T04).
  2. Un comercial solo ve las cotizaciones que **creó**, no las de sus clientes; el comercial nuevo de un lead reasignado no ve las cotizaciones de ese lead.
  3. `markLeadAsWon` es opcional y por defecto no mueve el lead (F3-T09).
  4. El correo sale antes de guardar el estado (ver F3-A13).
  5. Validación propia del logo en lugar de `file-type` (D-26, `PLAN.md` §6).
- **Acción para Sonnet:** escribe una entrada por supuesto en "Preguntas abiertas" (`Bloquea: No`), con el supuesto actual como "Supuesto mientras tanto". No cambies el código.

---

## Revisado sin hallazgos

| Área | Comprobación |
|---|---|
| Aislamiento por tenant (A01, API1) | Todos los repositorios nuevos filtran por `tenantWhere()`; las escrituras usan `updateMany` con `tenantId`; el cliente, el producto y la fórmula de una cotización se buscan en la empresa de la sesión; las suites de cobertura incluyen las rutas nuevas |
| Autorización por objeto (API1, API5) | `findAllowedQuote` comprueba `own` contra `createdById` en cada acción; el listado fuerza el filtro del dueño (`GenericListFilteredUseCase`) |
| Numeración (F3-T05) | `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` dentro de la transacción del alta: sin huecos ni repetidos |
| Máquina de estados | `saveState` compara y cambia el estado; `saveContent` solo pisa un `DRAFT` |
| Inyección (A05) | SQL crudo solo con plantillas (`$queryRaw`); fórmulas con lista blanca de nodos; texto del PDF filtrado a WinAnsi; plantilla de correo escapada (F2) |
| Datos sensibles (API3) | El DTO de cotización no lleva tenant ni borrado; la clave del logo no sale por la API; el PDF oculta los datos del cliente que el actor no puede ver |
| Dependencias (A03) | `pnpm audit --prod` sin avisos (2026-11-18): `multer` 2.5.0, `mathjs` 15.2.0, `pdf-lib` 1.17.1 (ver F3-A16) |
