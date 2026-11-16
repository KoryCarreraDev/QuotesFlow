// Única fuente de rutas para los tests de API.
// Si una ruta cambia (por ejemplo la migración a `/api/v1` de la decisión D-06), se corrige solo aquí.
//
// `routeInventory` es el inventario que exige la regla R5: `tests/api/security/routeInventory.test.ts`
// falla si la aplicación registra una ruta que no está declarada aquí.

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** `public`: sin sesión. `authenticated`: exige la cookie de sesión y queda acotada al tenant del usuario. */
export type RouteAccess = 'public' | 'authenticated';

export interface RouteInventoryEntry {
  method: HttpMethod;
  /** Ruta tal como la registra Express, con sus parámetros (`:id`). */
  pattern: string;
  access: RouteAccess;
}

const ROUTE_ID_PARAMETER = ':id';

const LEAD_BASE_PATH = '/api/lead';
const LEAD_STATUS_CONFIG_BASE_PATH = '/api/leadStatusConfig';
const CONTACT_BASE_PATH = '/api/contact';
const COMPANY_CONTACT_BASE_PATH = '/api/companyContact';

export const apiPaths = {
  health: '/health',
  auth: {
    register: '/api/auth/register',
    login: '/api/auth/login',
  },
  leads: {
    getAll: `${LEAD_BASE_PATH}/getAll`,
    create: `${LEAD_BASE_PATH}/create`,
    filtered: `${LEAD_BASE_PATH}/filtered`,
    update: (leadId: string) => `${LEAD_BASE_PATH}/update/${leadId}`,
    delete: (leadId: string) => `${LEAD_BASE_PATH}/delete/${leadId}`,
  },
  leadStatusConfigs: {
    getAll: `${LEAD_STATUS_CONFIG_BASE_PATH}/getAll`,
    create: `${LEAD_STATUS_CONFIG_BASE_PATH}/create`,
    update: (statusId: string) => `${LEAD_STATUS_CONFIG_BASE_PATH}/update/${statusId}`,
  },
  contacts: {
    getAll: `${CONTACT_BASE_PATH}/getAll`,
    create: `${CONTACT_BASE_PATH}/create`,
    filtered: `${CONTACT_BASE_PATH}/filtered`,
    update: (contactId: string) => `${CONTACT_BASE_PATH}/update/${contactId}`,
  },
  companyContacts: {
    getAll: `${COMPANY_CONTACT_BASE_PATH}/getAll`,
    create: `${COMPANY_CONTACT_BASE_PATH}/create`,
    filtered: `${COMPANY_CONTACT_BASE_PATH}/filtered`,
    update: (companyContactId: string) => `${COMPANY_CONTACT_BASE_PATH}/update/${companyContactId}`,
  },
} as const;

export const routeInventory: readonly RouteInventoryEntry[] = [
  { method: 'GET', pattern: apiPaths.health, access: 'public' },
  { method: 'POST', pattern: apiPaths.auth.register, access: 'public' },
  { method: 'POST', pattern: apiPaths.auth.login, access: 'public' },

  { method: 'GET', pattern: apiPaths.leads.getAll, access: 'authenticated' },
  { method: 'POST', pattern: apiPaths.leads.create, access: 'authenticated' },
  { method: 'GET', pattern: apiPaths.leads.filtered, access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.leads.update(ROUTE_ID_PARAMETER), access: 'authenticated' },
  { method: 'POST', pattern: apiPaths.leads.delete(ROUTE_ID_PARAMETER), access: 'authenticated' },

  { method: 'GET', pattern: apiPaths.leadStatusConfigs.getAll, access: 'authenticated' },
  { method: 'POST', pattern: apiPaths.leadStatusConfigs.create, access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.leadStatusConfigs.update(ROUTE_ID_PARAMETER), access: 'authenticated' },

  { method: 'GET', pattern: apiPaths.contacts.getAll, access: 'authenticated' },
  { method: 'POST', pattern: apiPaths.contacts.create, access: 'authenticated' },
  { method: 'GET', pattern: apiPaths.contacts.filtered, access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.contacts.update(ROUTE_ID_PARAMETER), access: 'authenticated' },

  { method: 'GET', pattern: apiPaths.companyContacts.getAll, access: 'authenticated' },
  { method: 'POST', pattern: apiPaths.companyContacts.create, access: 'authenticated' },
  { method: 'GET', pattern: apiPaths.companyContacts.filtered, access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.companyContacts.update(ROUTE_ID_PARAMETER), access: 'authenticated' },
];

export const authenticatedRoutes = routeInventory.filter((route) => route.access === 'authenticated');

/** Convierte el patrón de una ruta en una ruta concreta, sustituyendo `:id` por el id indicado. */
export function buildConcretePath(route: RouteInventoryEntry, resourceId: string): string {
  return route.pattern.replace(ROUTE_ID_PARAMETER, resourceId);
}

/** Texto único por ruta, útil como título de test y para comparar inventarios. */
export function describeRoute(route: Pick<RouteInventoryEntry, 'method' | 'pattern'>): string {
  return `${route.method} ${route.pattern}`;
}
