// Comprobación de R3 en la CI: `pnpm check:context <rama-base>` (por defecto `origin/develop`).
// Compara la rama actual con la base y falla si se tocó `src/` o `prisma/` sin actualizar CONTEXT.md.

import { execFileSync } from 'node:child_process';

import { CONTEXT_FILE, evaluateContextUpdate } from './contextUpdateRule.js';

const DEFAULT_BASE_REF = 'origin/develop';
const FAILURE_EXIT_CODE = 1;

function runGit(gitArguments: string[]): string {
  return execFileSync('git', gitArguments, { encoding: 'utf8' });
}

const baseRef = process.argv[2] ?? DEFAULT_BASE_REF;
// Tres puntos: solo los cambios de esta rama desde que se separó de la base.
const comparedRange = `${baseRef}...HEAD`;

const changedFiles = runGit(['diff', '--name-only', comparedRange]).split('\n').filter(Boolean);
const contextFileDiff = runGit(['diff', comparedRange, '--', CONTEXT_FILE]);

const verdict = evaluateContextUpdate(changedFiles, contextFileDiff);

if (verdict.isCompliant) {
  console.log(
    `R3 OK: ${verdict.filesRequiringContextUpdate.length} file(s) in src/ or prisma/ changed against ${baseRef}.`,
  );
} else {
  console.error(`R3 failed: ${verdict.reason}. Files in src/ or prisma/ changed:`);
  for (const changedFile of verdict.filesRequiringContextUpdate) console.error(`  - ${changedFile}`);
  process.exit(FAILURE_EXIT_CODE);
}
