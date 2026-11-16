// Defensa en profundidad: aunque el middleware siempre fija el tenant, ningún caso de uso
// debe leer ni escribir datos si el contexto llega sin tenant.

import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CompanyContactMapper } from '@/application/mappers/CompanyContactMapper.js';
import { ContactMapper } from '@/application/mappers/ContactMapper.js';
import { LeadStatusConfigMapper } from '@/application/mappers/LeadConfigStatusMapper.js';
import { LeadMapper } from '@/application/mappers/LeadMapper.js';
import { CreateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/createLeadStatusConfigUseCase.js';
import { GetLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/getLeadStatusConfigUseCase.js';
import { UpdateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/updateLeadStatusConfigUseCase.js';
import { CreateCompanyContactUseCase } from '@/application/use-case/companyContacts/createCompanyContactUseCase.js';
import { UpdateCompanyContactUseCase } from '@/application/use-case/companyContacts/updateCompanyContactUseCase.js';
import { CreateContactUseCase } from '@/application/use-case/contacts/createContactUseCase.js';
import { UpdateContactUseCase } from '@/application/use-case/contacts/updateContactUseCase.js';
import { CreateLeadUseCase } from '@/application/use-case/leads/createLeadUseCase.js';
import { DeleteLeadUseCase } from '@/application/use-case/leads/deleteLeadUseCase.js';
import { UpdateLeadUseCase } from '@/application/use-case/leads/updateLeadUseCase.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
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
import { InMemoryUserRepository } from '@tests/support/doubles/InMemoryUserRepository.js';

const MISSING_TENANT_ID = '';

function setupWithoutTenant() {
  const contextWithoutTenant = new FixedTenantContext(MISSING_TENANT_ID);
  // Los repositorios guardan datos de una empresa real para comprobar que nada se lee ni se altera.
  const tenantContextOfStoredData = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);

  const leadRepository = new InMemoryLeadRepository(tenantContextOfStoredData);
  const leadStatusRepository = new InMemoryLeadStatusConfigRepository(tenantContextOfStoredData);
  const userRepository = new InMemoryUserRepository(tenantContextOfStoredData);
  const contactRepository = new InMemoryContactRepository(tenantContextOfStoredData);
  const companyContactRepository = new InMemoryCompanyContactRepository(tenantContextOfStoredData);

  const storedLead = buildLead({ notes: 'Nota original' });
  const storedStatus = buildLeadStatusConfig({ name: 'Nuevo', isDefault: true });
  const storedContact = buildContact({ lastName: 'Martínez' });
  const storedCompanyContact = buildCompanyContact({ city: 'Bogotá' });
  leadRepository.seed(storedLead);
  leadStatusRepository.seed(storedStatus);
  contactRepository.seed(storedContact);
  companyContactRepository.seed(storedCompanyContact);

  return {
    contextWithoutTenant,
    leadRepository,
    leadStatusRepository,
    userRepository,
    contactRepository,
    companyContactRepository,
    storedLead,
    storedStatus,
    storedContact,
    storedCompanyContact,
  };
}

describe('Casos de uso sin tenant en el contexto', () => {
  it('CreateLeadUseCase no crea el lead', async () => {
    const { contextWithoutTenant, leadRepository, leadStatusRepository, userRepository } = setupWithoutTenant();
    const createLeadUseCase = new CreateLeadUseCase(
      leadRepository,
      new LeadMapper(),
      contextWithoutTenant,
      leadStatusRepository,
      userRepository,
    );

    await expect(createLeadUseCase.execute({ contactName: 'Ana Gómez' }, randomUUID(), Role.OWNER)).rejects.toThrow();
    expect(leadRepository.listStored()).toHaveLength(1);
  });

  it('UpdateLeadUseCase no modifica el lead', async () => {
    const { contextWithoutTenant, leadRepository, storedLead } = setupWithoutTenant();
    const updateLeadUseCase = new UpdateLeadUseCase(
      leadRepository,
      new LeadMapper(),
      contextWithoutTenant,
      new InMemoryUserRepository(contextWithoutTenant),
    );

    await expect(
      updateLeadUseCase.execute(storedLead.id, { notes: 'Nota nueva' }, Role.OWNER, randomUUID()),
    ).rejects.toThrow();
    expect(leadRepository.findStoredById(storedLead.id)?.notes).toBe('Nota original');
  });

  it('DeleteLeadUseCase no borra el lead', async () => {
    const { contextWithoutTenant, leadRepository, storedLead } = setupWithoutTenant();
    const deleteLeadUseCase = new DeleteLeadUseCase(leadRepository, contextWithoutTenant);

    await expect(deleteLeadUseCase.execute(storedLead.id, randomUUID(), Role.OWNER)).rejects.toThrow();
    expect(leadRepository.findStoredById(storedLead.id)?.deleted).toBe(DeletedState.Active);
  });

  it('GetLeadStatusConfigUseCase no devuelve estados', async () => {
    const { contextWithoutTenant, leadStatusRepository } = setupWithoutTenant();
    const getLeadStatusUseCase = new GetLeadStatusConfigUseCase(
      leadStatusRepository,
      new LeadStatusConfigMapper(),
      contextWithoutTenant,
    );

    await expect(getLeadStatusUseCase.execute()).rejects.toThrow();
  });

  it('CreateLeadStatusConfigUseCase no crea el estado', async () => {
    const { contextWithoutTenant, leadStatusRepository } = setupWithoutTenant();
    const createLeadStatusUseCase = new CreateLeadStatusConfigUseCase(
      leadStatusRepository,
      new LeadStatusConfigMapper(),
      contextWithoutTenant,
    );

    await expect(
      createLeadStatusUseCase.execute({ name: 'En negociación', order: 3, isDefault: true }, Role.OWNER),
    ).rejects.toThrow();
    expect(leadStatusRepository.listStored()).toHaveLength(1);
  });

  it('UpdateLeadStatusConfigUseCase no modifica el estado', async () => {
    const { contextWithoutTenant, leadStatusRepository, storedStatus } = setupWithoutTenant();
    const updateLeadStatusUseCase = new UpdateLeadStatusConfigUseCase(
      leadStatusRepository,
      new LeadStatusConfigMapper(),
      contextWithoutTenant,
    );

    await expect(
      updateLeadStatusUseCase.execute(storedStatus.id, { name: 'Renombrado' }, Role.OWNER, randomUUID()),
    ).rejects.toThrow();
    expect(leadStatusRepository.findStoredById(storedStatus.id)?.name).toBe('Nuevo');
  });

  it('CreateContactUseCase no crea el contacto', async () => {
    const { contextWithoutTenant, contactRepository } = setupWithoutTenant();
    const createContactUseCase = new CreateContactUseCase(contactRepository, new ContactMapper(), contextWithoutTenant);

    await expect(createContactUseCase.execute({ firstName: 'Laura', lastName: 'Martínez' })).rejects.toThrow();
    expect(contactRepository.listStored()).toHaveLength(1);
  });

  it('UpdateContactUseCase no modifica el contacto', async () => {
    const { contextWithoutTenant, contactRepository, storedContact } = setupWithoutTenant();
    const updateContactUseCase = new UpdateContactUseCase(contactRepository, new ContactMapper(), contextWithoutTenant);

    await expect(updateContactUseCase.execute(storedContact.id, { lastName: 'Ruiz' })).rejects.toThrow();
    expect(contactRepository.findStoredById(storedContact.id)?.lastName).toBe('Martínez');
  });

  it('CreateCompanyContactUseCase no crea la empresa cliente', async () => {
    const { contextWithoutTenant, companyContactRepository } = setupWithoutTenant();
    const createCompanyContactUseCase = new CreateCompanyContactUseCase(
      companyContactRepository,
      new CompanyContactMapper(),
      contextWithoutTenant,
    );

    await expect(createCompanyContactUseCase.execute({ name: 'Constructora El Roble' })).rejects.toThrow();
    expect(companyContactRepository.listStored()).toHaveLength(1);
  });

  it('UpdateCompanyContactUseCase no modifica la empresa cliente', async () => {
    const { contextWithoutTenant, companyContactRepository, storedCompanyContact } = setupWithoutTenant();
    const updateCompanyContactUseCase = new UpdateCompanyContactUseCase(
      companyContactRepository,
      new CompanyContactMapper(),
      contextWithoutTenant,
    );

    await expect(updateCompanyContactUseCase.execute(storedCompanyContact.id, { city: 'Medellín' })).rejects.toThrow();
    expect(companyContactRepository.findStoredById(storedCompanyContact.id)?.city).toBe('Bogotá');
  });
});

describe('UpdateLeadUseCase ante un repositorio que devolviera un lead borrado', () => {
  it('rechaza la actualización: un lead borrado no se modifica aunque el repositorio lo entregue', async () => {
    const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
    const leadRepository = new InMemoryLeadRepository(tenantContext);
    const deletedLead = buildLead({ deleted: DeletedState.Inactive, notes: 'Nota original' });
    leadRepository.seed(deletedLead);
    vi.spyOn(leadRepository, 'findById').mockResolvedValue(deletedLead);
    const updateLeadUseCase = new UpdateLeadUseCase(
      leadRepository,
      new LeadMapper(),
      tenantContext,
      new InMemoryUserRepository(tenantContext),
    );

    await expect(
      updateLeadUseCase.execute(deletedLead.id, { notes: 'Nota nueva' }, Role.OWNER, randomUUID()),
    ).rejects.toThrow('This lead is deleted');
    expect(leadRepository.findStoredById(deletedLead.id)?.notes).toBe('Nota original');
  });
});
