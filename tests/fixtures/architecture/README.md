# Fixture de arquitectura

Proyecto en miniatura con una violación a propósito de cada regla de `.dependency-cruiser.cjs`.
Lo usa `tests/unit/tooling/architectureRules.test.ts` para comprobar que las reglas de R4 detectan lo que deben.
No es código de la aplicación: `pnpm arch:check` solo analiza `src/`.
