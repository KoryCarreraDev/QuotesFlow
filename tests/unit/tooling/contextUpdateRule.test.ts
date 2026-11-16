import { describe, expect, it } from 'vitest';

import { evaluateContextUpdate, findFilesRequiringContextUpdate } from '../../../scripts/ci/contextUpdateRule.js';

const CHANGE_LOG_ROW_ADDED = [
  '@@ -290,3 +290,4 @@',
  ' | 2026-11-16 | F0-T02 | pendiente | Framework de tests. |',
  '+| 2026-11-17 | F1-T02 | #40 | Manejador global de errores. |',
].join('\n');

const CONTEXT_EDITED_WITHOUT_CHANGE_LOG_ROW = [
  '@@ -20,1 +20,1 @@',
  '-| Leads | ✅ |',
  '+| Leads | ✅ | Con borrado |',
].join('\n');

describe('regla R3: CONTEXT.md acompaña a los cambios de src/ y prisma/', () => {
  it('solo src/ y prisma/ exigen actualizar CONTEXT.md', () => {
    const changedFiles = ['src/app.ts', 'prisma/schema.prisma', 'tests/api/leads.test.ts', 'docs/README.md'];

    expect(findFilesRequiringContextUpdate(changedFiles)).toEqual(['src/app.ts', 'prisma/schema.prisma']);
  });

  it('un cambio que no toca src/ ni prisma/ cumple sin tocar CONTEXT.md', () => {
    const verdict = evaluateContextUpdate(['docs/guia-de-codigo.md', 'tests/README.md'], '');

    expect(verdict.isCompliant).toBe(true);
  });

  it('un cambio en src/ sin CONTEXT.md no cumple', () => {
    const verdict = evaluateContextUpdate(['src/app.ts'], '');

    expect(verdict.isCompliant).toBe(false);
    expect(verdict.reason).toContain('was not updated');
  });

  it('un cambio en prisma/ con CONTEXT.md pero sin fila nueva en el registro no cumple', () => {
    const verdict = evaluateContextUpdate(
      ['prisma/schema.prisma', 'CONTEXT.md'],
      CONTEXT_EDITED_WITHOUT_CHANGE_LOG_ROW,
    );

    expect(verdict.isCompliant).toBe(false);
    expect(verdict.reason).toContain('change log');
  });

  it('un cambio en src/ con una fila nueva en el registro de CONTEXT.md cumple', () => {
    const verdict = evaluateContextUpdate(['src/app.ts', 'CONTEXT.md'], CHANGE_LOG_ROW_ADDED);

    expect(verdict.isCompliant).toBe(true);
  });

  it('una fila del registro que solo se conserva (sin +) no cuenta como nueva', () => {
    const unchangedRowOnly = ' | 2026-11-16 | F0-T02 | pendiente | Framework de tests. |';

    const verdict = evaluateContextUpdate(['src/app.ts', 'CONTEXT.md'], unchangedRowOnly);

    expect(verdict.isCompliant).toBe(false);
  });
});
