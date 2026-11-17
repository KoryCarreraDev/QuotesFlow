import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  compiledTemplatesModulePath,
  renderCompiledTemplatesModule,
  templateSourceFiles,
} from '../../../scripts/emails/emailTemplateSources.js';
import { EmailTemplate } from '@/application/ports/services/IEmailTemplateRenderer.js';

// D-28 (F2-T01): las plantillas se escriben en MJML y se compilan a un módulo TS. Si alguien cambia una
// plantilla sin regenerar, el correo que se envía no sería el que se revisó.

const MJML_COMPILE_TIMEOUT_MS = 20_000;

describe('plantillas de correo compiladas', () => {
  it(
    'compiledEmailTemplates.ts coincide con las plantillas MJML (regenerar con pnpm emails:build)',
    async () => {
      const committedModule = await readFile(compiledTemplatesModulePath, 'utf8');

      expect(committedModule).toBe(await renderCompiledTemplatesModule());
    },
    MJML_COMPILE_TIMEOUT_MS,
  );

  it('toda plantilla del enum tiene su archivo MJML', () => {
    expect(Object.keys(templateSourceFiles).sort()).toEqual(Object.values(EmailTemplate).sort());
  });
});
