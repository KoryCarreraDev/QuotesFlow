import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../../src/presentation/schemas/authSchema.js';
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
import { updateTenantProfileSchema } from '../../src/presentation/schemas/tenantSchema.js';
import { createProductSchema, updateProductSchema } from '../../src/presentation/schemas/productSchema.js';
import {
  acceptQuoteSchema,
  createQuoteFromLeadSchema,
  createQuoteSchema,
  sendQuoteSchema,
  updateQuoteSchema,
} from '../../src/presentation/schemas/quoteSchema.js';
import { createFormulaSchema, updateFormulaSchema } from '../../src/presentation/schemas/formulaSchema.js';
import {
  acceptInvitationSchema,
  inviteUserSchema,
  updateUserSchema,
} from '../../src/presentation/schemas/userSchema.js';

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
  /** Tipo del cuerpo; por defecto JSON. Los archivos van como `multipart/form-data`. */
  bodyContentType?: 'application/json' | 'multipart/form-data';
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
const products = crudOperations('products', 'Productos', { singular: 'un producto', plural: 'productos' });
const formulas = crudOperations('formulas', 'Fórmulas', {
  singular: 'una fórmula de precio',
  plural: 'fórmulas de precio',
});
const quotes = crudOperations('quotes', 'Cotizaciones', { singular: 'una cotización', plural: 'cotizaciones' });
const companyContacts = crudOperations('company-contacts', 'Empresas cliente', {
  singular: 'una empresa cliente',
  plural: 'empresas cliente',
});
const leadStatusesPath = `${API_BASE_PATH}/lead-statuses`;
const usersPath = `${API_BASE_PATH}/users`;

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
    summary: 'Registra una empresa con su dueño y sus estados por defecto, y envía el enlace de verificación',
    isPublic: true,
    body: registerSchema,
    successStatus: 202,
    successDescription: '{ status: "PENDING_EMAIL_VERIFICATION" }, igual exista o no el correo (H8)',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/verify-email`,
    tag: 'Autenticación',
    summary: 'Verifica el correo con el token del enlace (un solo uso, 24 h)',
    isPublic: true,
    body: verifyEmailSchema,
    successStatus: 200,
    successDescription: '{ success: true }; 400 INVALID_ACCOUNT_TOKEN si no vale',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/verify-email/resend`,
    tag: 'Autenticación',
    summary: 'Reenvía el enlace de verificación (como mucho uno por minuto)',
    isPublic: true,
    body: emailOnlySchema,
    successStatus: 202,
    successDescription: '{ status: "ACCEPTED" }, igual exista o no el correo',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/password/forgot`,
    tag: 'Autenticación',
    summary: 'Envía un enlace para elegir una contraseña nueva (un solo uso, 30 min)',
    isPublic: true,
    body: emailOnlySchema,
    successStatus: 202,
    successDescription: '{ status: "ACCEPTED" }, igual exista o no el correo',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/password/reset`,
    tag: 'Autenticación',
    summary: 'Cambia la contraseña con el token del enlace y cierra todas las sesiones',
    isPublic: true,
    body: resetPasswordSchema,
    successStatus: 200,
    successDescription: '{ success: true }; 400 INVALID_ACCOUNT_TOKEN, PASSWORD_TOO_WEAK o PASSWORD_BREACHED',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/login`,
    tag: 'Autenticación',
    summary: 'Inicia sesión y deja la cookie accessToken',
    isPublic: true,
    body: loginSchema,
    successStatus: 200,
    successDescription: '{ success: true } y cookies accessToken (15 min) y refreshToken (Path=/api/v1/auth)',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/invitations/accept`,
    tag: 'Autenticación',
    summary: 'Acepta una invitación: crea la cuenta con el rol invitado, el correo verificado y la sesión abierta',
    isPublic: true,
    body: acceptInvitationSchema,
    successStatus: 201,
    successDescription: '{ success: true } y cookies de sesión; 400 INVALID_ACCOUNT_TOKEN si no vale',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/refresh`,
    tag: 'Autenticación',
    summary: 'Renueva la sesión con la cookie refreshToken y la rota; un refresh reutilizado revoca la sesión',
    isPublic: true,
    successStatus: 200,
    successDescription: '{ success: true } y cookies nuevas; 401 INVALID_SESSION si no vale',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/logout`,
    tag: 'Autenticación',
    summary: 'Cierra la sesión del navegador (idempotente) y borra las cookies',
    isPublic: true,
    successStatus: 204,
    successDescription: 'Sin contenido',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/auth/logout-all`,
    tag: 'Autenticación',
    summary: 'Cierra todas las sesiones del usuario, también la actual',
    successStatus: 204,
    successDescription: 'Sin contenido',
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
  products.search,
  { ...products.create, body: createProductSchema },
  { ...products.update, body: updateProductSchema },
  products.remove,
  formulas.search,
  { ...formulas.create, body: createFormulaSchema },
  { ...formulas.update, body: updateFormulaSchema },
  formulas.remove,
  {
    method: 'post',
    path: `${API_BASE_PATH}/leads/{id}/quotes`,
    tag: 'Cotizaciones',
    summary:
      'Crea una cotización (borrador) para el lead de la ruta; un comercial solo de sus leads. Mismas reglas que crear una cotización',
    body: createQuoteFromLeadSchema,
    successStatus: 201,
    successDescription: 'Cotización creada con el lead como cliente; 404 LEAD_NOT_FOUND',
  },
  {
    ...quotes.search,
    successDescription:
      '{ data, total, page, limit }; cada cotización es un resumen sin items y con los totales guardados (los ítems, en GET /quotes/{id})',
  },
  {
    method: 'get',
    path: `${API_BASE_PATH}/quotes/{id}`,
    tag: 'Cotizaciones',
    summary: 'Una cotización con sus ítems; un comercial solo las que creó',
    successStatus: 200,
    successDescription: 'Cotización con importes como texto decimal; displayStatus es EXPIRED si venció (Q-016)',
  },
  {
    method: 'get',
    path: `${API_BASE_PATH}/quotes/{id}/pdf`,
    tag: 'Cotizaciones',
    summary:
      'Descarga el PDF de la cotización (logo, cliente, ítems, totales y condiciones); un comercial solo las suyas',
    successStatus: 200,
    successDescription: 'application/pdf, como adjunto COT-000123.pdf (o COT-000123-v2.pdf)',
  },
  {
    ...quotes.create,
    body: createQuoteSchema,
    summary: 'Crea una cotización (borrador) con el siguiente número de la empresa; el servidor calcula los precios',
  },
  {
    ...quotes.update,
    body: updateQuoteSchema,
    summary: 'Modifica un borrador; items reemplaza todos los ítems. 409 QUOTE_NOT_EDITABLE si ya se envió (D-22)',
  },
  { ...quotes.remove, summary: 'Borra (suave) un borrador; 409 QUOTE_NOT_EDITABLE si ya se envió' },
  {
    method: 'post',
    path: `${API_BASE_PATH}/quotes/{id}/send`,
    tag: 'Cotizaciones',
    summary:
      'Envía el borrador: pasa a SENT y ya no se edita. Con el canal de correo de la empresa activo, antes manda el PDF al cliente (recipientEmail opcional); si el correo falla, sigue en borrador (503 QUOTE_EMAIL_FAILED). 409 QUOTE_EXPIRED si la vigencia pasó',
    body: sendQuoteSchema,
    successStatus: 200,
    successDescription: 'Cotización enviada, con emailed: true si salió un correo al cliente',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/quotes/{id}/accept`,
    tag: 'Cotizaciones',
    summary:
      'Registra que el cliente aceptó una cotización enviada y vigente (definitiva). Con markLeadAsWon, el lead abierto de la cotización pasa al estado ganado en la misma transacción',
    body: acceptQuoteSchema,
    successStatus: 200,
    successDescription:
      'Cotización aceptada, con leadMarkedAsWon; 409 QUOTE_INVALID_TRANSITION o QUOTE_EXPIRED; 403 si no puede modificar el lead',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/quotes/{id}/reject`,
    tag: 'Cotizaciones',
    summary: 'Registra que el cliente rechazó una cotización enviada (también si ya venció)',
    successStatus: 200,
    successDescription: 'Cotización rechazada; 409 QUOTE_INVALID_TRANSITION',
  },
  {
    method: 'post',
    path: `${API_BASE_PATH}/quotes/{id}/revise`,
    tag: 'Cotizaciones',
    summary: 'Crea la versión siguiente (borrador, mismo número: COT-000123 v2) de una enviada o rechazada (D-22)',
    successStatus: 201,
    successDescription: 'Versión nueva en borrador; la anterior queda SUPERSEDED',
  },
  {
    method: 'get',
    path: `${API_BASE_PATH}/tenant`,
    tag: 'Empresa',
    summary: 'Perfil de la empresa de la sesión: nombre, logoUrl si tiene logo, zona horaria, correo, IVA y topes',
    successStatus: 200,
    successDescription: '{ id, name, logoUrl?, timezone }',
  },
  {
    method: 'patch',
    path: `${API_BASE_PATH}/tenant`,
    tag: 'Empresa',
    summary:
      'Cambia el nombre, la zona horaria (IANA), el canal de correo, el IVA por defecto o los topes de descuento por rol; solo dueño y socio',
    body: updateTenantProfileSchema,
    successStatus: 200,
    successDescription: 'Perfil actualizado',
  },
  {
    method: 'get',
    path: `${API_BASE_PATH}/tenant/logo`,
    tag: 'Empresa',
    summary: 'Imagen del logo de la empresa (PNG o JPEG); todo el equipo. 404 LOGO_NOT_FOUND si no tiene',
    successStatus: 200,
    successDescription: 'La imagen, con su Content-Type',
  },
  {
    method: 'put',
    path: `${API_BASE_PATH}/tenant/logo`,
    tag: 'Empresa',
    summary:
      'Sube o reemplaza el logo (solo dueño y socio): PNG o JPEG de hasta 2 MB y 2000 x 2000 px, en el campo file. El tipo se decide por el contenido',
    body: z.object({ file: z.string().meta({ format: 'binary', description: 'Imagen PNG o JPEG' }) }),
    bodyContentType: 'multipart/form-data',
    successStatus: 200,
    successDescription: 'Perfil actualizado, con logoUrl; 400 INVALID_LOGO_IMAGE si no es una imagen válida',
  },
  {
    method: 'delete',
    path: `${API_BASE_PATH}/tenant/logo`,
    tag: 'Empresa',
    summary: 'Quita el logo (solo dueño y socio); sin logo no hace nada',
    successStatus: 204,
    successDescription: 'Sin contenido',
  },
  {
    method: 'get',
    path: usersPath,
    tag: 'Usuarios',
    summary: 'Lista los usuarios de la empresa (solo gestión)',
    successStatus: 200,
    successDescription: 'Usuarios, sin datos de acceso',
  },
  {
    method: 'patch',
    path: `${usersPath}/{id}`,
    tag: 'Usuarios',
    summary: 'Cambia el rol de un usuario o lo desactiva o reactiva; desactivar cierra sus sesiones',
    body: updateUserSchema,
    successStatus: 200,
    successDescription: 'Usuario modificado',
  },
  {
    method: 'get',
    path: `${usersPath}/invitations`,
    tag: 'Usuarios',
    summary: 'Lista las invitaciones pendientes',
    successStatus: 200,
    successDescription: 'Invitaciones pendientes, sin el token',
  },
  {
    method: 'post',
    path: `${usersPath}/invitations`,
    tag: 'Usuarios',
    summary: 'Invita a alguien con un rol que el actor gestiona y le envía el enlace (7 días)',
    body: inviteUserSchema,
    successStatus: 201,
    successDescription: 'Invitación creada; 409 EMAIL_ALREADY_IN_USE',
  },
  {
    method: 'delete',
    path: `${usersPath}/invitations/{id}`,
    tag: 'Usuarios',
    summary: 'Revoca una invitación pendiente',
    successStatus: 200,
    successDescription: 'Revocada',
  },
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
      body: operation.body
        ? { content: { [operation.bodyContentType ?? 'application/json']: { schema: operation.body } } }
        : undefined,
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
    description:
      'Cookie HTTP-only con el token de acceso (15 min) que deja POST /api/v1/auth/login; caducado responde 401 SESSION_EXPIRED y se renueva con POST /api/v1/auth/refresh',
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
