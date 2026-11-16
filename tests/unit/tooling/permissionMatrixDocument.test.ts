import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderPermissionMatrixDocument } from '../../../scripts/docs/permissionMatrixDocument.js';

// `docs/security/matriz-permisos.md` se genera desde la matriz de `authorizationPolicy.ts` (F1-T04).
// Si alguien cambia un permiso sin regenerar el documento, el humano que firma la matriz leería otra cosa.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const documentPath = path.join(projectRoot, 'docs/security/matriz-permisos.md');

describe('matriz de permisos documentada', () => {
  it('docs/security/matriz-permisos.md coincide con la matriz del código (regenerar con pnpm docs:permissions)', async () => {
    const committedDocument = await readFile(documentPath, 'utf8');

    expect(committedDocument).toBe(renderPermissionMatrixDocument());
  });

  it('el documento describe cada acción y conserva la línea de firma', () => {
    const renderedDocument = renderPermissionMatrixDocument();

    expect(renderedDocument).toContain('| `lead:update` |');
    expect(renderedDocument).toContain('Aprobado por ______ el ____-__-__');
  });
});
