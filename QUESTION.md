# QUESTION.md — Dudas y preguntas de los modelos

> Regla R14 de `PLAN.md`: un modelo con una duda no supone ni inventa. La escribe aquí y, si la duda bloquea su tarea, toma otra.
> Las preguntas se responden en las rondas de dudas y auditoría. Nunca se borran.

## Cómo usar este archivo

**Modelos:**
1. Antes de preguntar, buscar la respuesta en `CONTEXT.md`, `PLAN.md` (sección 9, decisiones) y en las preguntas ya respondidas aquí.
2. Añadir la pregunta al final de "Preguntas abiertas" con el siguiente ID libre (`Q-001`, `Q-002`, …).
3. Una pregunta por entrada, concreta y con opciones cuando sea posible.
4. Indicar qué se asume mientras no haya respuesta. Si no se puede asumir nada sin riesgo, marcar `Bloquea: Sí`.
5. No responder preguntas propias ni ajenas. No editar ni borrar entradas existentes.

**Humanos (ronda de dudas):**
1. Escribir la respuesta en la entrada, con nombre y fecha.
2. Mover la entrada a "Preguntas respondidas".
3. Si la respuesta es una decisión de producto o de arquitectura, reflejarla en `PLAN.md`.

## Formato de una entrada

```markdown
### Q-000 · Título corto
- **Fecha:** AAAA-MM-DD
- **Modelo:** Opus | Sonnet
- **Fase / tarea:** F0-T00
- **Bloquea:** Sí | No
- **Pregunta:** …
- **Contexto:** qué se encontró y dónde (archivo:línea si aplica)
- **Opciones:** a) … b) …
- **Supuesto mientras tanto:** …
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_
```

---

## Preguntas abiertas

### Q-017 · Proveedor gratuito de almacenamiento de archivos para el MVP (D-26)
- **Fecha:** 2026-11-17
- **Modelo:** Opus
- **Fase / tarea:** F3-T07 (logo), F3-T06 (PDF), D-26
- **Bloquea:** No para el código; sí para desplegar la subida de logo
- **Pregunta:** ¿Qué servicio gratuito se usa para los logos (y, si se guardan, los PDF)?
- **Contexto:** D-26 dice "tipo S3, pero gratuito en el MVP". Crear la cuenta y guardar las claves es tarea humana (R6, operaciones).
- **Opciones:** a) Cloudflare R2: 10 GB gratis, compatible con S3 y sin coste por descarga. b) Backblaze B2: 10 GB gratis, compatible con S3. c) Supabase Storage: 1 GB gratis, API propia.
- **Supuesto mientras tanto:** puerto `IFileStorage` con un adaptador compatible con S3 (sirve para R2, B2 y S3 sin cambiar código) y uno en disco local para desarrollo y tests. Los PDF se generan al pedirlos y no se guardan. Se recomienda a).
- **Respuesta:** a, mientras estemos en desarrollo, en disco local
- **Respondida por / fecha:** KoryCarreraDev, 18/11/2026

### Q-021 · Un precio manual por debajo del calculado, ¿cuenta para el tope de descuento del rol? (D-24, D-25)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T05, F3-A01
- **Bloquea:** No
- **Pregunta:** ¿Un precio manual por debajo del calculado cuenta para el tope de descuento del rol?
- **Contexto:** El tope de D-25 solo mira `discountRate` del ítem y el global. Un comercial (tope 10 %) cotiza un producto de 1.000.000 con `unitPrice: "100000"` y un motivo cualquiera: es un 90 % de descuento real y la API responde 201. La alerta al líder (F4-T06) todavía no existe. `QuoteContentResolver.assertDiscountsWithinRoleLimit`.
- **Opciones:** a) Sí: la rebaja del precio manual se suma al descuento del ítem y al global, y el total no puede pasar el tope; si lo pasa, 403 `DISCOUNT_ABOVE_ROLE_LIMIT`. b) No: el precio manual queda libre (D-24) y solo lo controla la alerta de F4-T06. c) Como a), pero solo hasta que exista la alerta de F4-T06. Recomendada: a).
- **Supuesto mientras tanto:** b) (comportamiento actual). No se programa hasta tener respuesta.
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-022 · ¿Quién puede añadir ítems sin producto del catálogo, y con qué control? (D-24)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T05, F3-A02
- **Bloquea:** No
- **Pregunta:** ¿Quién puede añadir ítems sin producto del catálogo, y con qué control?
- **Contexto:** Un ítem sin `productId` no tiene precio calculado: cualquier `unitPrice` se acepta sin motivo, no se marca como precio cambiado y no deja `QUOTE_PRICE_OVERRIDDEN`. Un comercial puede escribir un producto del catálogo como texto libre con el precio que quiera y así esquivar D-24 (y D-25 si se resuelve Q-021). `QuoteContentResolver.resolveItemData`, `Quote.ts` (`isOverridden`).
- **Opciones:** a) Todos, pero el ítem libre exige `priceOverrideReason` y queda en auditoría (`QUOTE_FREE_ITEM_ADDED`, con las posiciones). b) Solo gestión; para un comercial, 403 `FREE_ITEM_NOT_ALLOWED`. c) Todos, sin control (como hoy, riesgo aceptado). Recomendada: a), y b) si el dueño quiere un catálogo cerrado.
- **Supuesto mientras tanto:** c) (comportamiento actual). No se programa hasta tener respuesta.
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-023 · ¿Cuál es la vigencia máxima de una cotización? (D-23)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T05, F3-A08
- **Bloquea:** No
- **Pregunta:** ¿Cuál es la vigencia máxima de una cotización?
- **Contexto:** `validUntil: "9999-12-31"` crea una cotización que nunca vence y que el cliente puede aceptar con precios de hace años: anula D-23. Hoy solo se exige que no esté en el pasado (`assertValidityNotPast`).
- **Opciones:** a) 365 días desde hoy, en la zona horaria de la empresa. b) 180 días. c) Configurable por empresa en `TenantSettings`. d) Sin máximo (como hoy). Recomendada: a).
- **Supuesto mientras tanto:** d) (comportamiento actual). No se programa hasta tener respuesta.
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-024 · Con IVA por defecto configurado, ¿el comercial puede cambiarlo por ítem? (D-20, Q-020)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T05, F3-A09
- **Bloquea:** No
- **Pregunta:** Con un IVA por defecto configurado por el dueño o el socio, ¿el comercial puede cambiarlo en cada ítem?
- **Contexto:** Con `defaultTaxRate = 19`, un comercial puede enviar `taxRate: "0"` en todos los ítems y no queda rastro en la auditoría. Q-020 dice que "se suma el IVA configurado por el owner o partner". `QuoteContentResolver.resolveItemData` (`input.taxRate ?? profile.defaultTaxRate`).
- **Opciones:** a) No: con IVA por defecto, solo gestión cambia el IVA del ítem. b) Sí, pero solo a 0, 5 o 19 (tasas de Colombia) y las posiciones cambiadas quedan en la auditoría (`taxRateChangedPositions`). c) Libre (como hoy). Recomendada: b).
- **Supuesto mientras tanto:** c) (comportamiento actual). No se programa hasta tener respuesta.
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-025 · ¿`recipientEmail` puede ser cualquier dirección al enviar una cotización por correo? (D-57)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T08, F3-A12
- **Bloquea:** No
- **Pregunta:** ¿`recipientEmail` puede ser cualquier dirección?
- **Contexto:** Cualquier usuario con `quote:send` manda desde el dominio de QuotesFlow un correo con PDF a cualquier dirección. El asunto y el cuerpo llevan el nombre de la empresa, que pone el propio tenant. Con pruebas gratuitas (F5), una empresa falsa podría usarlo para phishing con la reputación del dominio de la plataforma. La parte 1 del hallazgo (solo clientes visibles, origen en la auditoría) ya está corregida.
- **Opciones:** a) Solo los correos del cliente de la cotización; para otro, 400 `QUOTE_RECIPIENT_NOT_ALLOWED`. b) Cualquiera, con un cupo diario de envíos por empresa (por ejemplo 50) y aviso al dueño. c) Cualquiera (como hoy). Recomendada: a) en el MVP, y b) si los comerciales necesitan enviar a terceros.
- **Supuesto mientras tanto:** c) (comportamiento actual). No se programa hasta tener respuesta.
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-026 · ¿Gestión administra los productos y las fórmulas de precio? (D-16, D-17)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T02, F3-T04, F3-P03
- **Bloquea:** No
- **Pregunta:** ¿Solo el dueño, el socio y el líder comercial crean, modifican y borran productos y fórmulas, y el comercial solo los consulta?
- **Contexto:** `product:*` y `formula:*` están en la matriz de permisos como "gestión" por analogía con los estados de lead; nadie lo decidió. `docs/security/matriz-permisos.md` espera firma.
- **Opciones:** a) Sí (como hoy). b) Solo dueño y socio. c) También el comercial crea productos. Recomendada: a).
- **Supuesto mientras tanto:** a).
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-027 · ¿Un comercial ve solo las cotizaciones que creó, o también las de sus clientes? (D-18)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T05, F3-P03
- **Bloquea:** No
- **Pregunta:** ¿El alcance de un comercial sobre las cotizaciones es "las que creó" o "las de los clientes que tiene asignados"?
- **Contexto:** Hoy `own` se mide contra `createdById`. Si un lead o cliente se reasigna a otro comercial, este no ve las cotizaciones que el anterior hizo para él, y el anterior sigue viendo y enviando las suyas (los datos de contacto del cliente se le ocultan en el PDF y ya no recibe correos, F3-A12).
- **Opciones:** a) Las que creó (como hoy). b) Las de los clientes a su cargo. c) Ambas. Recomendada: c), pero cambia el modelo de alcance y la migración de las existentes.
- **Supuesto mientras tanto:** a).
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-028 · Al aceptar una cotización, ¿el lead pasa a ganado solo si se pide? (F3-T09)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T09, F3-P03
- **Bloquea:** No
- **Pregunta:** "Al aceptar, el lead puede pasar a ganado": ¿automático, opcional por petición, o decisión de la empresa?
- **Contexto:** Se implementó `markLeadAsWon` en `POST /quotes/:id/accept`, opcional y desactivado por defecto: lo decide quien acepta. Si falla el permiso sobre el lead, no se acepta nada.
- **Opciones:** a) Opcional por petición, por defecto no (como hoy). b) Siempre al aceptar. c) Ajuste por empresa en `TenantSettings`. Recomendada: a), y c) si las empresas lo piden.
- **Supuesto mientras tanto:** a).
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-029 · ¿Se acepta que el correo de una cotización salga antes de guardar su estado? (D-57)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T08, F3-A13, F3-P03
- **Bloquea:** No
- **Pregunta:** ¿Se mantiene el orden actual (correo y después estado) o se reserva el envío con un estado transitorio?
- **Contexto:** Con el correo activo, dos `POST /send` simultáneos pueden mandar dos correos al cliente, y el que recibe 409 ve un error aunque su correo salió. Documentado en `docs/modulos/cotizaciones.md`. La corrección es un estado `SENDING` (migración `ALTER TYPE "QuoteStatus" ADD VALUE`), con reserva por compare-and-swap, correo fuera de la transacción y limpieza de reservas colgadas por una tarea de F4.
- **Opciones:** a) Mantener el comportamiento y el riesgo documentado. b) Reserva con `SENDING` (más seguro, cambia la máquina de estados y necesita una tarea de limpieza en F4). Recomendada: b) antes de abrir el correo a más empresas.
- **Supuesto mientras tanto:** a). No se programa hasta tener respuesta.
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-030 · ¿Se acepta la validación propia del logo en lugar de la dependencia `file-type`? (D-26)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T07, F3-P03
- **Bloquea:** No
- **Pregunta:** ¿Basta con comprobar a mano la firma PNG/JPEG, el tamaño y las medidas, o se añade `file-type`?
- **Contexto:** `PLAN.md` §6 preveía `file-type`. `domain/value-objects/logoImage.ts` valida solo PNG y JPEG (los formatos que incrusta el PDF) leyendo la cabecera, con tope de 2 MB y 2000 px, sin añadir una dependencia.
- **Opciones:** a) Validación propia (como hoy). b) Añadir `file-type` además. Recomendada: a) mientras solo se admitan PNG y JPEG.
- **Supuesto mientras tanto:** a).
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-031 · ¿Cuál es el cupo de peticiones de PDF y envío de cotizaciones por IP? (API4)
- **Fecha:** 2026-11-18
- **Modelo:** Sonnet
- **Fase / tarea:** F3-T06, F3-T08, F3-A15
- **Bloquea:** No
- **Pregunta:** ¿Son razonables 20 peticiones cada 15 minutos por IP para `GET /quotes/:id/pdf` y `POST /quotes/:id/send`?
- **Contexto:** Se añadió `RATE_LIMIT_DOCUMENT_MAX_REQUESTS` (por defecto 20, compartido entre los dos). Es un supuesto: un equipo comercial detrás de una misma IP (oficina) comparte el cupo, y el límite por IP falla con varias instancias.
- **Opciones:** a) 20 cada 15 minutos (como hoy). b) Más alto, por ejemplo 60. c) Por usuario y no por IP. Recomendada: a) para empezar y c) cuando haya almacén compartido de contadores (F8).
- **Supuesto mientras tanto:** a).
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

---

## Preguntas respondidas

### Q-001 · Idioma de los comentarios del código
- **Fecha:** 2026-11-14
- **Modelo:** planificación
- **Fase / tarea:** R11, F0-T11
- **Bloquea:** No
- **Pregunta:** ¿Los comentarios dentro del código y el JSDoc cuentan como documentación (español) o como código (inglés)?
- **Contexto:** La regla pedida es "documentación en español, el resto en inglés". Los comentarios actuales están en español (por ejemplo en `src/infrastructure/persistence/repositories/BasePrismaRepository.ts`).
- **Opciones:** a) Comentarios y JSDoc en español. b) Comentarios y JSDoc en inglés; solo los `.md` en español.
- **Supuesto mientras tanto:** a) español, como está escrito en R11.
- **Respuesta:** Español en documentacion tipo "#" "//" "<!>" y etc y los JSDoc tambien cuentan como documentación en español
- **Respondida por / fecha:** Developer KoryCarreraDev, 15/11/2026

### Q-002 · Idioma de commits, ramas y PR
- **Fecha:** 2026-11-14
- **Modelo:** planificación
- **Fase / tarea:** R9, R11
- **Bloquea:** No
- **Pregunta:** ¿Mensajes de commit, títulos y descripciones de PR van en español o en inglés?
- **Contexto:** El historial actual está en español (`feat/ soft delete de leads con restricción de tenant y roles`).
- **Opciones:** a) Español (como hoy). b) Inglés.
- **Supuesto mientras tanto:** a) español; nombres de rama en inglés.
- **Respuesta:** Mensajes de commit, títulos y descripciones de PR en español; nombres de rama en inglés
- **Respondida por / fecha:** Developer KoryCarreraDev, 15/11/2026 (corregida 16/11/2026)

### Q-003 · Idioma de los mensajes de error de la API
- **Fecha:** 2026-11-14
- **Modelo:** planificación
- **Fase / tarea:** F1-T02
- **Bloquea:** No
- **Pregunta:** ¿La API responde errores con un código estable en inglés (`LEAD_NOT_FOUND`) y el frontend traduce, o debe incluir además un mensaje en español listo para mostrar?
- **Contexto:** Hoy los errores mezclan inglés (`Lead not found`) y español (`Campo no permitido para el filtro`).
- **Opciones:** a) Solo código y mensaje técnico en inglés. b) Código en inglés + mensaje en español para el usuario.
- **Supuesto mientras tanto:** a).
- **Respuesta:** Opcion A
- **Respondida por / fecha:** Developer KoryCarreraDev, 16/11/2026

### Q-004 · Acceso a la API de Siigo
- **Fecha:** 2026-11-14
- **Modelo:** planificación
- **Fase / tarea:** F6-T01
- **Bloquea:** Sí (solo F6)
- **Pregunta:** ¿Hay una cuenta de Siigo con acceso a la API (usuario y clave de acceso) para pruebas? ¿Cada empresa conectará su propia cuenta de Siigo?
- **Contexto:** F6 no puede empezar sin contrastar la documentación oficial contra una cuenta real.
- **Opciones:** a) Ya existe cuenta de pruebas. b) Hay que solicitarla.
- **Supuesto mientras tanto:** cada tenant conecta su propia cuenta; F6 queda en espera.
- **Respuesta:** Cada tenant conecta su cuenta de siigo, seguir documentacion oficial para desarrollar
- **Respondida por / fecha:** Developer KoryCarreraDev, 16/11/2026

### Q-005 · Clientes sin comercial responsable
- **Fecha:** 2026-11-14
- **Modelo:** planificación
- **Fase / tarea:** F1-T17
- **Bloquea:** No
- **Pregunta:** Los contactos y empresas que ya existen no tienen comercial responsable. Al añadir `ownerId`, ¿a quién se asignan?
- **Contexto:** `Contact` y `CompanyContact` no guardan hoy quién los registró (`prisma/schema.prisma`). La cartera depende de ese dato.
- **Opciones:** a) Al dueño (OWNER) del tenant. b) Quedan sin responsable hasta que el dueño o el líder los asigne.
- **Supuesto mientras tanto:** b).
- **Respuesta:** B
- **Respondida por / fecha:** Developer KoryCarreraDev, 16/11/2026

### Q-006 · Idioma de los títulos de los tests
- **Fecha:** 2026-11-16
- **Modelo:** Fable (Claude Code)
- **Fase / tarea:** F0-T02, R11
- **Bloquea:** No
- **Pregunta:** ¿Los títulos de `describe` e `it` van en español (como documentación del comportamiento) o en inglés (como código)?
- **Contexto:** R11 no menciona los tests. Los títulos son frases que describen reglas de negocio y salen en el reporte de CI; los identificadores de los tests ya están en inglés.
- **Opciones:** a) Títulos en español. b) Títulos en inglés.
- **Supuesto mientras tanto:** a) español. Los 453 tests actuales están escritos así (`tests/README.md`).
- **Respuesta:** Opción a). Títulos de `describe` e `it` en español: son documentación del comportamiento y es como están escritos los tests actuales.
- **Respondida por / fecha:** Decidido por Claude por delegación de KoryCarreraDev, 17/11/2026; pendiente de su confirmación

### Q-007 · Tests de defectos conocidos con `it.fails`
- **Fecha:** 2026-11-16
- **Modelo:** Fable (Claude Code)
- **Fase / tarea:** F0-T02, R2
- **Bloquea:** No
- **Pregunta:** ¿Se acepta `itKnownDefect` (envoltura de `it.fails` de Vitest) para dejar escrito el comportamiento correcto de los hallazgos H2 a H15 antes de corregirlos?
- **Contexto:** R2 prohíbe `.skip` y `.only`. `itKnownDefect` (`tests/support/knownDefect.ts`) no omite nada: el test se ejecuta siempre y solo se da por bueno mientras el defecto exista; al corregirlo, falla y obliga a convertirlo en test de regresión. Hoy hay 30, listados en `tests/README.md`.
- **Opciones:** a) Aceptarlo y, en F0-T03, que el lint prohíba `.skip`/`.only`/`.todo` pero permita `itKnownDefect`. b) Rechazarlo: borrar esos 30 tests y escribirlos cuando se corrija cada hallazgo.
- **Supuesto mientras tanto:** a).
- **Respuesta:** Opción a). Se acepta `itKnownDefect`: no omite nada, se ejecuta siempre y obliga a convertir el test en regresión al corregir el hallazgo. El lint prohíbe `.skip`, `.only` y `.todo`, pero lo permite.
- **Respondida por / fecha:** Decidido por Claude por delegación de KoryCarreraDev, 17/11/2026; pendiente de su confirmación

### Q-008 · Violaciones de lint heredadas congeladas en un archivo de supresiones
- **Fecha:** 2026-11-16
- **Modelo:** Opus
- **Fase / tarea:** F0-T03, R2, R13
- **Bloquea:** No
- **Pregunta:** ¿Se acepta congelar en `eslint-suppressions.json` las 77 violaciones que el código ya tenía, hasta corregirlas en F1-T15 y F1-T18?
- **Contexto:** Con las reglas de R13 el código actual tiene 77 errores: 59 números mágicos (sobre todo códigos HTTP en controllers y números en tests), 6 nombres, 5 variables sin usar, 4 `any` y 3 más. Corregirlos en F0-T03 mezclaría cambios de lógica con la configuración, y F1-T15/F1-T18 ya tienen asignada esa limpieza. ESLint falla si un archivo supera su número congelado, así que el código nuevo no puede añadir violaciones. El archivo está en `CODEOWNERS`.
- **Opciones:** a) Aceptar las supresiones; el archivo solo puede encoger. b) Corregir las 77 antes de fusionar F0-T03. c) Bajar esas reglas a aviso hasta F1.
- **Supuesto mientras tanto:** a).
- **Respuesta:** Opción a). Aceptado y ya resuelto: `eslint-suppressions.json` quedó vacío en F1-T18 y solo puede volver a tener entradas para encoger.
- **Respondida por / fecha:** Decidido por Claude por delegación de KoryCarreraDev, 17/11/2026; pendiente de su confirmación

### Q-009 · Tiempo mínimo de publicación para instalar dependencias
- **Fecha:** 2026-11-16
- **Modelo:** Opus
- **Fase / tarea:** F0 (informe `docs/audits/F0-seguridad.md`, F0-S3)
- **Bloquea:** No
- **Pregunta:** ¿Se configura en `pnpm-workspace.yaml` un `minimumReleaseAge` para que pnpm no instale versiones publicadas hace menos de N días?
- **Contexto:** Las dependencias de F0 se eligieron a mano con más de dos semanas publicadas, pero nada lo impone en un `pnpm update` futuro. Los paquetes comprometidos suelen detectarse y retirarse en pocos días. La contrapartida: un parche de seguridad urgente tardaría N días en poder instalarse, salvo excepción explícita (`minimumReleaseAgeExclude`).
- **Opciones:** a) 7 días. b) 14 días. c) No configurarlo.
- **Supuesto mientras tanto:** c). No se configura sin decisión humana.
- **Respuesta:** Opción c) por ahora: no se configura. Se probó `minimumReleaseAge: 20160` (14 días) el 17/11/2026 y `pnpm install --frozen-lockfile` falla: el `pnpm-lock.yaml` actual tiene 88 versiones publicadas hace menos de 14 días (p. ej. `@rolldown/binding-*` 1.2.19, del 11/11/2026), y con 7 días también falla. Sigue vigente el criterio manual de elegir versiones con más de dos semanas. Reabrir cuando se actualicen las dependencias de F2: entonces fijar 14 días y, si hace falta, `minimumReleaseAgeExclude` solo para esos paquetes.
- **Respondida por / fecha:** Decidido por Claude por delegación de KoryCarreraDev, 17/11/2026; pendiente de su confirmación

### Q-010 · Empezar F1 con la puerta de F0 abierta
- **Fecha:** 2026-11-16
- **Modelo:** Opus
- **Fase / tarea:** F1, sección 11 de `PLAN.md`
- **Bloquea:** No
- **Pregunta:** ¿Se pueden preparar las ramas de F1 mientras la puerta de F0 sigue abierta?
- **Contexto:** La sección 11 dice "No se escribe funcionalidad nueva hasta cerrar la puerta de F0". El 2026-11-16 faltan los PR de F0-T03, T04, T05, T06, T08 y T10, la firma de `docs/audits/00-linea-base.md` y `F0-seguridad.md` y la protección de ramas. F1 no añade funcionalidad: endurece y corrige lo existente. Sus ramas salen de `feat/F0-T10-baseline-audit`, porque necesitan el lint, los hooks y la CI de F0.
- **Opciones:** a) Sí: preparar F1 en ramas apiladas, sin abrir sus PR hasta fusionar F0. b) No: esperar a cerrar la puerta de F0.
- **Supuesto mientras tanto:** a). Ninguna rama de F1 se fusiona antes que las de F0.
- **Respuesta:** Opción a). Sin efecto: las ramas de F0 y F1 ya están fusionadas en `develop`.
- **Respondida por / fecha:** Decidido por Claude por delegación de KoryCarreraDev, 17/11/2026; pendiente de su confirmación

### Q-011 · Cupos de los límites de tasa
- **Fecha:** 2026-11-16
- **Modelo:** Opus
- **Fase / tarea:** F1-T06, H6
- **Bloquea:** No
- **Pregunta:** ¿Qué cupos por IP y ventana de 15 minutos se usan en producción?
- **Contexto:** F1-T06 deja un límite global y otro, más bajo, para `/api/auth` (login y registro), configurables con `RATE_LIMIT_GLOBAL_MAX_REQUESTS` y `RATE_LIMIT_AUTH_MAX_REQUESTS` (`src/config/env.ts`). Por defecto, 100 y 10. Una oficina con muchos comerciales detrás de una misma IP pública comparte cupo; el bloqueo por cuenta llega en F2-T03.
- **Opciones:** a) 100 global y 10 en autenticación. b) Otros valores (indicar cuáles).
- **Supuesto mientras tanto:** a).
- **Respuesta:** Opción a). 100 peticiones globales y 10 en `/api/v1/auth` por IP cada 15 minutos. El bloqueo por cuenta de F2-T03 reduce el problema de las IP compartidas; se revisa con datos reales al desplegar.
- **Respondida por / fecha:** Decidido por Claude por delegación de KoryCarreraDev, 17/11/2026; pendiente de su confirmación

### Q-012 · Borrado de contactos y empresas cliente
- **Fecha:** 2026-11-16
- **Modelo:** Opus
- **Fase / tarea:** F1-T16
- **Bloquea:** No
- **Pregunta:** ¿Quién puede borrar contactos y empresas cliente, y qué pasa con los contactos de una empresa cliente que se borra?
- **Contexto:** El plan pide borrado suave sin fijar permisos. Contactos y empresas aún no tienen responsable (llega en F1-T17), así que "solo los suyos" no se puede aplicar todavía.
- **Opciones:** a) Solo gestión (dueño, socio, líder) borra; una empresa con contactos activos no se borra (409). b) También el comercial; borrar la empresa borra en cascada sus contactos. c) Borrar la empresa deja sus contactos sin empresa.
- **Supuesto mientras tanto:** a). Con F1-T17 se puede revisar si el comercial borra los clientes de los que es responsable.
- **Respuesta:** Opción a). Solo gestión (dueño, socio, líder) borra; una empresa con contactos activos no se borra (409 `COMPANY_CONTACT_HAS_CONTACTS`). Ya implementado en F1-T16; revisar en C-03 si el comercial borra los suyos.
- **Respondida por / fecha:** Decidido por Claude por delegación de KoryCarreraDev, 17/11/2026; pendiente de su confirmación

### Q-013 · Qué hacer si el servicio de contraseñas filtradas no responde
- **Fecha:** 2026-11-17
- **Modelo:** Opus
- **Fase / tarea:** F2-T03, D-11
- **Bloquea:** No
- **Pregunta:** Si Have I Been Pwned no responde a tiempo (3 s), ¿se acepta la contraseña o se rechaza el registro / cambio de contraseña?
- **Contexto:** `PwnedPasswordsChecker` (`src/infrastructure/services/PwnedPasswordsChecker.ts`). Rechazar deja a los usuarios sin poder registrarse ni recuperar su cuenta mientras dure la caída de un servicio ajeno; aceptar deja pasar, solo durante la caída, contraseñas que podrían estar filtradas (siguen exigiéndose 12 caracteres y el bloqueo por cuenta).
- **Opciones:** a) Aceptar y dejar un aviso técnico (`warn`). b) Rechazar con 503 y pedir que se reintente. c) Aceptar y, además, una lista local de las contraseñas más comunes como respaldo.
- **Supuesto mientras tanto:** a).
- **Respuesta:** A
- **Respondida por / fecha:** KoryCarreraDev 17-11-2026

### Q-014 · Aviso alto de `picomatch` sin versión corregida
- **Fecha:** 2026-11-17
- **Modelo:** Opus
- **Fase / tarea:** F2 (informe `docs/audits/F2-seguridad.md`, F2-S7), F0-T06
- **Bloquea:** No (bloquea el job `dependency-audit` de la CI en todas las ramas, también `develop`)
- **Pregunta:** ¿Cómo se trata GHSA-fc5q-39xc-vjpf (ReDoS en `picomatch` ≤ 4.0.7), que no tiene versión corregida y llega solo por `vitest` / `vite` (dependencias de desarrollo)?
- **Contexto:** `pnpm audit --audit-level high` lo reporta desde el 2026-11-17; no lo introduce F2 (ya estaba en `develop`). `pnpm audit --prod` sigue sin avisos: no llega a la imagen de producción. La CI exige cero avisos altos en todo (`.github/workflows/ci.yml`), y bajar ese umbral sin decisión humana está prohibido (R2).
- **Opciones:** a) Ignorar ese aviso concreto en `pnpm-workspace.yaml` (`auditConfig.ignoreGhsas`), con fecha de revisión, hasta que haya versión corregida. b) Esperar a la versión corregida con la CI en rojo. c) Fijar con `overrides` una versión de `picomatch` sin el fallo en cuanto se publique.
- **Supuesto mientras tanto:** no se cambia nada; el riesgo se registra como F2-S7.
- **Respuesta:** b
- **Respondida por / fecha:** KoryCarreraDev 17-11-2026

### Q-015 · Alerta al líder cuando el comercial cambia el precio calculado (D-24)
- **Fecha:** 2026-11-17
- **Modelo:** Opus
- **Fase / tarea:** F3-T05, D-24
- **Bloquea:** No (solo el envío de la alerta)
- **Pregunta:** D-24 permite cambiar a mano el precio calculado con alerta al líder comercial. ¿A quién, por qué canal y cuándo llega la alerta? ¿El motivo del cambio es obligatorio?
- **Contexto:** El modelo no tiene relación entre un comercial y su líder (`User` en `prisma/schema.prisma` no tiene `leaderId`), así que "su líder" hoy significa todos los `SALES_LEADER` activos de la empresa. Las notificaciones in-app y las preferencias de canal llegan en F4 (F4-T03 a F4-T06); el correo transaccional ya existe (F2-T01).
- **Opciones:** a) En F3, correo inmediato a todos los líderes y al dueño. b) En F3 solo se registra (precio calculado, precio manual, motivo, auditoría) y la alerta in-app y por correo llega en F4-T06. c) Añadir un líder por comercial (`leaderId`) y avisar solo a ese.
- **Supuesto mientras tanto:** b), con motivo obligatorio. Cada ítem guarda el precio calculado y el manual; el cambio queda en `AuditLog` y la alerta se suma a F4-T06.
- **Respuesta:** b
- **Respondida por / fecha:** KoryCarreraDev 17-11-2026

### Q-016 · Cómo pasa una cotización a "vencida" antes de tener tareas programadas (D-23)
- **Fecha:** 2026-11-17
- **Modelo:** Opus
- **Fase / tarea:** F3-T05, D-23
- **Bloquea:** No
- **Pregunta:** D-23 pide el estado "vencida" automático al pasar la vigencia. La cola de tareas llega en F4 (F4-T01). ¿Qué se hace en F3?
- **Contexto:** `QuoteStatus` hoy es `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`. La vigencia se compara en la zona horaria de la empresa (`TenantSettings.timezone`, F2-T06).
- **Opciones:** a) F3 añade `EXPIRED` y lo calcula al leer (vigencia pasada → se muestra y se trata como vencida, no se puede aceptar); F4 lo guarda con una tarea diaria y avisa antes de vencer. b) Esperar a F4 para todo lo de vencimiento.
- **Supuesto mientras tanto:** a).
- **Respuesta:** a
- **Respondida por / fecha:** KoryCarreraDev 17-11-2026

### Q-018 · Numeración de las versiones de una cotización (D-22)
- **Fecha:** 2026-11-17
- **Modelo:** Opus
- **Fase / tarea:** F3-T05, D-22
- **Bloquea:** No
- **Pregunta:** Una cotización enviada no se edita: los cambios generan una versión nueva. ¿La versión nueva conserva el número o recibe uno nuevo?
- **Contexto:** F3-T05 pide numeración consecutiva por empresa sin huecos. El número es lo que ve el cliente final en el PDF.
- **Opciones:** a) Mismo número con versión (`COT-000123 v2`); la anterior queda de solo lectura como reemplazada. b) Número nuevo enlazado a la cotización original.
- **Supuesto mientras tanto:** a), con prefijo `COT-` y 6 dígitos.
- **Respuesta:** a
- **Respondida por / fecha:** KoryCarreraDev 17-11-2026

### Q-019 · Alcance y valores por defecto del descuento máximo por rol (D-25)
- **Fecha:** 2026-11-17
- **Modelo:** Opus
- **Fase / tarea:** F3-T05, D-25
- **Bloquea:** No
- **Pregunta:** ¿El descuento se aplica a toda la cotización, a cada ítem o a ambos? ¿Qué topes tiene cada rol mientras el dueño no los configure?
- **Contexto:** `Quote.discount` existe hoy como un único valor. D-16 da a `PARTNER` los permisos de `OWNER`.
- **Opciones:** a) Solo descuento porcentual sobre el subtotal de la cotización. b) Descuento por ítem además del global. Topes por defecto: c) `SALES_REP` 10 %, `SALES_LEADER` 20 %, `OWNER` y `PARTNER` sin tope. d) Todos 0 % hasta que el dueño los configure.
- **Supuesto mientras tanto:** a) y c), configurables por el dueño y el socio en `TenantSettings`.
- **Respuesta:** b y topes del c
- **Respondida por / fecha:** KoryCarreraDev 17-11-2026

### Q-020 · Tasas de IVA permitidas y si los precios incluyen IVA (D-20)
- **Fecha:** 2026-11-17
- **Modelo:** Opus
- **Fase / tarea:** F3-T02, F3-T05, D-20
- **Bloquea:** No
- **Pregunta:** D-20 pide IVA de Colombia por defecto y configurable al cotizar. ¿Se permite cualquier tasa o solo las colombianas? ¿El precio de producto y el de fórmula son antes de IVA?
- **Contexto:** En Colombia las tasas vigentes son 19 % (general), 5 % (reducida) y 0 % (exento o excluido).
- **Opciones:** a) Solo 19 %, 5 % y 0 %, con 19 % por defecto. b) Cualquier tasa entre 0 % y 100 %. Precios: c) siempre antes de IVA. d) Configurable por producto.
- **Supuesto mientras tanto:** a) y c).
- **Respuesta:** Se cotiza antes de iba luego se le suma el IVA configurado por el owner o partner, mientras no se configure, lo pide a la hora de cotizar
- **Respondida por / fecha:** KoryCarreraDev 17-11-2026
