import { describe, expect, it } from 'vitest';
import { GetCompanyContactsUseCase } from '@/application/use-case/companyContacts/getCompanyContactsUseCase.js';
import { GetContactsUseCase } from '@/application/use-case/contacts/getContactsUseCase.js';
import { GetLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/getLeadStatusConfigUseCase.js';
import { GetLeadsUseCase } from '@/application/use-case/leads/getLeadsUseCase.js';
import { Role } from '@/domain/enums/Role.js';
import {
  DEFAULT_TEST_TENANT_ID,
  buildCompanyContact,
  buildContact,
  buildLead,
  buildLeadStatusConfig,
} from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryCompanyContactRepository } from '@tests/support/doubles/InMemoryCompanyContactRepository.js';
import { InMemoryContactRepository } from '@tests/support/doubles/InMemoryContactRepository.js';
import { InMemoryLeadRepository } from '@tests/support/doubles/InMemoryLeadRepository.js';
import { InMemoryLeadStatusConfigRepository } from '@tests/support/doubles/InMemoryLeadStatusConfigRepository.js';

// Regresión de F1-T15: `records.map(this.mapper.toDTO)` pasaba el método sin su objeto, así que un
// mapper que usara `this` fallaba. Los mappers actuales no lo usan; este mapper sí, a propósito.
class MapperThatUsesThis {
  private readonly prefix = 'mapped';

  toDTO(record: { id: string }): { id: string; label: string } {
    return { id: record.id, label: `${this.prefix}:${record.id}` };
  }
}

describe('los casos de uso de listado llaman al mapper con su objeto', () => {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);

  it('GetLeadsUseCase', async () => {
    const leadRepository = new InMemoryLeadRepository(tenantContext);
    const lead = buildLead();
    leadRepository.seed(lead);

    const leads = await new GetLeadsUseCase(leadRepository, new MapperThatUsesThis() as never).execute(Role.OWNER);

    expect(leads).toEqual([{ id: lead.id, label: `mapped:${lead.id}` }]);
  });

  it('GetContactsUseCase', async () => {
    const contactRepository = new InMemoryContactRepository(tenantContext);
    const contact = buildContact();
    contactRepository.seed(contact);

    const contacts = await new GetContactsUseCase(contactRepository, new MapperThatUsesThis() as never).execute();

    expect(contacts).toEqual([{ id: contact.id, label: `mapped:${contact.id}` }]);
  });

  it('GetCompanyContactsUseCase', async () => {
    const companyContactRepository = new InMemoryCompanyContactRepository(tenantContext);
    const companyContact = buildCompanyContact();
    companyContactRepository.seed(companyContact);

    const companyContacts = await new GetCompanyContactsUseCase(
      companyContactRepository,
      new MapperThatUsesThis() as never,
    ).execute();

    expect(companyContacts).toEqual([{ id: companyContact.id, label: `mapped:${companyContact.id}` }]);
  });

  it('GetLeadStatusConfigUseCase', async () => {
    const leadStatusRepository = new InMemoryLeadStatusConfigRepository(tenantContext);
    const status = buildLeadStatusConfig();
    leadStatusRepository.seed(status);

    const statuses = await new GetLeadStatusConfigUseCase(
      leadStatusRepository,
      new MapperThatUsesThis() as never,
      tenantContext,
    ).execute();

    expect(statuses).toEqual([{ id: status.id, label: `mapped:${status.id}` }]);
  });
});
