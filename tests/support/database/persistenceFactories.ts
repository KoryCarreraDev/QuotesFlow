// Fábricas de datos que escriben directamente en la base de datos del test (proyectos `integration` y `api`).
// Preparan el escenario sin pasar por la API ni por los casos de uso que se están probando.
//
// Los ids son UUID, igual que los que generan las entidades de dominio (`crypto.randomUUID()`).

import { randomUUID } from 'node:crypto';
import type {
  CompanyContact as CompanyContactRecord,
  Contact as ContactRecord,
  DeletedState as DeletedStateRecord,
  Lead as LeadRecord,
  LeadStatusConfig as LeadStatusConfigRecord,
  Tenant as TenantRecord,
  User as UserRecord,
  UserInvitation as UserInvitationRecord,
  DocumentType as DocumentTypeRecord,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { defaultLeadStatuses } from '@/application/constants/defaultLeadStatuses.js';
import { hashOpaqueSecret } from '@/application/services/opaqueTokens.js';
import prisma from '@/config/database.js';
import { Role } from '@/domain/enums/Role.js';

/** Contraseña en texto plano de todo usuario creado por `persistUser`. */
export const TEST_USER_PASSWORD = 'Correct-Horse-Battery-9';

// Coste mínimo de bcrypt: en tests importa que el hash sea válido, no que sea lento.
const FAST_BCRYPT_COST = 4;
const TEST_USER_PASSWORD_HASH = bcrypt.hashSync(TEST_USER_PASSWORD, FAST_BCRYPT_COST);

const DEFAULT_ESTIMATED_VALUE = 1_500_000;
// Las sesiones de test duran un día: más que cualquier ejecución de la suite.
const TEST_SESSION_LIFETIME_MS = 86_400_000;
// Refresh token de la sesión de test: sirve para probar /auth/refresh y /auth/logout sin hacer login.
export const TEST_REFRESH_SECRET = 'test-refresh-secret-for-every-persisted-user';
const DEFAULT_STATUS_ORDER = 1;

export interface TenantOverrides {
  id?: string;
  name?: string;
  deleted?: DeletedStateRecord;
}

export async function persistTenant(overrides: TenantOverrides = {}): Promise<TenantRecord> {
  return prisma.tenant.create({
    data: {
      id: randomUUID(),
      name: 'Aluminios Andinos SAS',
      ...overrides,
    },
  });
}

export interface UserOverrides {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: Role;
  isActive?: boolean;
  deleted?: DeletedStateRecord;
  /** Por defecto verificado (D-12); `null` para un usuario pendiente de verificar. */
  emailVerifiedAt?: Date | null;
}

/**
 * Id de la sesión abierta que `persistUser` crea para cada usuario (F2-T02): el mismo id que el usuario.
 * Así `sessionCookieFor` firma un token válido sin consultar la base.
 */
export function testSessionIdFor(userId: string): string {
  return userId;
}

/** Refresh token completo de la sesión de test del usuario. */
export function testRefreshTokenFor(userId: string): string {
  return `${testSessionIdFor(userId)}.${TEST_REFRESH_SECRET}`;
}

/** Crea el usuario con una sesión abierta (F2-T02): toda petición autenticada de los tests la necesita. */
export async function persistUser(tenantId: string, overrides: UserOverrides = {}): Promise<UserRecord> {
  const id = overrides.id ?? randomUUID();
  const user = await prisma.user.create({
    data: {
      id,
      tenantId,
      email: `user.${id}@example.com`,
      passwordHash: TEST_USER_PASSWORD_HASH,
      firstName: 'Carlos',
      lastName: 'Pérez',
      role: Role.SALES_REP,
      emailVerifiedAt: new Date(),
      ...overrides,
    },
  });
  await prisma.userSession.create({
    data: {
      id: testSessionIdFor(id),
      tenantId,
      userId: id,
      refreshTokenHash: hashOpaqueSecret(TEST_REFRESH_SECRET),
      expiresAt: new Date(Date.now() + TEST_SESSION_LIFETIME_MS),
    },
  });
  return user;
}

export interface LeadStatusOverrides {
  id?: string;
  name?: string;
  order?: number;
  isDefault?: boolean;
  color?: string;
  deleted?: DeletedStateRecord;
}

export async function persistLeadStatus(
  tenantId: string,
  overrides: LeadStatusOverrides = {},
): Promise<LeadStatusConfigRecord> {
  return prisma.leadStatusConfig.create({
    data: {
      id: randomUUID(),
      tenantId,
      name: 'Nuevo',
      order: DEFAULT_STATUS_ORDER,
      isDefault: false,
      ...overrides,
    },
  });
}

/** Crea los cinco estados que recibe una empresa al registrarse, en el mismo orden. */
export async function persistDefaultLeadStatuses(tenantId: string): Promise<LeadStatusConfigRecord[]> {
  const persistedStatuses: LeadStatusConfigRecord[] = [];
  for (const statusTemplate of defaultLeadStatuses) {
    persistedStatuses.push(await persistLeadStatus(tenantId, { ...statusTemplate }));
  }
  return persistedStatuses;
}

export interface LeadOverrides {
  id?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  statusId?: string;
  source?: string;
  assignedToId?: string;
  estimatedValue?: number;
  expectedCloseDate?: Date;
  notes?: string;
  deleted?: DeletedStateRecord;
}

export async function persistLead(tenantId: string, overrides: LeadOverrides = {}): Promise<LeadRecord> {
  return prisma.lead.create({
    data: {
      id: randomUUID(),
      tenantId,
      companyName: 'Vidrios del Norte',
      contactName: 'Ana Gómez',
      email: 'ana.gomez@example.com',
      estimatedValue: DEFAULT_ESTIMATED_VALUE,
      ...overrides,
    },
  });
}

export interface ContactOverrides {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyId?: string;
  ownerId?: string;
  documentType?: DocumentTypeRecord;
  documentNumber?: string;
  deleted?: DeletedStateRecord;
}

export async function persistContact(tenantId: string, overrides: ContactOverrides = {}): Promise<ContactRecord> {
  return prisma.contact.create({
    data: {
      id: randomUUID(),
      tenantId,
      firstName: 'Laura',
      lastName: 'Martínez',
      email: 'laura.martinez@example.com',
      ...overrides,
    },
  });
}

export interface CompanyContactOverrides {
  id?: string;
  name?: string;
  industry?: string;
  taxNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  ownerId?: string;
  documentNumber?: string;
  deleted?: DeletedStateRecord;
}

export async function persistCompanyContact(
  tenantId: string,
  overrides: CompanyContactOverrides = {},
): Promise<CompanyContactRecord> {
  return prisma.companyContact.create({
    data: {
      id: randomUUID(),
      tenantId,
      name: 'Constructora El Roble',
      industry: 'Construcción',
      city: 'Bogotá',
      ...overrides,
    },
  });
}

/** Secreto del enlace de toda invitación creada por `persistUserInvitation`. */
export const TEST_INVITATION_SECRET = 'test-invitation-secret-for-every-persisted-invitation';
const INVITATION_LIFETIME_MS = 604_800_000;

export interface UserInvitationOverrides {
  id?: string;
  email?: string;
  role?: Role;
  expiresAt?: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
}

/** Invitación pendiente (F2-T05); su enlace es `testInvitationTokenFor(invitación.id)`. */
export async function persistUserInvitation(
  tenantId: string,
  invitedById: string,
  overrides: UserInvitationOverrides = {},
): Promise<UserInvitationRecord> {
  const id = overrides.id ?? randomUUID();
  return prisma.userInvitation.create({
    data: {
      id,
      tenantId,
      invitedById,
      email: `invitado.${id}@example.com`,
      role: Role.SALES_REP,
      tokenHash: hashOpaqueSecret(TEST_INVITATION_SECRET),
      expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
      ...overrides,
    },
  });
}

export function testInvitationTokenFor(invitationId: string): string {
  return `${invitationId}.${TEST_INVITATION_SECRET}`;
}

/** Una empresa lista para usar: un usuario por rol, un segundo comercial y los estados por defecto. */
export interface TenantWithTeam {
  tenant: TenantRecord;
  owner: UserRecord;
  partner: UserRecord;
  salesLeader: UserRecord;
  salesRep: UserRecord;
  otherSalesRep: UserRecord;
  leadStatuses: LeadStatusConfigRecord[];
  defaultLeadStatus: LeadStatusConfigRecord;
}

export async function persistTenantWithTeam(tenantOverrides: TenantOverrides = {}): Promise<TenantWithTeam> {
  const tenant = await persistTenant(tenantOverrides);
  const owner = await persistUser(tenant.id, { role: Role.OWNER });
  const partner = await persistUser(tenant.id, { role: Role.PARTNER });
  const salesLeader = await persistUser(tenant.id, { role: Role.SALES_LEADER });
  const salesRep = await persistUser(tenant.id, { role: Role.SALES_REP });
  const otherSalesRep = await persistUser(tenant.id, { role: Role.SALES_REP });
  const leadStatuses = await persistDefaultLeadStatuses(tenant.id);

  const defaultLeadStatus = leadStatuses.find((status) => status.isDefault);
  if (!defaultLeadStatus) {
    throw new Error('Default lead statuses must include one default status');
  }

  return { tenant, owner, partner, salesLeader, salesRep, otherSalesRep, leadStatuses, defaultLeadStatus };
}
