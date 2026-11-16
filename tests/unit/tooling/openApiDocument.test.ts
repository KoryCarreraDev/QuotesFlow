import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildOpenApiDocument,
  openApiOperations,
  renderOpenApiDocument,
} from '../../../scripts/docs/openApiDocument.js';
import { describeRoute, routeInventory } from '@tests/support/http/apiRoutes.js';

// D-07 (F1-T11): `docs/openapi.json` es el contrato con el frontend y se genera desde los esquemas Zod.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const documentPath = path.join(projectRoot, 'docs/openapi.json');

function asOpenApiRoute(route: { method: string; pattern: string }): string {
  return `${route.method.toUpperCase()} ${route.pattern.replace(':id', '{id}')}`;
}

describe('contrato OpenAPI', () => {
  it('docs/openapi.json coincide con los esquemas del código (regenerar con pnpm docs:openapi)', async () => {
    const committedDocument = await readFile(documentPath, 'utf8');

    expect(committedDocument).toBe(renderOpenApiDocument());
  });

  it('documenta exactamente las rutas que registra la aplicación', () => {
    const documentedRoutes = openApiOperations.map(
      (operation) => `${operation.method.toUpperCase()} ${operation.path}`,
    );

    expect(documentedRoutes.sort()).toEqual(routeInventory.map(asOpenApiRoute).sort());
    expect(new Set(documentedRoutes).size).toBe(documentedRoutes.length);
    expect(routeInventory.map(describeRoute).length).toBe(documentedRoutes.length);
  });

  it('las rutas protegidas exigen la cookie de sesión y las públicas no', () => {
    const document = buildOpenApiDocument();
    const leadsList = document.paths?.['/api/v1/leads']?.get;
    const login = document.paths?.['/api/v1/auth/login']?.post;

    expect(leadsList?.security).toEqual([{ sessionCookie: [] }]);
    expect(login?.security).toEqual([]);
  });

  it('el cuerpo de crear un lead sale del esquema Zod real (contactName obligatorio)', () => {
    const createLead = buildOpenApiDocument().paths?.['/api/v1/leads']?.post;
    const bodySchema = (createLead?.requestBody as { content: Record<string, { schema: { required?: string[] } }> })
      .content['application/json'].schema;

    expect(bodySchema.required).toContain('contactName');
  });
});
