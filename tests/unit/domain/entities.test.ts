import { describe, expect, it } from 'vitest';
import { CompanyContact } from '@/domain/entities/CompanyContact.js';
import { Contact } from '@/domain/entities/Contact.js';
import { Lead } from '@/domain/entities/Lead.js';
import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';
import { Tenant } from '@/domain/entities/Tenant.js';
import { User } from '@/domain/entities/User.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { Role } from '@/domain/enums/Role.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = new Date('2026-02-01T08:00:00.000Z');
const UPDATED_AT = new Date('2026-02-02T09:30:00.000Z');

describe('Lead', () => {
  it('create genera un id UUID propio y fecha de creación igual a la de actualización', () => {
    const lead = Lead.create({ tenantId: TENANT_ID, contactName: 'Ana Gómez' });

    expect(lead.id).toMatch(UUID_PATTERN);
    expect(lead.tenantId).toBe(TENANT_ID);
    expect(lead.contactName).toBe('Ana Gómez');
    expect(lead.createdAt).toBeInstanceOf(Date);
    expect(lead.updatedAt).toEqual(lead.createdAt);
  });

  it('create asigna un id distinto a cada lead', () => {
    const firstLead = Lead.create({ tenantId: TENANT_ID });
    const secondLead = Lead.create({ tenantId: TENANT_ID });

    expect(firstLead.id).not.toBe(secondLead.id);
  });

  it('create conserva todos los datos recibidos', () => {
    const expectedCloseDate = new Date('2026-06-30T00:00:00.000Z');

    const lead = Lead.create({
      tenantId: TENANT_ID,
      companyName: 'Vidrios del Norte',
      contactName: 'Ana Gómez',
      email: 'ana@example.com',
      phone: '3001234567',
      statusId: 'status-id',
      source: 'Referido',
      assignedToId: 'user-id',
      estimatedValue: 2_500_000,
      expectedCloseDate,
      notes: 'Llamar el lunes',
    });

    expect(lead).toMatchObject({
      companyName: 'Vidrios del Norte',
      email: 'ana@example.com',
      phone: '3001234567',
      statusId: 'status-id',
      source: 'Referido',
      assignedToId: 'user-id',
      estimatedValue: 2_500_000,
      expectedCloseDate,
      notes: 'Llamar el lunes',
    });
  });

  it('fromPrisma convierte los null de la base de datos en undefined', () => {
    const lead = Lead.fromPrisma({
      id: RECORD_ID,
      tenantId: TENANT_ID,
      companyName: null,
      contactName: null,
      email: null,
      phone: null,
      statusId: null,
      source: null,
      assignedToId: null,
      estimatedValue: null,
      expectedCloseDate: null,
      notes: null,
    });

    expect(lead.id).toBe(RECORD_ID);
    expect(lead.companyName).toBeUndefined();
    expect(lead.contactName).toBeUndefined();
    expect(lead.email).toBeUndefined();
    expect(lead.phone).toBeUndefined();
    expect(lead.statusId).toBeUndefined();
    expect(lead.source).toBeUndefined();
    expect(lead.assignedToId).toBeUndefined();
    expect(lead.estimatedValue).toBeUndefined();
    expect(lead.expectedCloseDate).toBeUndefined();
    expect(lead.notes).toBeUndefined();
  });

  it('fromPrisma conserva los datos presentes, incluido el estado de borrado', () => {
    const lead = Lead.fromPrisma({
      id: RECORD_ID,
      tenantId: TENANT_ID,
      contactName: 'Ana Gómez',
      statusId: 'status-id',
      assignedToId: 'user-id',
      estimatedValue: '2500000',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      deleted: DeletedState.Inactive,
    });

    expect(lead.contactName).toBe('Ana Gómez');
    expect(lead.statusId).toBe('status-id');
    expect(lead.assignedToId).toBe('user-id');
    expect(lead.estimatedValue).toBe(2_500_000);
    expect(lead.createdAt).toEqual(CREATED_AT);
    expect(lead.updatedAt).toEqual(UPDATED_AT);
    expect(lead.deleted).toBe(DeletedState.Inactive);
  });
});

describe('LeadStatusConfig', () => {
  it('create genera un id UUID y conserva nombre, orden, color, tenant y marca de predeterminado', () => {
    const status = LeadStatusConfig.create({
      name: 'Contactado',
      order: 2,
      isDefault: false,
      tenantId: TENANT_ID,
      color: '#F59E0B',
    });

    expect(status.id).toMatch(UUID_PATTERN);
    expect(status).toMatchObject({
      name: 'Contactado',
      order: 2,
      isDefault: false,
      tenantId: TENANT_ID,
      color: '#F59E0B',
    });
    expect(status.createdAt).toBeInstanceOf(Date);
  });

  it('fromPrisma mapea el registro de la base de datos y convierte el color null en undefined', () => {
    const status = LeadStatusConfig.fromPrisma({
      id: RECORD_ID,
      tenantId: TENANT_ID,
      name: 'Nuevo',
      order: 1,
      isDefault: true,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      color: null,
      deleted: DeletedState.Active,
    });

    expect(status).toMatchObject({
      id: RECORD_ID,
      tenantId: TENANT_ID,
      name: 'Nuevo',
      order: 1,
      isDefault: true,
      createdAt: CREATED_AT,
      updateAt: UPDATED_AT,
      deleted: DeletedState.Active,
    });
    expect(status.color).toBeUndefined();
  });
});

describe('Contact', () => {
  it('create genera un id UUID y conserva los datos recibidos', () => {
    const contact = Contact.create({
      tenantId: TENANT_ID,
      firstName: 'Laura',
      lastName: 'Martínez',
      email: 'laura@example.com',
      phone: '3109876543',
      companyId: 'company-id',
    });

    expect(contact.id).toMatch(UUID_PATTERN);
    expect(contact).toMatchObject({
      tenantId: TENANT_ID,
      firstName: 'Laura',
      lastName: 'Martínez',
      email: 'laura@example.com',
      phone: '3109876543',
      companyId: 'company-id',
    });
    expect(contact.updatedAt).toEqual(contact.createdAt);
  });

  it('fromPrisma convierte los null de la base de datos en undefined', () => {
    const contact = Contact.fromPrisma({
      id: RECORD_ID,
      tenantId: TENANT_ID,
      firstName: 'Laura',
      lastName: 'Martínez',
      email: null,
      phone: null,
      companyId: null,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });

    expect(contact.firstName).toBe('Laura');
    expect(contact.email).toBeUndefined();
    expect(contact.phone).toBeUndefined();
    expect(contact.companyId).toBeUndefined();
    expect(contact.createdAt).toEqual(CREATED_AT);
  });
});

describe('CompanyContact', () => {
  it('create genera un id UUID y conserva los datos recibidos', () => {
    const companyContact = CompanyContact.create({
      tenantId: TENANT_ID,
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
    });

    expect(companyContact.id).toMatch(UUID_PATTERN);
    expect(companyContact).toMatchObject({
      tenantId: TENANT_ID,
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
    });
  });

  it('fromPrisma convierte los null de la base de datos en undefined', () => {
    const companyContact = CompanyContact.fromPrisma({
      id: RECORD_ID,
      tenantId: TENANT_ID,
      name: 'Constructora El Roble',
      industry: null,
      taxNumber: null,
      phone: null,
      email: null,
      address: null,
      city: null,
      state: null,
      zip: null,
      country: null,
    });

    expect(companyContact.name).toBe('Constructora El Roble');
    expect(companyContact.industry).toBeUndefined();
    expect(companyContact.taxNumber).toBeUndefined();
    expect(companyContact.phone).toBeUndefined();
    expect(companyContact.email).toBeUndefined();
    expect(companyContact.address).toBeUndefined();
    expect(companyContact.city).toBeUndefined();
    expect(companyContact.state).toBeUndefined();
    expect(companyContact.zip).toBeUndefined();
    expect(companyContact.country).toBeUndefined();
  });
});

describe('Tenant', () => {
  it('create genera un id UUID y deja logo y configuración en null si no se indican', () => {
    const tenant = Tenant.create({ name: 'Aluminios Andinos SAS' });

    expect(tenant.id).toMatch(UUID_PATTERN);
    expect(tenant.name).toBe('Aluminios Andinos SAS');
    expect(tenant.logoUrl).toBeNull();
    expect(tenant.settings).toBeNull();
  });

  it('create conserva logo y configuración cuando se indican', () => {
    const tenant = Tenant.create({
      name: 'Aluminios Andinos SAS',
      logoUrl: 'https://example.com/logo.png',
      settings: { timezone: 'America/Bogota' },
    });

    expect(tenant.logoUrl).toBe('https://example.com/logo.png');
    expect(tenant.settings).toEqual({ timezone: 'America/Bogota' });
  });
});

describe('User', () => {
  it('create genera un id UUID y deja al usuario activo', () => {
    const user = User.create({
      email: 'owner@example.com',
      passwordHash: 'stored-password-hash',
      firstName: 'Carlos',
      lastName: 'Pérez',
      role: Role.OWNER,
      tenantId: TENANT_ID,
    });

    expect(user.id).toMatch(UUID_PATTERN);
    expect(user).toMatchObject({
      email: 'owner@example.com',
      passwordHash: 'stored-password-hash',
      firstName: 'Carlos',
      lastName: 'Pérez',
      role: Role.OWNER,
      tenantId: TENANT_ID,
      isActive: true,
    });
  });
});

describe('Enums de dominio', () => {
  it('Role declara exactamente los cuatro roles del negocio', () => {
    expect(Object.values(Role).sort()).toEqual(['OWNER', 'PARTNER', 'SALES_LEADER', 'SALES_REP']);
  });

  it('DeletedState usa los mismos valores que el enum de la base de datos', () => {
    expect(DeletedState.Active).toBe('INUSE');
    expect(DeletedState.Inactive).toBe('DELETED');
  });
});
