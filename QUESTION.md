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

### Q-006 · Idioma de los títulos de los tests
- **Fecha:** 2026-11-16
- **Modelo:** Fable (Claude Code)
- **Fase / tarea:** F0-T02, R11
- **Bloquea:** No
- **Pregunta:** ¿Los títulos de `describe` e `it` van en español (como documentación del comportamiento) o en inglés (como código)?
- **Contexto:** R11 no menciona los tests. Los títulos son frases que describen reglas de negocio y salen en el reporte de CI; los identificadores de los tests ya están en inglés.
- **Opciones:** a) Títulos en español. b) Títulos en inglés.
- **Supuesto mientras tanto:** a) español. Los 453 tests actuales están escritos así (`tests/README.md`).
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-007 · Tests de defectos conocidos con `it.fails`
- **Fecha:** 2026-11-16
- **Modelo:** Fable (Claude Code)
- **Fase / tarea:** F0-T02, R2
- **Bloquea:** No
- **Pregunta:** ¿Se acepta `itKnownDefect` (envoltura de `it.fails` de Vitest) para dejar escrito el comportamiento correcto de los hallazgos H2 a H15 antes de corregirlos?
- **Contexto:** R2 prohíbe `.skip` y `.only`. `itKnownDefect` (`tests/support/knownDefect.ts`) no omite nada: el test se ejecuta siempre y solo se da por bueno mientras el defecto exista; al corregirlo, falla y obliga a convertirlo en test de regresión. Hoy hay 30, listados en `tests/README.md`.
- **Opciones:** a) Aceptarlo y, en F0-T03, que el lint prohíba `.skip`/`.only`/`.todo` pero permita `itKnownDefect`. b) Rechazarlo: borrar esos 30 tests y escribirlos cuando se corrija cada hallazgo.
- **Supuesto mientras tanto:** a).
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-008 · Violaciones de lint heredadas congeladas en un archivo de supresiones
- **Fecha:** 2026-11-16
- **Modelo:** Opus
- **Fase / tarea:** F0-T03, R2, R13
- **Bloquea:** No
- **Pregunta:** ¿Se acepta congelar en `eslint-suppressions.json` las 77 violaciones que el código ya tenía, hasta corregirlas en F1-T15 y F1-T18?
- **Contexto:** Con las reglas de R13 el código actual tiene 77 errores: 59 números mágicos (sobre todo códigos HTTP en controllers y números en tests), 6 nombres, 5 variables sin usar, 4 `any` y 3 más. Corregirlos en F0-T03 mezclaría cambios de lógica con la configuración, y F1-T15/F1-T18 ya tienen asignada esa limpieza. ESLint falla si un archivo supera su número congelado, así que el código nuevo no puede añadir violaciones. El archivo está en `CODEOWNERS`.
- **Opciones:** a) Aceptar las supresiones; el archivo solo puede encoger. b) Corregir las 77 antes de fusionar F0-T03. c) Bajar esas reglas a aviso hasta F1.
- **Supuesto mientras tanto:** a).
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-009 · Tiempo mínimo de publicación para instalar dependencias
- **Fecha:** 2026-11-16
- **Modelo:** Opus
- **Fase / tarea:** F0 (informe `docs/audits/F0-seguridad.md`, F0-S3)
- **Bloquea:** No
- **Pregunta:** ¿Se configura en `pnpm-workspace.yaml` un `minimumReleaseAge` para que pnpm no instale versiones publicadas hace menos de N días?
- **Contexto:** Las dependencias de F0 se eligieron a mano con más de dos semanas publicadas, pero nada lo impone en un `pnpm update` futuro. Los paquetes comprometidos suelen detectarse y retirarse en pocos días. La contrapartida: un parche de seguridad urgente tardaría N días en poder instalarse, salvo excepción explícita (`minimumReleaseAgeExclude`).
- **Opciones:** a) 7 días. b) 14 días. c) No configurarlo.
- **Supuesto mientras tanto:** c). No se configura sin decisión humana.
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-010 · Empezar F1 con la puerta de F0 abierta
- **Fecha:** 2026-11-16
- **Modelo:** Opus
- **Fase / tarea:** F1, sección 11 de `PLAN.md`
- **Bloquea:** No
- **Pregunta:** ¿Se pueden preparar las ramas de F1 mientras la puerta de F0 sigue abierta?
- **Contexto:** La sección 11 dice "No se escribe funcionalidad nueva hasta cerrar la puerta de F0". El 2026-11-16 faltan los PR de F0-T03, T04, T05, T06, T08 y T10, la firma de `docs/audits/00-linea-base.md` y `F0-seguridad.md` y la protección de ramas. F1 no añade funcionalidad: endurece y corrige lo existente. Sus ramas salen de `feat/F0-T10-baseline-audit`, porque necesitan el lint, los hooks y la CI de F0.
- **Opciones:** a) Sí: preparar F1 en ramas apiladas, sin abrir sus PR hasta fusionar F0. b) No: esperar a cerrar la puerta de F0.
- **Supuesto mientras tanto:** a). Ninguna rama de F1 se fusiona antes que las de F0.
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

