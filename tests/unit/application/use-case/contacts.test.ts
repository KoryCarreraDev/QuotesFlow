import { describe, expect, it } from 'vitest';
import { CompanyContactMapper } from '@/application/mappers/CompanyContactMapper.js';
import { ContactMapper } from '@/application/mappers/ContactMapper.js';
import { CreateCompanyContactUseCase } from '@/application/use-case/companyContacts/createCompanyContactUseCase.js';
import { GetCompanyContactsUseCase } from '@/application/use-case/companyContacts/getCompanyContactsUseCase.js';
import { UpdateCompanyContactUseCase } from '@/application/use-case/companyContacts/updateCompanyContactUseCase.js';
import { CreateContactUseCase } from '@/application/use-case/contacts/createContactUseCase.js';
import { GetContactsUseCase } from '@/application/use-case/contacts/getContactsUseCase.js';
import { UpdateContactUseCase } from '@/application/use-case/contacts/updateContactUseCase.js';
import {
  DEFAULT_TEST_TENANT_ID,
  NON_EXISTENT_ID,
  buildCompanyContact,
  buildContact,
} from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryCompanyContactRepository } from '@tests/support/doubles/InMemoryCompanyContactRepository.js';
import { InMemoryContactRepository } from '@tests/support/doubles/InMemoryContactRepository.js';

const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999';

function setupContactUseCases() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const contactRepository = new InMemoryContactRepository(tenantContext);
  const contactMapper = new ContactMapper();

  return {
    contactRepository,
    getContactsUseCase: new GetContactsUseCase(contactRepository, contactMapper),
    createContactUseCase: new CreateContactUseCase(contactRepository, contactMapper, tenantContext),
    updateContactUseCase: new UpdateContactUseCase(contactRepository, contactMapper, tenantContext),
  };
}

function setupCompanyContactUseCases() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const companyContactRepository = new InMemoryCompanyContactRepository(tenantContext);
  const companyContactMapper = new CompanyContactMapper();

  return {
    companyContactRepository,
    getCompanyContactsUseCase: new GetCompanyContactsUseCase(companyContactRepository, companyContactMapper),
    createCompanyContactUseCase: new CreateCompanyContactUseCase(
      companyContactRepository,
      companyContactMapper,
      tenantContext,
    ),
    updateCompanyContactUseCase: new UpdateCompanyContactUseCase(
      companyContactRepository,
      companyContactMapper,
      tenantContext,
    ),
  };
}

describe('GetContactsUseCase', () => {
  it('devuelve los contactos de la empresa y ninguno de otra', async () => {
    const { getContactsUseCase, contactRepository } = setupContactUseCases();
    const ownContact = buildContact();
    contactRepository.seed(ownContact, buildContact({ tenantId: OTHER_TENANT_ID }));

    const contacts = await getContactsUseCase.execute();

    expect(contacts.map((contact) => contact.id)).toEqual([ownContact.id]);
  });
});

describe('CreateContactUseCase', () => {
  it('guarda el contacto en la empresa del usuario y devuelve su DTO', async () => {
    const { createContactUseCase, contactRepository } = setupContactUseCases();

    const createdContact = await createContactUseCase.execute({
      firstName: 'Laura',
      lastName: 'Martínez',
      email: 'laura@example.com',
      phone: '3109876543',
      companyId: 'company-id',
    });

    expect(createdContact).toMatchObject({
      firstName: 'Laura',
      lastName: 'Martínez',
      email: 'laura@example.com',
      phone: '3109876543',
      companyId: 'company-id',
    });
    expect(contactRepository.findStoredById(createdContact.id)?.tenantId).toBe(DEFAULT_TEST_TENANT_ID);
  });
});

describe('UpdateContactUseCase', () => {
  it('actualiza solo los campos enviados y conserva el resto', async () => {
    const { updateContactUseCase, contactRepository } = setupContactUseCases();
    const contact = buildContact({ firstName: 'Laura', lastName: 'Martínez', phone: '3109876543' });
    contactRepository.seed(contact);

    const updatedContact = await updateContactUseCase.execute(contact.id, { lastName: 'Martínez Ruiz' });

    expect(updatedContact).toMatchObject({ firstName: 'Laura', lastName: 'Martínez Ruiz', phone: '3109876543' });
    expect(contactRepository.findStoredById(contact.id)?.lastName).toBe('Martínez Ruiz');
  });

  it('permite cambiar todos los campos a la vez', async () => {
    const { updateContactUseCase, contactRepository } = setupContactUseCases();
    const contact = buildContact();
    contactRepository.seed(contact);
    const allFieldsUpdate = {
      firstName: 'Laura Sofía',
      lastName: 'Martínez Ruiz',
      email: 'laura.ruiz@example.com',
      phone: '3201112233',
      companyId: 'another-company-id',
    };

    const updatedContact = await updateContactUseCase.execute(contact.id, allFieldsUpdate);

    expect(updatedContact).toEqual({ id: contact.id, ...allFieldsUpdate });
  });

  it('falla si falta el id del contacto', async () => {
    const { updateContactUseCase } = setupContactUseCases();

    await expect(updateContactUseCase.execute('', { lastName: 'Ruiz' })).rejects.toThrow(
      'All information is required',
    );
  });

  it('falla si el contacto no existe', async () => {
    const { updateContactUseCase } = setupContactUseCases();

    await expect(updateContactUseCase.execute(NON_EXISTENT_ID, { lastName: 'Ruiz' })).rejects.toThrow(
      'Contact not found',
    );
  });

  it('trata como inexistente un contacto de otra empresa y no lo modifica', async () => {
    const { updateContactUseCase, contactRepository } = setupContactUseCases();
    const foreignContact = buildContact({ tenantId: OTHER_TENANT_ID, lastName: 'Martínez' });
    contactRepository.seed(foreignContact);

    await expect(updateContactUseCase.execute(foreignContact.id, { lastName: 'Ruiz' })).rejects.toThrow(
      'Contact not found',
    );
    expect(contactRepository.findStoredById(foreignContact.id)?.lastName).toBe('Martínez');
  });
});

describe('GetCompanyContactsUseCase', () => {
  it('devuelve las empresas cliente del tenant y ninguna de otro', async () => {
    const { getCompanyContactsUseCase, companyContactRepository } = setupCompanyContactUseCases();
    const ownCompanyContact = buildCompanyContact();
    companyContactRepository.seed(ownCompanyContact, buildCompanyContact({ tenantId: OTHER_TENANT_ID }));

    const companyContacts = await getCompanyContactsUseCase.execute();

    expect(companyContacts.map((companyContact) => companyContact.id)).toEqual([ownCompanyContact.id]);
  });
});

describe('CreateCompanyContactUseCase', () => {
  it('guarda la empresa cliente en el tenant del usuario y devuelve su DTO', async () => {
    const { createCompanyContactUseCase, companyContactRepository } = setupCompanyContactUseCases();

    const createdCompanyContact = await createCompanyContactUseCase.execute({
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

    expect(createdCompanyContact).toMatchObject({
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
    expect(companyContactRepository.findStoredById(createdCompanyContact.id)?.tenantId).toBe(DEFAULT_TEST_TENANT_ID);
  });
});

describe('UpdateCompanyContactUseCase', () => {
  it('actualiza solo los campos enviados y conserva el resto', async () => {
    const { updateCompanyContactUseCase, companyContactRepository } = setupCompanyContactUseCases();
    const companyContact = buildCompanyContact({ name: 'Constructora El Roble', city: 'Bogotá' });
    companyContactRepository.seed(companyContact);

    const updatedCompanyContact = await updateCompanyContactUseCase.execute(companyContact.id, { city: 'Medellín' });

    expect(updatedCompanyContact).toMatchObject({ name: 'Constructora El Roble', city: 'Medellín' });
    expect(companyContactRepository.findStoredById(companyContact.id)?.city).toBe('Medellín');
  });

  it('permite cambiar todos los campos a la vez', async () => {
    const { updateCompanyContactUseCase, companyContactRepository } = setupCompanyContactUseCases();
    const companyContact = buildCompanyContact();
    companyContactRepository.seed(companyContact);
    const allFieldsUpdate = {
      name: 'Roble Construcciones',
      industry: 'Obra civil',
      taxNumber: '901999888',
      phone: '6045550000',
      email: 'contacto@roble.example.com',
      address: 'Carrera 43A # 1-50',
      city: 'Medellín',
      state: 'Antioquia',
      zip: '050021',
      country: 'Colombia',
    };

    const updatedCompanyContact = await updateCompanyContactUseCase.execute(companyContact.id, allFieldsUpdate);

    expect(updatedCompanyContact).toEqual({ id: companyContact.id, ...allFieldsUpdate });
  });

  it('falla si falta el id de la empresa cliente', async () => {
    const { updateCompanyContactUseCase } = setupCompanyContactUseCases();

    await expect(updateCompanyContactUseCase.execute('', { city: 'Medellín' })).rejects.toThrow(
      'All information is required',
    );
  });

  it('falla si la empresa cliente no existe', async () => {
    const { updateCompanyContactUseCase } = setupCompanyContactUseCases();

    await expect(updateCompanyContactUseCase.execute(NON_EXISTENT_ID, { city: 'Medellín' })).rejects.toThrow(
      'Company contact not found',
    );
  });

  it('trata como inexistente una empresa cliente de otro tenant y no la modifica', async () => {
    const { updateCompanyContactUseCase, companyContactRepository } = setupCompanyContactUseCases();
    const foreignCompanyContact = buildCompanyContact({ tenantId: OTHER_TENANT_ID, city: 'Bogotá' });
    companyContactRepository.seed(foreignCompanyContact);

    await expect(
      updateCompanyContactUseCase.execute(foreignCompanyContact.id, { city: 'Medellín' }),
    ).rejects.toThrow('Company contact not found');
    expect(companyContactRepository.findStoredById(foreignCompanyContact.id)?.city).toBe('Bogotá');
  });
});
