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

// D-06 (F1-T11): recursos REST bajo /api/v1. Las sondas /health y /ready quedan en la raíz.
const API_BASE_PATH = '/api/v1';
const LEAD_BASE_PATH = `${API_BASE_PATH}/leads`;
const LEAD_STATUS_CONFIG_BASE_PATH = `${API_BASE_PATH}/lead-statuses`;
const CONTACT_BASE_PATH = `${API_BASE_PATH}/contacts`;
const COMPANY_CONTACT_BASE_PATH = `${API_BASE_PATH}/company-contacts`;
const USER_BASE_PATH = `${API_BASE_PATH}/users`;

export const apiPaths = {
  health: '/health',
  ready: '/ready',
  auth: {
    register: `${API_BASE_PATH}/auth/register`,
    login: `${API_BASE_PATH}/auth/login`,
    refresh: `${API_BASE_PATH}/auth/refresh`,
    logout: `${API_BASE_PATH}/auth/logout`,
    logoutAll: `${API_BASE_PATH}/auth/logout-all`,
    verifyEmail: `${API_BASE_PATH}/auth/verify-email`,
    resendEmailVerification: `${API_BASE_PATH}/auth/verify-email/resend`,
    forgotPassword: `${API_BASE_PATH}/auth/password/forgot`,
    resetPassword: `${API_BASE_PATH}/auth/password/reset`,
    acceptInvitation: `${API_BASE_PATH}/auth/invitations/accept`,
  },
  tenant: {
    profile: `${API_BASE_PATH}/tenant`,
  },
  users: {
    getAll: USER_BASE_PATH,
    update: (userId: string) => `${USER_BASE_PATH}/${userId}`,
    invitations: `${USER_BASE_PATH}/invitations`,
    invite: `${USER_BASE_PATH}/invitations`,
    revokeInvitation: (invitationId: string) => `${USER_BASE_PATH}/invitations/${invitationId}`,
  },
  leads: {
    getAll: LEAD_BASE_PATH,
    create: LEAD_BASE_PATH,
    filtered: `${LEAD_BASE_PATH}/search`,
    update: (leadId: string) => `${LEAD_BASE_PATH}/${leadId}`,
    delete: (leadId: string) => `${LEAD_BASE_PATH}/${leadId}`,
    changeStatus: (leadId: string) => `${LEAD_BASE_PATH}/${leadId}/status`,
  },
  leadStatusConfigs: {
    getAll: LEAD_STATUS_CONFIG_BASE_PATH,
    create: LEAD_STATUS_CONFIG_BASE_PATH,
    update: (statusId: string) => `${LEAD_STATUS_CONFIG_BASE_PATH}/${statusId}`,
    delete: (statusId: string) => `${LEAD_STATUS_CONFIG_BASE_PATH}/${statusId}`,
    reorder: `${LEAD_STATUS_CONFIG_BASE_PATH}/order`,
  },
  contacts: {
    getAll: CONTACT_BASE_PATH,
    create: CONTACT_BASE_PATH,
    filtered: `${CONTACT_BASE_PATH}/search`,
    update: (contactId: string) => `${CONTACT_BASE_PATH}/${contactId}`,
    delete: (contactId: string) => `${CONTACT_BASE_PATH}/${contactId}`,
  },
  companyContacts: {
    getAll: COMPANY_CONTACT_BASE_PATH,
    create: COMPANY_CONTACT_BASE_PATH,
    filtered: `${COMPANY_CONTACT_BASE_PATH}/search`,
    update: (companyContactId: string) => `${COMPANY_CONTACT_BASE_PATH}/${companyContactId}`,
    delete: (companyContactId: string) => `${COMPANY_CONTACT_BASE_PATH}/${companyContactId}`,
  },
} as const;

export const routeInventory: readonly RouteInventoryEntry[] = [
  { method: 'GET', pattern: apiPaths.health, access: 'public' },
  { method: 'GET', pattern: apiPaths.ready, access: 'public' },
  { method: 'POST', pattern: apiPaths.auth.register, access: 'public' },
  { method: 'POST', pattern: apiPaths.auth.login, access: 'public' },
  // F2-T02: renovar y cerrar la sesión usan el refresh token, no la sesión de acceso.
  { method: 'POST', pattern: apiPaths.auth.refresh, access: 'public' },
  { method: 'POST', pattern: apiPaths.auth.logout, access: 'public' },
  { method: 'POST', pattern: apiPaths.auth.logoutAll, access: 'authenticated' },
  // F2-T04: enlaces de correo; llegan sin sesión.
  { method: 'POST', pattern: apiPaths.auth.verifyEmail, access: 'public' },
  { method: 'POST', pattern: apiPaths.auth.resendEmailVerification, access: 'public' },
  { method: 'POST', pattern: apiPaths.auth.forgotPassword, access: 'public' },
  { method: 'POST', pattern: apiPaths.auth.resetPassword, access: 'public' },
  { method: 'POST', pattern: apiPaths.auth.acceptInvitation, access: 'public' },

  { method: 'GET', pattern: apiPaths.leads.getAll, access: 'authenticated' },
  { method: 'POST', pattern: apiPaths.leads.create, access: 'authenticated' },
  { method: 'GET', pattern: apiPaths.leads.filtered, access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.leads.update(ROUTE_ID_PARAMETER), access: 'authenticated' },
  { method: 'DELETE', pattern: apiPaths.leads.delete(ROUTE_ID_PARAMETER), access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.leads.changeStatus(ROUTE_ID_PARAMETER), access: 'authenticated' },

  { method: 'GET', pattern: apiPaths.leadStatusConfigs.getAll, access: 'authenticated' },
  { method: 'POST', pattern: apiPaths.leadStatusConfigs.create, access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.leadStatusConfigs.update(ROUTE_ID_PARAMETER), access: 'authenticated' },
  { method: 'DELETE', pattern: apiPaths.leadStatusConfigs.delete(ROUTE_ID_PARAMETER), access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.leadStatusConfigs.reorder, access: 'authenticated' },

  { method: 'GET', pattern: apiPaths.contacts.getAll, access: 'authenticated' },
  { method: 'POST', pattern: apiPaths.contacts.create, access: 'authenticated' },
  { method: 'GET', pattern: apiPaths.contacts.filtered, access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.contacts.update(ROUTE_ID_PARAMETER), access: 'authenticated' },
  { method: 'DELETE', pattern: apiPaths.contacts.delete(ROUTE_ID_PARAMETER), access: 'authenticated' },

  { method: 'GET', pattern: apiPaths.companyContacts.getAll, access: 'authenticated' },
  { method: 'POST', pattern: apiPaths.companyContacts.create, access: 'authenticated' },
  { method: 'GET', pattern: apiPaths.companyContacts.filtered, access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.companyContacts.update(ROUTE_ID_PARAMETER), access: 'authenticated' },
  { method: 'DELETE', pattern: apiPaths.companyContacts.delete(ROUTE_ID_PARAMETER), access: 'authenticated' },

  { method: 'GET', pattern: apiPaths.tenant.profile, access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.tenant.profile, access: 'authenticated' },

  { method: 'GET', pattern: apiPaths.users.getAll, access: 'authenticated' },
  { method: 'PATCH', pattern: apiPaths.users.update(ROUTE_ID_PARAMETER), access: 'authenticated' },
  { method: 'GET', pattern: apiPaths.users.invitations, access: 'authenticated' },
  { method: 'POST', pattern: apiPaths.users.invite, access: 'authenticated' },
  { method: 'DELETE', pattern: apiPaths.users.revokeInvitation(ROUTE_ID_PARAMETER), access: 'authenticated' },
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
