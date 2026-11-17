import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mjml2html from 'mjml';
import { EmailTemplate } from '../../src/application/ports/services/IEmailTemplateRenderer.js';

// D-28: las plantillas de correo se escriben en MJML para no mantener a mano HTML compatible con Gmail,
// Outlook, Apple Mail y Yahoo. MJML solo se usa aquí, al generar: `pnpm emails:build` compila cada plantilla
// a `src/infrastructure/email/compiledEmailTemplates.ts`, así la imagen de producción no lleva MJML ni sus
// dependencias. Un test falla si el archivo generado no coincide con las plantillas.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const templatesDirectory = path.join(projectRoot, 'src/infrastructure/email/templates');

export const compiledTemplatesModulePath = path.join(projectRoot, 'src/infrastructure/email/compiledEmailTemplates.ts');

/** Archivo MJML de cada plantilla. */
export const templateSourceFiles: Record<EmailTemplate, string> = {
  [EmailTemplate.EMAIL_VERIFICATION]: 'emailVerification.mjml',
  [EmailTemplate.PASSWORD_RESET]: 'passwordReset.mjml',
  [EmailTemplate.PASSWORD_CHANGED]: 'passwordChanged.mjml',
  [EmailTemplate.USER_INVITATION]: 'userInvitation.mjml',
  [EmailTemplate.ACCOUNT_ALREADY_REGISTERED]: 'accountAlreadyRegistered.mjml',
};

async function compileTemplate(fileName: string): Promise<string> {
  const filePath = path.join(templatesDirectory, fileName);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- el nombre sale de `templateSourceFiles`, una lista fija del código
  const result = await mjml2html(await readFile(filePath, 'utf8'), { filePath, validationLevel: 'strict' });
  return result.html;
}

/** HTML de cada plantilla, con sus marcadores `{{variable}}` sin sustituir. */
export async function compileEmailTemplates(): Promise<Array<[EmailTemplate, string]>> {
  const entries = Object.entries(templateSourceFiles) as Array<[EmailTemplate, string]>;
  return Promise.all(entries.map(async ([template, fileName]) => [template, await compileTemplate(fileName)]));
}

/** Contenido completo de `compiledEmailTemplates.ts`. */
export async function renderCompiledTemplatesModule(): Promise<string> {
  const compiledTemplates = await compileEmailTemplates();
  const entries = compiledTemplates.map(
    ([template, html]) => `  [EmailTemplate.${template}, ${JSON.stringify(html)}],`,
  );
  return [
    '// Generado por `pnpm emails:build` desde `templates/*.mjml` (D-28). No se edita a mano: un test falla si no',
    '// coincide con las plantillas.',
    "import { EmailTemplate } from '../../application/ports/services/IEmailTemplateRenderer.js';",
    '',
    '/** HTML de cada plantilla, con los marcadores `{{variable}}` sin sustituir. */',
    'export const compiledEmailTemplates: ReadonlyMap<EmailTemplate, string> = new Map([',
    ...entries,
    ']);',
    '',
  ].join('\n');
}
