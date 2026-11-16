import { LeadStatusType } from '@/domain/enums/LeadStatusType.js';
// Constructores de entidades de dominio para tests unitarios.
// Cada uno devuelve una entidad válida con datos por defecto; el test solo declara lo que le importa.

import { randomUUID } from 'node:crypto';
import { CompanyContact } from '@/domain/entities/CompanyContact.js';
import { Contact } from '@/domain/entities/Contact.js';
import { Lead } from '@/domain/entities/Lead.js';
import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';
import { Tenant } from '@/domain/entities/Tenant.js';
import { User } from '@/domain/entities/User.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { Role } from '@/domain/enums/Role.js';

/** Tenant por defecto de las entidades construidas sin `tenantId`. */
export const DEFAULT_TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';

/** UUID válido que no corresponde a ningún registro. */
export const NON_EXISTENT_ID = '00000000-0000-4000-8000-000000000000';

const DEFAULT_TIMESTAMP = new Date('2026-01-15T10:00:00.000Z');
const DEFAULT_ESTIMATED_VALUE = 1_500_000;
const DEFAULT_STATUS_ORDER = 1;

export interface LeadBuilderProps {
  id: string;
  tenantId: string;
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
  createdAt?: Date;
  updatedAt?: Date;
  deleted?: DeletedState;
}

export function buildLead(overrides: Partial<LeadBuilderProps> = {}): Lead {
  const props: LeadBuilderProps = {
    id: randomUUID(),
    tenantId: DEFAULT_TEST_TENANT_ID,
    companyName: 'Vidrios del Norte',
    contactName: 'Ana Gómez',
    email: 'ana.gomez@example.com',
    phone: '3001234567',
    source: 'Referido',
    estimatedValue: DEFAULT_ESTIMATED_VALUE,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
    deleted: DeletedState.Active,
    ...overrides,
  };

  return new Lead(
    props.id,
    props.tenantId,
    props.companyName,
    props.contactName,
    props.email,
    props.phone,
    props.statusId,
    props.source,
    props.assignedToId,
    props.estimatedValue,
    props.expectedCloseDate,
    props.notes,
    props.createdAt,
    props.updatedAt,
    props.deleted,
  );
}

export interface LeadStatusConfigBuilderProps {
  id: string;
  tenantId: string;
  name: string;
  order: number;
  isDefault: boolean;
  color?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deleted?: DeletedState;
  type?: LeadStatusType;
}

export function buildLeadStatusConfig(overrides: Partial<LeadStatusConfigBuilderProps> = {}): LeadStatusConfig {
  const props: LeadStatusConfigBuilderProps = {
    id: randomUUID(),
    tenantId: DEFAULT_TEST_TENANT_ID,
    name: 'Nuevo',
    order: DEFAULT_STATUS_ORDER,
    isDefault: false,
    color: '#3B82F6',
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
    deleted: DeletedState.Active,
    ...overrides,
  };

  return new LeadStatusConfig(
    props.id,
    props.name,
    props.order,
    props.isDefault,
    props.updatedAt,
    props.createdAt,
    props.color,
    props.tenantId,
    props.deleted,
    props.type,
  );
}

export interface UserBuilderProps {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export function buildUser(overrides: Partial<UserBuilderProps> = {}): User {
  const id = overrides.id ?? randomUUID();
  const props: UserBuilderProps = {
    id,
    tenantId: DEFAULT_TEST_TENANT_ID,
    email: `user.${id}@example.com`,
    passwordHash: 'stored-password-hash',
    firstName: 'Carlos',
    lastName: 'Pérez',
    role: Role.SALES_REP,
    isActive: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
    ...overrides,
  };

  return new User(
    props.id,
    props.email,
    props.passwordHash,
    props.firstName,
    props.lastName,
    props.role,
    props.isActive,
    props.tenantId,
    props.createdAt,
    props.updatedAt,
  );
}

export interface TenantBuilderProps {
  id: string;
  name: string;
  logoUrl?: string | null;
  settings?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export function buildTenant(overrides: Partial<TenantBuilderProps> = {}): Tenant {
  const props: TenantBuilderProps = {
    id: randomUUID(),
    name: 'Aluminios Andinos SAS',
    logoUrl: null,
    settings: null,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
    ...overrides,
  };

  return new Tenant(props.id, props.name, props.logoUrl, props.settings, props.createdAt, props.updatedAt);
}

export interface ContactBuilderProps {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  companyId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function buildContact(overrides: Partial<ContactBuilderProps> = {}): Contact {
  const props: ContactBuilderProps = {
    id: randomUUID(),
    tenantId: DEFAULT_TEST_TENANT_ID,
    firstName: 'Laura',
    lastName: 'Martínez',
    email: 'laura.martinez@example.com',
    phone: '3109876543',
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
    ...overrides,
  };

  return new Contact(
    props.id,
    props.tenantId,
    props.firstName,
    props.lastName,
    props.email,
    props.phone,
    props.companyId,
    props.createdAt,
    props.updatedAt,
  );
}

export interface CompanyContactBuilderProps {
  id: string;
  tenantId: string;
  name: string;
  industry?: string;
  taxNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function buildCompanyContact(overrides: Partial<CompanyContactBuilderProps> = {}): CompanyContact {
  const props: CompanyContactBuilderProps = {
    id: randomUUID(),
    tenantId: DEFAULT_TEST_TENANT_ID,
    name: 'Constructora El Roble',
    industry: 'Construcción',
    taxNumber: '900123456',
    phone: '6015551234',
    email: 'compras@elroble.example.com',
    address: 'Calle 10 # 20-30',
    city: 'Bogotá',
    state: 'Cundinamarca',
    zip: '110111',
    country: 'Colombia',
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
    ...overrides,
  };

  return new CompanyContact(
    props.id,
    props.tenantId,
    props.name,
    props.industry,
    props.taxNumber,
    props.phone,
    props.email,
    props.address,
    props.city,
    props.state,
    props.zip,
    props.country,
    props.createdAt,
    props.updatedAt,
  );
}
