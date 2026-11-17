import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { regeneratePermissionMatrixDocument } from './permissionMatrixDocument.js';

// Uso: pnpm docs:permissions
// Reescribe docs/security/matriz-permisos.md desde la matriz del código. La firma se conserva solo si la
// matriz no cambió; si cambió, queda en blanco para que el responsable de seguridad firme de nuevo.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const documentPath = path.join(projectRoot, 'docs', 'security', 'matriz-permisos.md');

async function readPreviousDocument(): Promise<string | undefined> {
  try {
    return await readFile(documentPath, 'utf8');
  } catch {
    return undefined;
  }
}

await writeFile(documentPath, regeneratePermissionMatrixDocument(await readPreviousDocument()), 'utf8');
console.log(`Permission matrix written to ${path.relative(projectRoot, documentPath)}`);
