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

### Q-001 · Idioma de los comentarios del código
- **Fecha:** 2026-11-14
- **Modelo:** planificación
- **Fase / tarea:** R11, F0-T11
- **Bloquea:** No
- **Pregunta:** ¿Los comentarios dentro del código y el JSDoc cuentan como documentación (español) o como código (inglés)?
- **Contexto:** La regla pedida es "documentación en español, el resto en inglés". Los comentarios actuales están en español (por ejemplo en `src/infrastructure/persistence/repositories/BasePrismaRepository.ts`).
- **Opciones:** a) Comentarios y JSDoc en español. b) Comentarios y JSDoc en inglés; solo los `.md` en español.
- **Supuesto mientras tanto:** a) español, como está escrito en R11.
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-002 · Idioma de commits, ramas y PR
- **Fecha:** 2026-11-14
- **Modelo:** planificación
- **Fase / tarea:** R9, R11
- **Bloquea:** No
- **Pregunta:** ¿Mensajes de commit, títulos y descripciones de PR van en español o en inglés?
- **Contexto:** El historial actual está en español (`feat/ soft delete de leads con restricción de tenant y roles`).
- **Opciones:** a) Español (como hoy). b) Inglés.
- **Supuesto mientras tanto:** a) español; nombres de rama en inglés.
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-003 · Idioma de los mensajes de error de la API
- **Fecha:** 2026-11-14
- **Modelo:** planificación
- **Fase / tarea:** F1-T02
- **Bloquea:** No
- **Pregunta:** ¿La API responde errores con un código estable en inglés (`LEAD_NOT_FOUND`) y el frontend traduce, o debe incluir además un mensaje en español listo para mostrar?
- **Contexto:** Hoy los errores mezclan inglés (`Lead not found`) y español (`Campo no permitido para el filtro`).
- **Opciones:** a) Solo código y mensaje técnico en inglés. b) Código en inglés + mensaje en español para el usuario.
- **Supuesto mientras tanto:** a).
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-004 · Acceso a la API de Siigo
- **Fecha:** 2026-11-14
- **Modelo:** planificación
- **Fase / tarea:** F6-T01
- **Bloquea:** Sí (solo F6)
- **Pregunta:** ¿Hay una cuenta de Siigo con acceso a la API (usuario y clave de acceso) para pruebas? ¿Cada empresa conectará su propia cuenta de Siigo?
- **Contexto:** F6 no puede empezar sin contrastar la documentación oficial contra una cuenta real.
- **Opciones:** a) Ya existe cuenta de pruebas. b) Hay que solicitarla.
- **Supuesto mientras tanto:** cada tenant conecta su propia cuenta; F6 queda en espera.
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

### Q-005 · Clientes sin comercial responsable
- **Fecha:** 2026-11-14
- **Modelo:** planificación
- **Fase / tarea:** F1-T17
- **Bloquea:** No
- **Pregunta:** Los contactos y empresas que ya existen no tienen comercial responsable. Al añadir `ownerId`, ¿a quién se asignan?
- **Contexto:** `Contact` y `CompanyContact` no guardan hoy quién los registró (`prisma/schema.prisma`). La cartera depende de ese dato.
- **Opciones:** a) Al dueño (OWNER) del tenant. b) Quedan sin responsable hasta que el dueño o el líder los asigne.
- **Supuesto mientras tanto:** b).
- **Respuesta:** _pendiente_
- **Respondida por / fecha:** _pendiente_

---

## Preguntas respondidas

_Ninguna todavía._
