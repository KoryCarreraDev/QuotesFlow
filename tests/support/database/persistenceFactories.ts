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
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { defaultLeadStatuses } from '@/application/constants/defaultLeadStatuses.js';
import prisma from '@/config/database.js';
import { Role } from '@/domain/enums/Role.js';

/** Contraseña en texto plano de todo usuario creado por `persistUser`. */
export const TEST_USER_PASSWORD = 'Correct-Horse-Battery-9';

// Coste mínimo de bcrypt: en tests importa que el hash sea válido, no que sea lento.
const FAST_BCRYPT_COST = 4;
const TEST_USER_PASSWORD_HASH = bcrypt.hashSync(TEST_USER_PASSWORD, FAST_BCRYPT_COST);

const DEFAULT_ESTIMATED_VALUE = 1_500_000;
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
}

export async function persistUser(tenantId: string, overrides: UserOverrides = {}): Promise<UserRecord> {
  const id = overrides.id ?? randomUUID();
  return prisma.user.create({
    data: {
      id,
      tenantId,
      email: `user.${id}@example.com`,
      passwordHash: TEST_USER_PASSWORD_HASH,
      firstName: 'Carlos',
      lastName: 'Pérez',
      role: Role.SALES_REP,
      ...overrides,
    },
  });
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
