## Tarea

- **ID:** F<fase>-T<nn>
- **Rama:** `feat/F<fase>-T<nn>-descripcion-en-ingles`
- **Modelo / autor:**
- **Revisión cruzada (D-08):** _modelo que revisó y resultado de `/code-review` y `/security-review`_

## Qué cambia y por qué

_Resumen en español del cambio, la regla de negocio o el hallazgo que resuelve._

## Cómo se verificó

```bash
pnpm typecheck && pnpm lint && pnpm arch:check
pnpm test:coverage
pnpm audit
```

_Pegar el resumen de la salida (número de tests, cobertura)._

## Tests existentes modificados (R2)

- [ ] Este PR **no** modifica, debilita ni borra ningún test existente.
- [ ] Este PR modifica tests existentes; los listo aquí con el motivo y pido aprobación humana expresa:

## Lista de verificación (R1 a R15 de `PLAN.md`)

- [ ] **R1** Tests unitarios, de integración y de API de lo nuevo; todo bug corregido lleva test de regresión.
- [ ] **R2** Sin `.skip`, `.only`, `.todo`, `--no-verify` ni umbrales de cobertura rebajados.
- [ ] **R3** Si toca `src/` o `prisma/`: `CONTEXT.md` actualizado (estado, endpoints, reglas, deuda y línea en "Registro de cambios").
- [ ] **R4** Capas respetadas: `domain` sin dependencias externas, `application` solo `domain`, librerías externas tras un puerto.
- [ ] **R5** Toda consulta filtra por `tenantId` y `deleted`; endpoints nuevos en las matrices de aislamiento y de roles.
- [ ] **R6** Sin merge, sin push a `develop`/`main`, sin migraciones en producción, sin secretos reales.
- [ ] **R7** No depende de decisiones abiertas de la sección 9 de `PLAN.md`.
- [ ] **R8** Entrada validada con Zod, salida por DTO, dinero con decimales exactos, SQL solo parametrizado, secretos por entorno.
- [ ] **R9** Una tarea, una rama, un PR contra `develop`.
- [ ] **R10** Si cierra una fase: informe en `docs/audits/` firmado.
- [ ] **R11** Documentación, comentarios, JSDoc, commits y PR en español; código, ramas, rutas y errores en inglés.
- [ ] **R12** Módulo nuevo: `docs/modulos/<modulo>.md`; JSDoc en puertos, casos de uso y entidades.
- [ ] **R13** Nombres completos y obvios, funciones cortas, sin números ni cadenas mágicas, sin `any`, sin código comentado.
- [ ] **R14** Dudas anotadas en `QUESTION.md` (indicar IDs):
- [ ] **R15** Commits pequeños con el porqué y el para qué en el mensaje.
- [ ] Tarea marcada en `PLAN.md`.
