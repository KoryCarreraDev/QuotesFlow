import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderOpenApiDocument } from './openApiDocument.js';

// Uso: pnpm docs:openapi
// Reescribe docs/openapi.json desde los esquemas Zod de la API.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const documentPath = path.join(projectRoot, 'docs', 'openapi.json');

await writeFile(documentPath, renderOpenApiDocument(), 'utf8');
console.log(`OpenAPI document written to ${path.relative(projectRoot, documentPath)}`);
