import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCompiledTemplatesModule } from './emailTemplateSources.js';

// Uso: pnpm emails:build
// Recompila las plantillas MJML a src/infrastructure/email/compiledEmailTemplates.ts (D-28).

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(projectRoot, 'src', 'infrastructure', 'email', 'compiledEmailTemplates.ts');

await writeFile(modulePath, await renderCompiledTemplatesModule(), 'utf8');
console.log(`Email templates written to ${path.relative(projectRoot, modulePath)}`);
