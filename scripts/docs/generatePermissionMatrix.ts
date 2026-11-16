import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPermissionMatrixDocument } from './permissionMatrixDocument.js';

// Uso: pnpm docs:permissions
// Reescribe docs/security/matriz-permisos.md desde la matriz del código.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const documentPath = path.join(projectRoot, 'docs', 'security', 'matriz-permisos.md');

await writeFile(documentPath, renderPermissionMatrixDocument(), 'utf8');
console.log(`Permission matrix written to ${path.relative(projectRoot, documentPath)}`);
