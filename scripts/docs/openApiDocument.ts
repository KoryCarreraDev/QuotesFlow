import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { loginSchema, registerSchema } from '../../src/presentation/schemas/authSchema.js';
import {
  createCompanyContactSchema,
  updateCompanyContactSchema,
} from '../../src/presentation/schemas/companyContactSchema.js';
import { createContactSchema, updateContactSchema } from '../../src/presentation/schemas/contactSchema.js';
import {
  changeLeadStatusSchema,
  createLeadSchema,
  updateLeadSchema,
} from '../../src/presentation/schemas/leadSchema.js';
import {
  createLeadStatusConfigSchema,
  reorderLeadStatusConfigsSchema,
  updateLeadStatusConfigSchema,
} from '../../src/presentation/schemas/leadStatusConfigSchema.js';

// Genera `docs/openapi.json` (OpenAPI 3.1) desde los esquemas Zod de la API (D-07, F1-T11): el contrato
// con el frontend sale del mismo código que valida las peticiones, así no se desincroniza.
// No se edita a mano: `pnpm docs:openapi` lo regenera y un test falla si no coincide con el código.

const API_BASE_PATH = '/api/v1';
const SESSION_COOKIE_SCHEME = 'sessionCookie';
const MAXIMUM_SEARCH_LENGTH = 200;
const JSON_INDENTATION = 2;

type HttpMethod = RouteConfig['method'];

interface OperationEntry {
  method: HttpMethod;
  /** Ruta con parámetros al estilo OpenAPI (`{id}`). */
  path: string;
  tag: string;
  summary: string;
  isPublic?: boolean;
  body?: z.ZodType;
  query?: z.ZodObject;
  successStatus: number;
  successDescription: string;
}

const idParameters = z.object({ id: z.uuid().describe('Id del registro') });

const searchQuery = z.object({
  search: z.string().max(MAXIMUM_SEARCH_LENGTH).optional().describe('Búsqueda libre en los campos buscables'),
  filters: z.string().optional().describe('Lista JSON de { field, operator, value } (ver docs/modulos/filtrado.md)'),
  page: z.string().optional().describe('Página, desde 1. Por defecto 1'),
  limit: z.string().optional().describe('Registros por página, de 1 a 100. Por defecto 20'),
  sortBy: z.string().optional().describe('Campo ordenable de la entidad'),
  sortDir: z.enum(['asc', 'desc']).optional().describe('Sentido del orden. Por defecto desc'),
});

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().describe('Código estable en inglés (Q-003); el frontend lo traduce'),
    message: z.string().describe('Mensaje técnico en inglés'),
    details: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })).optional(),
  }),
});

function crudOperations(resourcePath: string, tag: string, nouns: { singular: string; plural: string }) {
  const collection = `${API_BASE_PATH}/${resourcePath}`;
  return {
    list: {
      method: 'get',
      path: collection,
      tag,
      summary: `Lista ${nouns.plural} visibles para el usuario`,
      successStatus: 200,
      successDescription: `${nouns.plural} visibles`,
    },
    search: {
      method: 'get',
      path: `${collection}/search`,
      tag,
      summary: `Busca, filtra, ordena y pagina ${nouns.plural}`,
      query: searchQuery,
      successStatus: 200,
      successDescription: '{ data, total, page, limit }',
    },
    create: {
      method: 'post',
      path: collection,
      tag,
      summary: `Crea ${nouns.singular}`,
      successStatus: 201,
      successDescription: `${nouns.singular} creado`,
    },
    update: {
      method: 'patch',
      path: `${collection}/{id}`,
      tag,
      summary: `Modifica ${nouns.singular}`,
      successStatus: 200,
      successDescription: `${nouns.singular} modificado`,
    },
    remove: {
      method: 'delete',
      path: `${collection}/{id}`,
      tag,
      summary: `Borra (suave) ${nouns.singular}`,
      successStatus: 200,
      successDescription: 'Borrado',
    },
  } satisfies Record<string, Omit<OperationEntry, 'body'>>;
}

const leads = crudOperations('leads', 'Leads', { singular: 'un lead', plural: 'leads' });
const contacts = crudOperations('contacts', 'Contactos', { singular: 'un contacto', plural: 'contactos' });
const companyContacts = crudOperations('company-contacts', 'Empresas cliente', {
  singular: 'una empresa cliente',
  plural: 'empresas cliente',
});
const leadStatusesPath = `${API_BASE_PATH}/lead-statuses`;

/** Todas las operaciones de la API. Un test compara esta lista con el inventario de rutas. */
export const openApiOperations: OperationEntry[] = [
  {
    method: 'get',
    path: '/health',
    tag: 'Sondas',
    summary: 'Vida: el proceso responde',
    isPublic: true,
    successStatus: 200,
    successDescription: '{ status, timestamp }',
  },
  {
    method: 'get',
    path: '/ready',
    tag: 'Sondas',
    summary: 'Listo: la base de datos responde',
    isPublic: true,
    successStatus: 200,
    successDescription: '{ status: "ready" }; 503 si no',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/register`,
    tag: 'Autenticación',
    summary: 'Registra una empresa con su dueño y sus estados por defecto',
    isPublic: true,
    body: registerSchema,
    successStatus: 201,
    successDescription: '{ tenantId, ownerId }',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/login`,
    tag: 'Autenticación',
    summary: 'Inicia sesión y deja la cookie accessToken',
    isPublic: true,
    body: loginSchema,
    successStatus: 200,
    successDescription: '{ success: true } y cookie de sesión',
  },
  leads.list,
  leads.search,
  { ...leads.create, body: createLeadSchema },
  { ...leads.update, body: updateLeadSchema },
  {
    method: 'patch',
    path: `${API_BASE_PATH}/leads/{id}/status`,
    tag: 'Leads',
    summary: 'Cambia el estado de un lead y lo registra en su historial',
    body: changeLeadStatusSchema,
    successStatus: 200,
    successDescription: 'Lead con el estado nuevo',
  },
  leads.remove,
  {
    method: 'get',
    path: leadStatusesPath,
    tag: 'Estados de lead',
    summary: 'Lista los estados de lead de la empresa, por orden',
    successStatus: 200,
    successDescription: 'Estados de lead',
  },
  {
    method: 'post',
    path: leadStatusesPath,
    tag: 'Estados de lead',
    summary: 'Crea un estado de lead',
    body: createLeadStatusConfigSchema,
    successStatus: 201,
    successDescription: 'Estado creado',
  },
  {
    method: 'patch',
    path: `${leadStatusesPath}/{id}`,
    tag: 'Estados de lead',
    summary: 'Modifica un estado de lead',
    body: updateLeadStatusConfigSchema,
    successStatus: 200,
    successDescription: 'Estado modificado',
  },
  {
    method: 'patch',
    path: `${leadStatusesPath}/order`,
    tag: 'Estados de lead',
    summary: 'Reordena todos los estados de lead activos',
    body: reorderLeadStatusConfigsSchema,
    successStatus: 200,
    successDescription: 'Estados con su orden nuevo',
  },
  {
    method: 'delete',
    path: `${leadStatusesPath}/{id}`,
    tag: 'Estados de lead',
    summary: 'Borra (suave) un estado sin leads que no es el predeterminado',
    successStatus: 200,
    successDescription: 'Borrado',
  },
  contacts.list,
  contacts.search,
  { ...contacts.create, body: createContactSchema },
  { ...contacts.update, body: updateContactSchema },
  contacts.remove,
  companyContacts.list,
  companyContacts.search,
  { ...companyContacts.create, body: createCompanyContactSchema },
  { ...companyContacts.update, body: updateCompanyContactSchema },
  companyContacts.remove,
];

// F2-T07: toda petición que modifica datos puede recibir 403 ORIGIN_NOT_ALLOWED, también las públicas.
function forbiddenResponseFor(
  operation: OperationEntry,
  errorContent: Pick<ResponseConfig, 'content'>,
): Record<number, ResponseConfig> {
  const isMutation = operation.method !== 'get';
  if (operation.isPublic && !isMutation) return {};
  const reasons = [
    ...(operation.isPublic ? [] : ['El rol no permite la acción (INSUFFICIENT_PERMISSIONS)']),
    ...(isMutation ? ['Origen fuera de la lista blanca (ORIGIN_NOT_ALLOWED)'] : []),
  ];
  return { 403: { description: reasons.join('; '), ...errorContent } };
}

function routeConfigFor(operation: OperationEntry): RouteConfig {
  const errorContent = { content: { 'application/json': { schema: errorResponseSchema } } };
  return {
    method: operation.method,
    path: operation.path,
    tags: [operation.tag],
    summary: operation.summary,
    security: operation.isPublic ? [] : [{ [SESSION_COOKIE_SCHEME]: [] }],
    request: {
      params: operation.path.includes('{id}') ? idParameters : undefined,
      query: operation.query,
      body: operation.body ? { content: { 'application/json': { schema: operation.body } } } : undefined,
    },
    responses: {
      [operation.successStatus]: { description: operation.successDescription },
      400: { description: 'Entrada inválida', ...errorContent },
      ...(operation.isPublic ? {} : { 401: { description: 'Sin sesión válida', ...errorContent } }),
      ...forbiddenResponseFor(operation, errorContent),
      ...(operation.path.includes('{id}')
        ? { 404: { description: 'No existe o es de otra empresa', ...errorContent } }
        : {}),
      429: { description: 'Demasiadas peticiones', ...errorContent },
    },
  };
}

/** Documento OpenAPI 3.1 completo, como objeto. */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', SESSION_COOKIE_SCHEME, {
    type: 'apiKey',
    in: 'cookie',
    name: 'accessToken',
    description: 'Cookie HTTP-only que deja POST /api/v1/auth/login',
  });
  for (const operation of openApiOperations) registry.registerPath(routeConfigFor(operation));

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'QuotesFlow API',
      version: '1.0.0',
      description:
        'API REST de QuotesFlow. Toda respuesta de error tiene la forma { error: { code, message, details? } }. Cada empresa (tenant) solo ve sus datos.',
    },
  });
}

/** Contenido de `docs/openapi.json`. */
export function renderOpenApiDocument(): string {
  return `${JSON.stringify(buildOpenApiDocument(), null, JSON_INDENTATION)}\n`;
}
