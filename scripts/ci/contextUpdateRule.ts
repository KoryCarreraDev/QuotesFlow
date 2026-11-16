// Regla R3 de PLAN.md: todo cambio en `src/` o `prisma/` llega con `CONTEXT.md` actualizado,
// incluida una línea nueva en su "Registro de cambios".

export const CONTEXT_FILE = 'CONTEXT.md';

const PATHS_THAT_REQUIRE_CONTEXT_UPDATE = ['src/', 'prisma/'];

// Una fila del registro empieza por la fecha: `| 2026-11-16 | F0-T06 | ... |`. En un diff, las añadidas llevan `+`.
const ADDED_CHANGE_LOG_ROW_PATTERN = /^\+\|\s*\d{4}-\d{2}-\d{2}\s*\|/m;

export interface ContextUpdateVerdict {
  isCompliant: boolean;
  filesRequiringContextUpdate: string[];
  reason?: string;
}

export function findFilesRequiringContextUpdate(changedFiles: readonly string[]): string[] {
  return changedFiles.filter((changedFile) =>
    PATHS_THAT_REQUIRE_CONTEXT_UPDATE.some((guardedPath) => changedFile.startsWith(guardedPath)),
  );
}

export function hasNewChangeLogEntry(contextFileDiff: string): boolean {
  return ADDED_CHANGE_LOG_ROW_PATTERN.test(contextFileDiff);
}

export function evaluateContextUpdate(changedFiles: readonly string[], contextFileDiff: string): ContextUpdateVerdict {
  const filesRequiringContextUpdate = findFilesRequiringContextUpdate(changedFiles);
  if (filesRequiringContextUpdate.length === 0) return { isCompliant: true, filesRequiringContextUpdate };

  if (!changedFiles.includes(CONTEXT_FILE)) {
    return { isCompliant: false, filesRequiringContextUpdate, reason: `${CONTEXT_FILE} was not updated` };
  }
  if (!hasNewChangeLogEntry(contextFileDiff)) {
    return {
      isCompliant: false,
      filesRequiringContextUpdate,
      reason: `${CONTEXT_FILE} has no new row in its change log table`,
    };
  }
  return { isCompliant: true, filesRequiringContextUpdate };
}
