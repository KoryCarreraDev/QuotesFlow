import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  UNSIGNED_SIGNATURE_LINE,
  regeneratePermissionMatrixDocument,
  renderPermissionMatrixDocument,
  signatureLineOf,
} from '../../../scripts/docs/permissionMatrixDocument.js';

// `docs/security/matriz-permisos.md` se genera desde la matriz de `authorizationPolicy.ts` (F1-T04).
// Si alguien cambia un permiso sin regenerar el documento, el humano que firma la matriz leería otra cosa.
// La línea de firma es lo único que escribe un humano: se conserva mientras la matriz no cambie.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const documentPath = path.join(projectRoot, 'docs/security/matriz-permisos.md');

const SIGNED_LINE = 'Aprobado por KoryCarreraDev el 17-11-2026';

describe('matriz de permisos documentada', () => {
  it('docs/security/matriz-permisos.md coincide con la matriz del código (regenerar con pnpm docs:permissions)', async () => {
    const committedDocument = await readFile(documentPath, 'utf8');
    const committedSignature = signatureLineOf(committedDocument);

    expect(committedSignature).toBeDefined();
    expect(committedDocument).toBe(renderPermissionMatrixDocument(committedSignature));
  });

  it('el documento describe cada acción y conserva la línea de firma', () => {
    const renderedDocument = renderPermissionMatrixDocument();

    expect(renderedDocument).toContain('| `lead:update` |');
    expect(renderedDocument).toContain(UNSIGNED_SIGNATURE_LINE);
  });

  it('un documento firmado sigue coincidiendo con el código', () => {
    const signedDocument = renderPermissionMatrixDocument(SIGNED_LINE);

    expect(signatureLineOf(signedDocument)).toBe(SIGNED_LINE);
  });

  it.each([
    ['sin nombre', 'Aprobado por  el 17-11-2026'],
    ['sin fecha', 'Aprobado por KoryCarreraDev el '],
    ['texto libre', 'Firmado, todo bien'],
  ])('una línea de firma mal escrita (%s) no cuenta como firma', (_case, line) => {
    const document = renderPermissionMatrixDocument().replace(UNSIGNED_SIGNATURE_LINE, line);

    expect(signatureLineOf(document)).toBeUndefined();
  });

  it('regenerar sin cambios en la matriz conserva la firma', () => {
    const signedDocument = renderPermissionMatrixDocument(SIGNED_LINE);

    expect(regeneratePermissionMatrixDocument(signedDocument)).toBe(signedDocument);
  });

  it('regenerar con la matriz cambiada borra la firma: se firmó otra cosa', () => {
    const outdatedSignedDocument = renderPermissionMatrixDocument(SIGNED_LINE).replace(
      '| `lead:update` |',
      '| `lead:update-old` |',
    );

    const regenerated = regeneratePermissionMatrixDocument(outdatedSignedDocument);

    expect(signatureLineOf(regenerated)).toBe(UNSIGNED_SIGNATURE_LINE);
    expect(regenerated).toBe(renderPermissionMatrixDocument());
  });

  it('sin documento previo se genera sin firmar', () => {
    expect(regeneratePermissionMatrixDocument(undefined)).toBe(renderPermissionMatrixDocument());
  });
});
