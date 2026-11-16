# Auditorías

Informes de auditoría del proyecto (regla R10 y sección 7 de `PLAN.md`). Ninguna fase se cierra sin su informe firmado por un humano.

## Nombres de archivo

| Archivo | Cuándo | Quién |
|---|---|---|
| `00-linea-base.md` | Fase F0 (tarea F0-T10) | Opus, firma humano |
| `F<n>-seguridad.md` | Cierre de cada fase: OWASP Top 10:2025 + OWASP API Top 10:2023 sobre el diff de la fase | Opus, firma humano |
| `ronda-<AAAA-MM-DD>.md` | Cada ronda de dudas y auditoría (sección 2 de `PLAN.md`) | Modelo, revisa humano |
| `F8-*.md` | Verificación ASVS, escaneo dinámico, SBOM | Opus + humano |

## Estructura mínima de un informe

1. Alcance: fase, rango de commits o PR auditados y fecha.
2. Metodología: qué se leyó, qué se ejecutó y con qué herramientas.
3. Hallazgos: tabla con ID, descripción, archivo, categoría OWASP, severidad (crítica, alta, media, baja) y tarea que lo corrige.
4. Hallazgos cerrados desde el informe anterior, con el test de regresión que lo demuestra.
5. Firma: `Aprobado por ______ el ____-__-__`.

Cada hallazgo nuevo se convierte en una tarea de `PLAN.md`.
