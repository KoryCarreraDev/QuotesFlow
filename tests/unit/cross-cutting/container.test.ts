import { describe, expect, it } from 'vitest';
import { LoginUseCase } from '@/application/use-case/auth/LoginUseCase.js';
import { RegisterCompanyAndOwnerUseCase } from '@/application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { CreateCompanyContactUseCase } from '@/application/use-case/companyContacts/createCompanyContactUseCase.js';
import { GetCompanyContactsUseCase } from '@/application/use-case/companyContacts/getCompanyContactsUseCase.js';
import { UpdateCompanyContactUseCase } from '@/application/use-case/companyContacts/updateCompanyContactUseCase.js';
import { CreateContactUseCase } from '@/application/use-case/contacts/createContactUseCase.js';
import { GetContactsUseCase } from '@/application/use-case/contacts/getContactsUseCase.js';
import { UpdateContactUseCase } from '@/application/use-case/contacts/updateContactUseCase.js';
import { GenericListFilteredUseCase } from '@/application/use-case/filter/GenericListFilteredUseCase.js';
import { CreateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/createLeadStatusConfigUseCase.js';
import { GetLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/getLeadStatusConfigUseCase.js';
import { UpdateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/updateLeadStatusConfigUseCase.js';
import { CreateLeadUseCase } from '@/application/use-case/leads/createLeadUseCase.js';
import { DeleteLeadUseCase } from '@/application/use-case/leads/deleteLeadUseCase.js';
import { GetLeadsUseCase } from '@/application/use-case/leads/getLeadsUseCase.js';
import { UpdateLeadUseCase } from '@/application/use-case/leads/updateLeadUseCase.js';
import { ScopedContainer } from '@/cross-cutting/container.js';
import { Role } from '@/domain/enums/Role.js';
import { DEFAULT_TEST_TENANT_ID } from '@tests/support/builders/entityBuilders.js';

// F1-T09: el contenedor se divide por módulo. Crear los casos de uso no toca la base de datos.

describe('ScopedContainer', () => {
  const container = new ScopedContainer(DEFAULT_TEST_TENANT_ID);

  it.each([
    [
      'auth.getRegisterCompanyUseCase',
      () => container.auth.getRegisterCompanyUseCase(),
      RegisterCompanyAndOwnerUseCase,
    ],
    ['auth.getLoginUseCase', () => container.auth.getLoginUseCase(), LoginUseCase],
    ['leads.getGetLeadsUseCase', () => container.leads.getGetLeadsUseCase(), GetLeadsUseCase],
    ['leads.getCreateLeadUseCase', () => container.leads.getCreateLeadUseCase(), CreateLeadUseCase],
    ['leads.getUpdateLeadUseCase', () => container.leads.getUpdateLeadUseCase(), UpdateLeadUseCase],
    ['leads.getDeleteLeadUseCase', () => container.leads.getDeleteLeadUseCase(), DeleteLeadUseCase],
    [
      'leads.getListFilteredLeadsUseCase',
      () => container.leads.getListFilteredLeadsUseCase(),
      GenericListFilteredUseCase,
    ],
    [
      'leadStatuses.getGetLeadStatusConfigUseCase',
      () => container.leadStatuses.getGetLeadStatusConfigUseCase(),
      GetLeadStatusConfigUseCase,
    ],
    [
      'leadStatuses.getCreateLeadStatusConfigUseCase',
      () => container.leadStatuses.getCreateLeadStatusConfigUseCase(),
      CreateLeadStatusConfigUseCase,
    ],
    [
      'leadStatuses.getUpdateLeadStatusConfigUseCase',
      () => container.leadStatuses.getUpdateLeadStatusConfigUseCase(),
      UpdateLeadStatusConfigUseCase,
    ],
    ['contacts.getGetContactsUseCase', () => container.contacts.getGetContactsUseCase(), GetContactsUseCase],
    ['contacts.getCreateContactUseCase', () => container.contacts.getCreateContactUseCase(), CreateContactUseCase],
    ['contacts.getUpdateContactUseCase', () => container.contacts.getUpdateContactUseCase(), UpdateContactUseCase],
    [
      'contacts.getListFilteredContactsUseCase',
      () => container.contacts.getListFilteredContactsUseCase(),
      GenericListFilteredUseCase,
    ],
    [
      'companyContacts.getGetCompanyContactsUseCase',
      () => container.companyContacts.getGetCompanyContactsUseCase(),
      GetCompanyContactsUseCase,
    ],
    [
      'companyContacts.getCreateCompanyContactUseCase',
      () => container.companyContacts.getCreateCompanyContactUseCase(),
      CreateCompanyContactUseCase,
    ],
    [
      'companyContacts.getUpdateCompanyContactUseCase',
      () => container.companyContacts.getUpdateCompanyContactUseCase(),
      UpdateCompanyContactUseCase,
    ],
    [
      'companyContacts.getListFilteredCompanyContactsUseCase',
      () => container.companyContacts.getListFilteredCompanyContactsUseCase(),
      GenericListFilteredUseCase,
    ],
  ])('%s construye su caso de uso', (_name, buildUseCase, expectedClass) => {
    expect(buildUseCase()).toBeInstanceOf(expectedClass);
  });

  it('cada llamada construye una instancia nueva: nada se comparte entre peticiones', () => {
    expect(container.leads.getGetLeadsUseCase()).not.toBe(container.leads.getGetLeadsUseCase());
  });

  it('sin tenant, los casos de uso que lo necesitan fallan al pedirlo en lugar de usar otro', async () => {
    const publicContainer = new ScopedContainer();

    await expect(publicContainer.leads.getGetLeadsUseCase().execute(Role.OWNER)).rejects.toThrow(
      'Tenant context not available in this scope',
    );
  });
});
