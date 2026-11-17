# Informe de seguridad de la fase F0

| Campo | Valor |
|---|---|
| Alcance | Diff de F0: ramas `feat/test` (F0-T02) y `feat/F0-T01` … `feat/F0-T10` sobre `develop` (`a0b4587`) |
| Fecha | 2026-11-16 |
| Autor | Opus (Claude Code) |
| Marcos | OWASP Top 10:2025, OWASP API Security Top 10:2023 |
| Estado | **Pendiente de firma humana** (R10) |

F0 no añade funcionalidad ni endpoints. El diff es de herramientas (tests, lint, hooks, CI), imágenes Docker y dependencias. Los hallazgos del código de la aplicación están en `00-linea-base.md`.

## 1. Qué se revisó

| Área | Comprobación | Resultado |
|---|---|---|
| Cadena de suministro (A03) | Versiones exactas en las dependencias nuevas, todas con más de dos semanas publicadas; lockfile congelado en Docker y CI | Correcto |
| | Actions de GitHub fijadas por SHA de commit; imágenes `node` y `gitleaks` fijadas por digest | Correcto |
| | `pnpm audit --prod` sin avisos; pnpm fijado a 11.28.10 (las 11.x < 11.11 tienen 3 avisos altos) | Correcto |
| | Scripts de instalación permitidos (`allowBuilds`): se añadió `lefthook`, cuyo `postinstall` solo ejecuta `lefthook install` y no actúa con `CI=true` (código revisado) | Aceptable |
| CI (A01, A02) | `permissions: contents: read`, `persist-credentials: false`, sin `pull_request_target`, sin secretos del repositorio; `github.base_ref` pasa por variable de entorno, no interpolado en el script | Correcto |
| Secretos (A04) | gitleaks sobre los 46 commits del historial: sin hallazgos. `.dockerignore` excluye `.env*`. El compose ya no trae `JWT_SECRET` por defecto | Correcto |
| Imagen Docker (A02) | Usuario `node` (uid 1000), sin pnpm ni compiladores en la imagen final, sin devDependencies, `HEALTHCHECK`, migraciones fuera del arranque (R6) | Correcto |
| Tests (A09 indirecto) | La base de datos de test es efímera; `unit.setup.ts` apunta a una dirección inalcanzable para que un test unitario no toque la base del `.env` | Correcto |
| Calidad como control | Lint de seguridad (`eslint-plugin-security` como error, `$queryRawUnsafe` prohibido), reglas de capas, R2 aplicado por lint, hooks y CI | Correcto |

## 2. Hallazgos del diff de F0

| # | Hallazgo | Severidad | Acción |
|---|---|---|---|
| F0-S1 | La protección de ramas de `develop` y `main` no está configurada: hasta que lo esté, la CI informa pero no bloquea | Alta | **Humano**: marcar como obligatorios los checks `quality`, `tests`, `dependency-audit`, `secret-scan`, `context-updated` y `docker-image`, más 1 aprobación |
| F0-S2 | No hay actualizaciones automáticas de dependencias (npm, GitHub Actions, imagen Docker). Al fijar todo por versión, SHA y digest, sin ellas los parches de seguridad no llegan solos | Media | **Humano**: activar Dependabot o Renovate (tarea humana de F0) |
| F0-S3 | pnpm no tiene configurado un tiempo mínimo de publicación (`minimumReleaseAge`). Una versión maliciosa recién publicada podría entrar en un `pnpm update` | Baja | Decidir en Q-009 |
| F0-S4 | La API corre como PID 1 sin manejador de SIGTERM: sin `--init` no se detiene ordenadamente | Baja | Documentado en `Dockerfile` y `CONTEXT.md`; el apagado ordenado es F1-T08 |
| F0-S5 | `eslint-suppressions.json` congela 77 violaciones heredadas, entre ellas 4 `any` | Baja | Q-008; se vacía en F1-T15 y F1-T18 |

## 3. Puerta de cierre de F0 (sección 3 de `PLAN.md`)

| Condición | Estado |
|---|---|
| Todas las tareas con PR aprobado y fusionado | Pendiente: las ramas esperan PR y revisión humana |
| CI en verde; cobertura dentro del umbral | En local: 483 tests, 98,4 % de sentencias y 93,5 % de ramas. Falta la primera ejecución en GitHub |
| Matrices de aislamiento y roles en verde | En verde (`tests/api/security/`) |
| Este informe firmado | Pendiente de firma |
| `CONTEXT.md` refleja el estado real | Sí |
| Documentación de los módulos de la fase | No aplica: F0 no crea módulos funcionales |
| `QUESTION.md` sin preguntas bloqueantes de la fase | Sí: Q-006, Q-007, Q-008 y Q-009 no bloquean |

## 4. Firma

`Aprobado por Jhonatan el 16-11-2026`
