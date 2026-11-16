import { describe, expect, it } from 'vitest';
import { defaultLeadStatuses } from '@/application/constants/defaultLeadStatuses.js';
import { CompanyContactMapper } from '@/application/mappers/CompanyContactMapper.js';
import { ContactMapper } from '@/application/mappers/ContactMapper.js';
import { LeadStatusConfigMapper } from '@/application/mappers/LeadStatusConfigMapper.js';
import { LeadMapper } from '@/application/mappers/LeadMapper.js';
import {
  buildCompanyContact,
  buildContact,
  buildLead,
  buildLeadStatusConfig,
} from '@tests/support/builders/entityBuilders.js';

// Regla R8: la API responde con DTO, nunca con la entidad. Estos campos internos no deben salir.
const INTERNAL_FIELD_TENANT_ID = 'tenantId';

describe('LeadMapper', () => {
  it('copia al DTO los datos comerciales del lead', () => {
    const expectedCloseDate = new Date('2026-06-30T00:00:00.000Z');
    const lead = buildLead({
      statusId: 'status-id',
      assignedToId: 'user-id',
      expectedCloseDate,
      notes: 'Llamar el lunes',
    });

    const leadDTO = new LeadMapper().toDTO(lead);

    expect(leadDTO).toEqual({
      id: lead.id,
      companyName: lead.companyName,
      contactName: lead.contactName,
      email: lead.email,
      phone: lead.phone,
      statusId: 'status-id',
      source: lead.source,
      assignedToId: 'user-id',
      estimatedValue: lead.estimatedValue,
      expectedCloseDate,
      notes: 'Llamar el lunes',
    });
  });

  it('no expone el tenant ni el estado de borrado', () => {
    const leadDTO = new LeadMapper().toDTO(buildLead());

    expect(Object.keys(leadDTO)).not.toContain(INTERNAL_FIELD_TENANT_ID);
    expect(Object.keys(leadDTO)).not.toContain('deleted');
  });
});

describe('LeadStatusConfigMapper', () => {
  it('copia al DTO nombre, orden, color y marca de predeterminado', () => {
    const status = buildLeadStatusConfig({ name: 'Calificado', order: 3, isDefault: true, color: '#8B5CF6' });

    const statusDTO = new LeadStatusConfigMapper().toDTO(status);

    expect(statusDTO).toMatchObject({
      id: status.id,
      name: 'Calificado',
      order: 3,
      isDefault: true,
      color: '#8B5CF6',
    });
  });

  it('no expone el tenant', () => {
    const statusDTO = new LeadStatusConfigMapper().toDTO(buildLeadStatusConfig());

    expect(Object.keys(statusDTO)).not.toContain(INTERNAL_FIELD_TENANT_ID);
  });
});

describe('ContactMapper', () => {
  it('copia al DTO los datos del contacto y nada más', () => {
    const contact = buildContact({ companyId: 'company-id' });

    const contactDTO = new ContactMapper().toDTO(contact);

    expect(contactDTO).toEqual({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      companyId: 'company-id',
    });
  });
});

describe('CompanyContactMapper', () => {
  it('copia al DTO los datos de la empresa y nada más', () => {
    const companyContact = buildCompanyContact();

    const companyContactDTO = new CompanyContactMapper().toDTO(companyContact);

    expect(companyContactDTO).toEqual({
      id: companyContact.id,
      name: companyContact.name,
      industry: companyContact.industry,
      taxNumber: companyContact.taxNumber,
      phone: companyContact.phone,
      email: companyContact.email,
      address: companyContact.address,
      city: companyContact.city,
      state: companyContact.state,
      zip: companyContact.zip,
      country: companyContact.country,
    });
  });
});

describe('defaultLeadStatuses', () => {
  it('define los cinco estados iniciales de toda empresa nueva', () => {
    expect(defaultLeadStatuses.map((status) => status.name)).toEqual([
      'Nuevo',
      'Contactado',
      'Calificado',
      'Ganado',
      'Perdido',
    ]);
  });

  it('marca exactamente un estado como predeterminado: Nuevo', () => {
    const defaultStatuses = defaultLeadStatuses.filter((status) => status.isDefault);

    expect(defaultStatuses.map((status) => status.name)).toEqual(['Nuevo']);
  });

  it('no repite el orden, porque la base de datos exige orden único por tenant', () => {
    const orders = defaultLeadStatuses.map((status) => status.order);

    expect(new Set(orders).size).toBe(orders.length);
  });
});
