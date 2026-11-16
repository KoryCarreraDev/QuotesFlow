import { it } from 'vitest';

// Variable de entorno para ver por qué falla hoy cada defecto conocido:
//   bash:        SHOW_KNOWN_DEFECTS=1 pnpm test
//   PowerShell:  $env:SHOW_KNOWN_DEFECTS = '1'; pnpm test
const SHOW_KNOWN_DEFECTS_FLAG = '1';
const shouldRevealKnownDefects = process.env.SHOW_KNOWN_DEFECTS === SHOW_KNOWN_DEFECTS_FLAG;

/**
 * Declara el comportamiento CORRECTO de algo que hoy está mal (un hallazgo de la sección 4 de PLAN.md).
 *
 * No es un test omitido: se ejecuta siempre, y Vitest lo da por bueno solo mientras siga fallando
 * (`it.fails`). El día que el defecto se corrige, este test "falla por pasar" y obliga a convertirlo
 * en un test normal de regresión: cambiar `itKnownDefect(...)` por `it(...)` en el mismo PR del arreglo.
 *
 * Cada defecto conocido debe estar listado en `tests/README.md`.
 *
 * @param findingId Hallazgo o tarea que lo corrige (por ejemplo `H3` o `F1-T14`).
 * @param expectedBehavior Qué debe ocurrir cuando esté corregido.
 */
export function itKnownDefect(findingId: string, expectedBehavior: string, testBody: () => Promise<void> | void): void {
  const title = `[defecto conocido ${findingId}] ${expectedBehavior}`;

  if (shouldRevealKnownDefects) {
    it(title, testBody);
    return;
  }

  it.fails(title, testBody);
}
