import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';
import { describe, expect, it } from 'vitest';
import { CompanyContactMapper } from '@/application/mappers/CompanyContactMapper.js';
import { ContactMapper } from '@/application/mappers/ContactMapper.js';
import { CreateCompanyContactUseCase } from '@/application/use-case/companyContacts/createCompanyContactUseCase.js';
import { CreateContactUseCase } from '@/application/use-case/contacts/createContactUseCase.js';
import { GetContactsUseCase } from '@/application/use-case/contacts/getContactsUseCase.js';
import { UpdateContactUseCase } from '@/application/use-case/contacts/updateContactUseCase.js';
import { DocumentType } from '@/domain/enums/DocumentType.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { normalizeDocumentNumber } from '@/domain/value-objects/documentNumber.js';
import {
  DEFAULT_TEST_TENANT_ID,
  buildCompanyContact,
  buildContact,
  buildUser,
} from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryCompanyContactRepository } from '@tests/support/doubles/InMemoryCompanyContactRepository.js';
import { InMemoryContactRepository } from '@tests/support/doubles/InMemoryContactRepository.js';
import { InMemoryUserRepository } from '@tests/support/doubles/InMemoryUserRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';

// F1-T17: comercial responsable de cada cliente (D-18) y documento único por empresa (D-19).

const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999';
const TOO_LONG_DOCUMENT_LENGTH = 25;

function setup() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const contactRepository = new InMemoryContactRepository(tenantContext);
  const companyContactRepository = new InMemoryCompanyContactRepository(tenantContext);
  const userRepository = new InMemoryUserRepository(tenantContext);
  const owner = buildUser({ role: Role.OWNER });
  const salesLeader = buildUser({ role: Role.SALES_LEADER });
  const salesRep = buildUser({ role: Role.SALES_REP });
  const otherSalesRep = buildUser({ role: Role.SALES_REP });
  const inactiveSalesRep = buildUser({ role: Role.SALES_REP, isActive: false });
  const foreignUser = buildUser({ tenantId: OTHER_TENANT_ID });
  userRepository.seed(owner, salesLeader, salesRep, otherSalesRep, inactiveSalesRep, foreignUser);

  const contactMapper = new ContactMapper();
  const audit = new RecordingAuditLogger();
  return {
    contactRepository,
    companyContactRepository,
    owner,
    salesLeader,
    salesRep,
    otherSalesRep,
    inactiveSalesRep,
    foreignUser,
    actorOf: (user: { id: string; role: Role }) => ({ role: user.role, userId: user.id }),
    getContacts: new GetContactsUseCase(contactRepository, contactMapper),
    createContact: new CreateContactUseCase(
      contactRepository,
      contactMapper,
      tenantContext,
      companyContactRepository,
      audit,
      userRepository,
      new RecordingTransactionManager(),
    ),
    updateContact: new UpdateContactUseCase(
      contactRepository,
      contactMapper,
      tenantContext,
      companyContactRepository,
      audit,
      userRepository,
      new RecordingTransactionManager(),
    ),
    createCompanyContact: new CreateCompanyContactUseCase(
      companyContactRepository,
      new CompanyContactMapper(),
      tenantContext,
      audit,
      userRepository,
      new RecordingTransactionManager(),
    ),
  };
}

describe('normalizeDocumentNumber', () => {
  it.each([
    [DocumentType.CC, '1.020.304.050', '1020304050'],
    [DocumentType.CC, ' 1020 304 050 ', '1020304050'],
    [DocumentType.NIT, '900.123.456-7', '900123456'],
    [DocumentType.NIT, '900123456', '900123456'],
    [DocumentType.PASSPORT, 'ab-123456', 'AB123456'],
  ])('%s %s se guarda como %s', (documentType, rawDocumentNumber, expected) => {
    expect(normalizeDocumentNumber(documentType, rawDocumentNumber)).toBe(expected);
  });

  it.each([
    [DocumentType.CC, 'sin dígitos'],
    [DocumentType.NIT, '-7'],
    [DocumentType.CC, '1'.repeat(TOO_LONG_DOCUMENT_LENGTH)],
  ])('rechaza %s %s con INVALID_DOCUMENT_NUMBER', (documentType, rawDocumentNumber) => {
    expect(() => normalizeDocumentNumber(documentType, rawDocumentNumber)).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_DOCUMENT_NUMBER }),
    );
  });
});

describe('responsable de un cliente nuevo (D-18)', () => {
  it('un comercial queda como responsable de lo que crea, aunque envíe otro ownerId', async () => {
    const { createContact, salesRep, otherSalesRep, actorOf } = setup();

    const contact = await createContact.execute(
      { firstName: 'Laura', lastName: 'Martínez', ownerId: otherSalesRep.id },
      actorOf(salesRep),
    );

    expect(contact.ownerId).toBe(salesRep.id);
  });

  it('gestión puede asignarlo a un comercial activo de la empresa; sin indicarlo, queda a su nombre', async () => {
    const { createContact, salesLeader, salesRep, actorOf } = setup();

    const assigned = await createContact.execute(
      { firstName: 'Laura', lastName: 'Martínez', ownerId: salesRep.id },
      actorOf(salesLeader),
    );
    const unassigned = await createContact.execute({ firstName: 'Pedro', lastName: 'Gil' }, actorOf(salesLeader));

    expect(assigned.ownerId).toBe(salesRep.id);
    expect(unassigned.ownerId).toBe(salesLeader.id);
  });

  it.each(['inactiveSalesRep', 'foreignUser'] as const)(
    'gestión no puede asignarlo a un usuario %s: OWNER_NOT_FOUND',
    async (invalidOwner) => {
      const context = setup();

      await expect(
        context.createContact.execute(
          { firstName: 'Laura', lastName: 'Martínez', ownerId: context[invalidOwner].id },
          context.actorOf(context.owner),
        ),
      ).rejects.toMatchObject({ code: ErrorCode.OWNER_NOT_FOUND });
    },
  );

  it('un comercial no puede vincular un contacto a una empresa cliente que no es suya', async () => {
    const { createContact, companyContactRepository, salesRep, otherSalesRep, actorOf } = setup();
    const othersCompany = buildCompanyContact({ ownerId: otherSalesRep.id });
    companyContactRepository.seed(othersCompany);

    await expect(
      createContact.execute(
        { firstName: 'Laura', lastName: 'Martínez', companyId: othersCompany.id },
        actorOf(salesRep),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_COMPANY_CONTACT });
  });
});

describe('visibilidad y modificación por responsable (D-18)', () => {
  it('un comercial solo lista sus contactos; gestión ve todos, también los que no tienen responsable', async () => {
    const { getContacts, contactRepository, owner, salesRep, otherSalesRep, actorOf } = setup();
    const ownContact = buildContact({ ownerId: salesRep.id });
    const othersContact = buildContact({ ownerId: otherSalesRep.id });
    const legacyContact = buildContact();
    contactRepository.seed(ownContact, othersContact, legacyContact);

    const repContacts = await getContacts.execute(actorOf(salesRep));
    const ownerContacts = await getContacts.execute(actorOf(owner));

    expect(repContacts.map((contact) => contact.id)).toEqual([ownContact.id]);
    expect(ownerContacts.map((contact) => contact.id).sort()).toEqual(
      [ownContact.id, othersContact.id, legacyContact.id].sort(),
    );
  });

  it('un comercial no puede modificar el contacto de otro', async () => {
    const { updateContact, contactRepository, salesRep, otherSalesRep, actorOf } = setup();
    const othersContact = buildContact({ ownerId: otherSalesRep.id });
    contactRepository.seed(othersContact);

    await expect(
      updateContact.execute(othersContact.id, { lastName: 'Ruiz' }, actorOf(salesRep)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('un comercial no puede pasarle su contacto a otro: el ownerId que envía se ignora', async () => {
    const { updateContact, contactRepository, salesRep, otherSalesRep, actorOf } = setup();
    const ownContact = buildContact({ ownerId: salesRep.id });
    contactRepository.seed(ownContact);

    const updated = await updateContact.execute(ownContact.id, { ownerId: otherSalesRep.id }, actorOf(salesRep));

    expect(updated.ownerId).toBe(salesRep.id);
  });

  it('gestión reasigna un cliente sin responsable a un comercial (Q-005)', async () => {
    const { updateContact, contactRepository, salesLeader, salesRep, actorOf } = setup();
    const legacyContact = buildContact();
    contactRepository.seed(legacyContact);

    const updated = await updateContact.execute(legacyContact.id, { ownerId: salesRep.id }, actorOf(salesLeader));

    expect(updated.ownerId).toBe(salesRep.id);
  });
});

describe('documento único entre los clientes de la empresa (D-19)', () => {
  it('guarda el documento normalizado', async () => {
    const { createContact, owner, actorOf } = setup();

    const contact = await createContact.execute(
      { firstName: 'Laura', lastName: 'Martínez', documentType: DocumentType.CC, documentNumber: '1.020.304.050' },
      actorOf(owner),
    );

    expect(contact).toMatchObject({ documentType: DocumentType.CC, documentNumber: '1020304050' });
  });

  it('rechaza el mismo documento escrito de otra forma: 409 DOCUMENT_ALREADY_REGISTERED', async () => {
    const { createContact, contactRepository, owner, actorOf } = setup();
    contactRepository.seed(buildContact({ documentType: DocumentType.CC, documentNumber: '1020304050' }));

    await expect(
      createContact.execute(
        { firstName: 'Otra', lastName: 'Persona', documentType: DocumentType.CC, documentNumber: '1 020 304 050' },
        actorOf(owner),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_ALREADY_REGISTERED });
  });

  it('el documento de un contacto borrado se puede volver a usar', async () => {
    const { createContact, contactRepository, owner, actorOf } = setup();
    const deletedContact = buildContact({ documentType: DocumentType.CC, documentNumber: '1020304050' });
    contactRepository.seed(deletedContact);
    await contactRepository.delete(deletedContact.id);

    await expect(
      createContact.execute(
        { firstName: 'Laura', lastName: 'Martínez', documentType: DocumentType.CC, documentNumber: '1020304050' },
        actorOf(owner),
      ),
    ).resolves.toMatchObject({ documentNumber: '1020304050' });
  });

  it('un número sin tipo responde DOCUMENT_TYPE_REQUIRED', async () => {
    const { createContact, owner, actorOf } = setup();

    await expect(
      createContact.execute({ firstName: 'Laura', lastName: 'Martínez', documentNumber: '1020304050' }, actorOf(owner)),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_TYPE_REQUIRED });
  });

  it('dos empresas cliente no pueden tener el mismo NIT, aunque uno traiga dígito de verificación', async () => {
    const { createCompanyContact, owner, actorOf } = setup();
    await createCompanyContact.execute({ name: 'Roble SAS', taxNumber: '900123456' }, actorOf(owner));

    await expect(
      createCompanyContact.execute({ name: 'Roble Duplicado', taxNumber: '900.123.456-7' }, actorOf(owner)),
    ).rejects.toMatchObject({ code: ErrorCode.DOCUMENT_ALREADY_REGISTERED });
  });
});
