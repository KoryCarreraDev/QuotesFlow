import { describe, expect, it } from 'vitest';
import { CompanyContactMapper } from '@/application/mappers/CompanyContactMapper.js';
import { ContactMapper } from '@/application/mappers/ContactMapper.js';
import { CreateCompanyContactUseCase } from '@/application/use-case/companyContacts/createCompanyContactUseCase.js';
import { GetCompanyContactsUseCase } from '@/application/use-case/companyContacts/getCompanyContactsUseCase.js';
import { UpdateCompanyContactUseCase } from '@/application/use-case/companyContacts/updateCompanyContactUseCase.js';
import { CreateContactUseCase } from '@/application/use-case/contacts/createContactUseCase.js';
import { GetContactsUseCase } from '@/application/use-case/contacts/getContactsUseCase.js';
import { UpdateContactUseCase } from '@/application/use-case/contacts/updateContactUseCase.js';
import { DeleteContactUseCase } from '@/application/use-case/contacts/deleteContactUseCase.js';
import { DeleteCompanyContactUseCase } from '@/application/use-case/companyContacts/deleteCompanyContactUseCase.js';
import { Role } from '@/domain/enums/Role.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
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
  const companyContactRepository = new InMemoryCompanyContactRepository(tenantContext);
  const contactMapper = new ContactMapper();
  // Desde F1-T16 el `companyId` de un contacto tiene que ser una empresa cliente de la misma empresa.
  companyContactRepository.seed(
    buildCompanyContact({ id: 'company-id' }),
    buildCompanyContact({ id: 'another-company-id' }),
  );

  return {
    contactRepository,
    companyContactRepository,
    getContactsUseCase: new GetContactsUseCase(contactRepository, contactMapper),
    createContactUseCase: new CreateContactUseCase(
      contactRepository,
      contactMapper,
      tenantContext,
      companyContactRepository,
    ),
    updateContactUseCase: new UpdateContactUseCase(
      contactRepository,
      contactMapper,
      tenantContext,
      companyContactRepository,
    ),
    deleteContactUseCase: new DeleteContactUseCase(contactRepository),
  };
}

function setupCompanyContactUseCases() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const companyContactRepository = new InMemoryCompanyContactRepository(tenantContext);
  const companyContactMapper = new CompanyContactMapper();

  const contactRepository = new InMemoryContactRepository(tenantContext);

  return {
    companyContactRepository,
    contactRepository,
    deleteCompanyContactUseCase: new DeleteCompanyContactUseCase(companyContactRepository, contactRepository),
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

    await expect(updateContactUseCase.execute('', { lastName: 'Ruiz' })).rejects.toThrow('All information is required');
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

    await expect(updateCompanyContactUseCase.execute(foreignCompanyContact.id, { city: 'Medellín' })).rejects.toThrow(
      'Company contact not found',
    );
    expect(companyContactRepository.findStoredById(foreignCompanyContact.id)?.city).toBe('Bogotá');
  });
});

const managementActor = { role: Role.OWNER, userId: '22222222-2222-4222-8222-222222222222' };
const salesRepActor = { role: Role.SALES_REP, userId: '33333333-3333-4333-8333-333333333333' };

// Regresión de H9: un contacto aceptaba como `companyId` una empresa cliente de otro tenant.
describe('empresa cliente de un contacto (H9)', () => {
  it('crear con una empresa cliente de otro tenant responde ValidationError INVALID_COMPANY_CONTACT', async () => {
    const { createContactUseCase, companyContactRepository, contactRepository } = setupContactUseCases();
    const foreignCompanyContact = buildCompanyContact({ tenantId: OTHER_TENANT_ID });
    companyContactRepository.seed(foreignCompanyContact);

    await expect(
      createContactUseCase.execute({ firstName: 'Laura', lastName: 'Martínez', companyId: foreignCompanyContact.id }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_COMPANY_CONTACT });
    expect(contactRepository.listStored()).toEqual([]);
  });

  it('crear con una empresa cliente que no existe responde lo mismo', async () => {
    const { createContactUseCase } = setupContactUseCases();

    await expect(
      createContactUseCase.execute({ firstName: 'Laura', lastName: 'Martínez', companyId: NON_EXISTENT_ID }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_COMPANY_CONTACT });
  });

  it('modificar con una empresa cliente de otro tenant responde ValidationError y no cambia nada', async () => {
    const { updateContactUseCase, companyContactRepository, contactRepository } = setupContactUseCases();
    const foreignCompanyContact = buildCompanyContact({ tenantId: OTHER_TENANT_ID });
    companyContactRepository.seed(foreignCompanyContact);
    const contact = buildContact({ companyId: 'company-id' });
    contactRepository.seed(contact);

    await expect(
      updateContactUseCase.execute(contact.id, { companyId: foreignCompanyContact.id }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_COMPANY_CONTACT });
    expect(contactRepository.findStoredById(contact.id)?.companyId).toBe('company-id');
  });

  it('crear con una empresa cliente borrada responde ValidationError', async () => {
    const { createContactUseCase, companyContactRepository } = setupContactUseCases();
    const deletedCompanyContact = buildCompanyContact();
    companyContactRepository.seed(deletedCompanyContact);
    await companyContactRepository.delete(deletedCompanyContact.id);

    await expect(
      createContactUseCase.execute({ firstName: 'Laura', lastName: 'Martínez', companyId: deletedCompanyContact.id }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_COMPANY_CONTACT });
  });
});

describe('DeleteContactUseCase (F1-T16)', () => {
  it('un rol de gestión borra el contacto de forma suave: deja de encontrarse', async () => {
    const { deleteContactUseCase, contactRepository } = setupContactUseCases();
    const contact = buildContact();
    contactRepository.seed(contact);

    await deleteContactUseCase.execute(contact.id, managementActor);

    await expect(contactRepository.findById(contact.id)).resolves.toBeNull();
    expect(contactRepository.findStoredById(contact.id)).toBeDefined();
  });

  it('un comercial no puede borrar contactos', async () => {
    const { deleteContactUseCase, contactRepository } = setupContactUseCases();
    const contact = buildContact();
    contactRepository.seed(contact);

    await expect(deleteContactUseCase.execute(contact.id, salesRepActor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(contactRepository.findById(contact.id)).resolves.not.toBeNull();
  });

  it('un contacto que no existe, de otro tenant o ya borrado responde NotFoundError CONTACT_NOT_FOUND', async () => {
    const { deleteContactUseCase, contactRepository } = setupContactUseCases();
    const foreignContact = buildContact({ tenantId: OTHER_TENANT_ID });
    const deletedContact = buildContact();
    contactRepository.seed(foreignContact, deletedContact);
    await contactRepository.delete(deletedContact.id);

    for (const contactId of [NON_EXISTENT_ID, foreignContact.id, deletedContact.id]) {
      await expect(deleteContactUseCase.execute(contactId, managementActor)).rejects.toMatchObject({
        code: ErrorCode.CONTACT_NOT_FOUND,
      });
    }
  });

  it('un contacto borrado no se puede modificar (H10)', async () => {
    const { deleteContactUseCase, updateContactUseCase, contactRepository } = setupContactUseCases();
    const contact = buildContact();
    contactRepository.seed(contact);
    await deleteContactUseCase.execute(contact.id, managementActor);

    await expect(updateContactUseCase.execute(contact.id, { lastName: 'Ruiz' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('DeleteCompanyContactUseCase (F1-T16)', () => {
  it('un rol de gestión borra de forma suave una empresa cliente sin contactos', async () => {
    const { deleteCompanyContactUseCase, companyContactRepository } = setupCompanyContactUseCases();
    const companyContact = buildCompanyContact();
    companyContactRepository.seed(companyContact);

    await deleteCompanyContactUseCase.execute(companyContact.id, managementActor);

    await expect(companyContactRepository.findById(companyContact.id)).resolves.toBeNull();
  });

  it('no borra una empresa cliente que aún tiene contactos activos: ConflictError COMPANY_CONTACT_HAS_CONTACTS', async () => {
    const { deleteCompanyContactUseCase, companyContactRepository, contactRepository } = setupCompanyContactUseCases();
    const companyContact = buildCompanyContact();
    companyContactRepository.seed(companyContact);
    contactRepository.seed(buildContact({ companyId: companyContact.id }));

    const deletion = deleteCompanyContactUseCase.execute(companyContact.id, managementActor);

    await expect(deletion).rejects.toBeInstanceOf(ConflictError);
    await expect(deletion).rejects.toMatchObject({ code: ErrorCode.COMPANY_CONTACT_HAS_CONTACTS });
    await expect(companyContactRepository.findById(companyContact.id)).resolves.not.toBeNull();
  });

  it('los contactos ya borrados no impiden borrar la empresa cliente', async () => {
    const { deleteCompanyContactUseCase, companyContactRepository, contactRepository } = setupCompanyContactUseCases();
    const companyContact = buildCompanyContact();
    companyContactRepository.seed(companyContact);
    const deletedContact = buildContact({ companyId: companyContact.id });
    contactRepository.seed(deletedContact);
    await contactRepository.delete(deletedContact.id);

    await deleteCompanyContactUseCase.execute(companyContact.id, managementActor);

    await expect(companyContactRepository.findById(companyContact.id)).resolves.toBeNull();
  });

  it('un comercial no puede borrar empresas cliente', async () => {
    const { deleteCompanyContactUseCase, companyContactRepository } = setupCompanyContactUseCases();
    const companyContact = buildCompanyContact();
    companyContactRepository.seed(companyContact);

    await expect(deleteCompanyContactUseCase.execute(companyContact.id, salesRepActor)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('una empresa cliente que no existe o es de otro tenant responde NotFoundError', async () => {
    const { deleteCompanyContactUseCase, companyContactRepository } = setupCompanyContactUseCases();
    const foreignCompanyContact = buildCompanyContact({ tenantId: OTHER_TENANT_ID });
    companyContactRepository.seed(foreignCompanyContact);

    await expect(deleteCompanyContactUseCase.execute(foreignCompanyContact.id, managementActor)).rejects.toMatchObject({
      code: ErrorCode.COMPANY_CONTACT_NOT_FOUND,
    });
  });
});
