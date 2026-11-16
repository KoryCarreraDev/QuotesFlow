import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { CompanyContact } from '@/domain/entities/CompanyContact.js';
import { Contact } from '@/domain/entities/Contact.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { companyContactFilterConfig } from '@/infrastructure/persistence/filters/companyContactFilterConfig.js';
import { contactFilterConfig } from '@/infrastructure/persistence/filters/contactFilterConfig.js';
import { PrismaCompanyContactRepository } from '@/infrastructure/persistence/repositories/PrismaCompanyContactRepository.js';
import { PrismaContactRepository } from '@/infrastructure/persistence/repositories/PrismaContactRepository.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import { persistCompanyContact, persistContact, persistTenant } from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

const TWO_MATCHING_RECORDS = 2;

function idsOf(records: Array<{ id: string }>): string[] {
  return records.map((record) => record.id).sort();
}

let tenantId: string;
let otherTenantId: string;

beforeEach(async () => {
  tenantId = (await persistTenant()).id;
  otherTenantId = (await persistTenant({ name: 'Otra Empresa SAS' })).id;
});

describe('PrismaContactRepository', () => {
  let contactRepository: PrismaContactRepository;

  beforeEach(() => {
    contactRepository = new PrismaContactRepository(prisma, new FixedTenantContext(tenantId));
  });

  it('guarda un contacto vinculado a una empresa cliente y lo recupera', async () => {
    const companyContact = await persistCompanyContact(tenantId);
    const contact = Contact.create({
      tenantId,
      firstName: 'Laura',
      lastName: 'Martínez',
      email: 'laura@example.com',
      phone: '3109876543',
      companyId: companyContact.id,
    });

    await contactRepository.create(contact);

    await expect(contactRepository.findById(contact.id)).resolves.toMatchObject({
      id: contact.id,
      tenantId,
      firstName: 'Laura',
      lastName: 'Martínez',
      email: 'laura@example.com',
      phone: '3109876543',
      companyId: companyContact.id,
    });
  });

  it('rechaza un contacto vinculado a una empresa cliente que no existe', async () => {
    const contact = Contact.create({ tenantId, firstName: 'Laura', lastName: 'Martínez', companyId: NON_EXISTENT_ID });

    await expect(contactRepository.create(contact)).rejects.toThrow();
  });

  it('findById devuelve null si el contacto no existe o es de otra empresa', async () => {
    const foreignContact = await persistContact(otherTenantId);

    await expect(contactRepository.findById(NON_EXISTENT_ID)).resolves.toBeNull();
    await expect(contactRepository.findById(foreignContact.id)).resolves.toBeNull();
  });

  it('findById no devuelve un contacto borrado', async () => {
    const deletedContact = await persistContact(tenantId, { deleted: DeletedState.INACTIVE });

    await expect(contactRepository.findById(deletedContact.id)).resolves.toBeNull();
  });

  it('findByTenant devuelve solo los contactos activos de la empresa', async () => {
    const ownContact = await persistContact(tenantId);
    await persistContact(tenantId, { deleted: DeletedState.INACTIVE });
    await persistContact(otherTenantId);

    const contacts = await contactRepository.findByTenant();

    expect(idsOf(contacts)).toEqual([ownContact.id]);
  });

  it('update cambia los datos del contacto', async () => {
    const storedContact = await persistContact(tenantId, { firstName: 'Laura', lastName: 'Martínez' });
    const changes = new Contact(storedContact.id, tenantId, 'Laura', 'Martínez Ruiz', 'laura.ruiz@example.com');

    await contactRepository.update(storedContact.id, changes);

    await expect(contactRepository.findById(storedContact.id)).resolves.toMatchObject({
      lastName: 'Martínez Ruiz',
      email: 'laura.ruiz@example.com',
    });
  });

  it('update no modifica un contacto de otra empresa', async () => {
    const foreignContact = await persistContact(otherTenantId, { lastName: 'Martínez' });
    const changes = new Contact(foreignContact.id, tenantId, 'Laura', 'Renombrado');

    await expect(contactRepository.update(foreignContact.id, changes)).rejects.toThrow();

    const untouchedContact = await prisma.contact.findUniqueOrThrow({ where: { id: foreignContact.id } });
    expect(untouchedContact.lastName).toBe('Martínez');
  });

  it('findFiltered y countFiltered buscan dentro de la empresa, sin borrados', async () => {
    const matchingContact = await persistContact(tenantId, { firstName: 'Laura', email: 'laura@example.com' });
    await persistContact(tenantId, { firstName: 'Pedro', email: 'pedro@example.com' });
    await persistContact(tenantId, { firstName: 'Laura', deleted: DeletedState.INACTIVE });
    await persistContact(otherTenantId, { firstName: 'Laura' });

    const criteria = { search: 'laura' };
    const contacts = await contactRepository.findFiltered(criteria, contactFilterConfig);
    const total = await contactRepository.countFiltered(criteria, contactFilterConfig);

    expect(idsOf(contacts)).toEqual([matchingContact.id]);
    expect(total).toBe(1);
  });

  it('findFiltered filtra por empresa cliente', async () => {
    const companyContact = await persistCompanyContact(tenantId);
    const linkedContact = await persistContact(tenantId, { companyId: companyContact.id });
    await persistContact(tenantId);

    const contacts = await contactRepository.findFiltered(
      { filters: [{ field: 'companyId', operator: 'equals', value: companyContact.id }] },
      contactFilterConfig,
    );

    expect(idsOf(contacts)).toEqual([linkedContact.id]);
  });
});

describe('PrismaContactRepository: borrado suave (F1-T16)', () => {
  let contactRepository: PrismaContactRepository;

  beforeEach(() => {
    contactRepository = new PrismaContactRepository(prisma, new FixedTenantContext(tenantId));
  });

  it('delete marca el contacto como borrado sin eliminar la fila', async () => {
    const contact = await persistContact(tenantId);

    await contactRepository.delete(contact.id);

    const storedContact = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(storedContact.deleted).toBe(DeletedState.INACTIVE);
    await expect(contactRepository.findById(contact.id)).resolves.toBeNull();
  });

  it('delete no borra un contacto de otra empresa', async () => {
    const foreignContact = await persistContact(otherTenantId);

    await expect(contactRepository.delete(foreignContact.id)).rejects.toThrow();

    const storedContact = await prisma.contact.findUniqueOrThrow({ where: { id: foreignContact.id } });
    expect(storedContact.deleted).toBe(DeletedState.ACTIVE);
  });

  it('update no modifica un contacto borrado', async () => {
    const deletedContact = await persistContact(tenantId, { lastName: 'Martínez', deleted: DeletedState.INACTIVE });

    await expect(
      contactRepository.update(deletedContact.id, Contact.create({ tenantId, firstName: 'Laura', lastName: 'Ruiz' })),
    ).rejects.toThrow();

    const storedContact = await prisma.contact.findUniqueOrThrow({ where: { id: deletedContact.id } });
    expect(storedContact.lastName).toBe('Martínez');
  });

  it('countActiveByCompany cuenta solo los contactos no borrados de esa empresa cliente', async () => {
    const companyContact = await persistCompanyContact(tenantId);
    await persistContact(tenantId, { companyId: companyContact.id });
    await persistContact(tenantId, { companyId: companyContact.id, deleted: DeletedState.INACTIVE });
    await persistContact(tenantId);

    await expect(contactRepository.countActiveByCompany(companyContact.id)).resolves.toBe(1);
  });
});

describe('PrismaCompanyContactRepository', () => {
  let companyContactRepository: PrismaCompanyContactRepository;

  beforeEach(() => {
    companyContactRepository = new PrismaCompanyContactRepository(prisma, new FixedTenantContext(tenantId));
  });

  it('guarda una empresa cliente con todos sus datos y la recupera', async () => {
    const companyContact = CompanyContact.create({
      tenantId,
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

    await companyContactRepository.create(companyContact);

    await expect(companyContactRepository.findById(companyContact.id)).resolves.toMatchObject({
      id: companyContact.id,
      tenantId,
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

  it('findById devuelve null si la empresa cliente no existe o es de otro tenant', async () => {
    const foreignCompanyContact = await persistCompanyContact(otherTenantId);

    await expect(companyContactRepository.findById(NON_EXISTENT_ID)).resolves.toBeNull();
    await expect(companyContactRepository.findById(foreignCompanyContact.id)).resolves.toBeNull();
  });

  it('findById no devuelve una empresa cliente borrada', async () => {
    const deletedCompanyContact = await persistCompanyContact(tenantId, { deleted: DeletedState.INACTIVE });

    await expect(companyContactRepository.findById(deletedCompanyContact.id)).resolves.toBeNull();
  });

  it('findByTenant devuelve solo las empresas cliente activas del tenant', async () => {
    const ownCompanyContact = await persistCompanyContact(tenantId);
    await persistCompanyContact(tenantId, { deleted: DeletedState.INACTIVE });
    await persistCompanyContact(otherTenantId);

    const companyContacts = await companyContactRepository.findByTenant();

    expect(idsOf(companyContacts)).toEqual([ownCompanyContact.id]);
  });

  it('update cambia los datos de la empresa cliente', async () => {
    const storedCompanyContact = await persistCompanyContact(tenantId, { city: 'Bogotá' });
    const changes = new CompanyContact(storedCompanyContact.id, tenantId, 'Roble Construcciones', 'Obra civil');

    await companyContactRepository.update(storedCompanyContact.id, changes);

    await expect(companyContactRepository.findById(storedCompanyContact.id)).resolves.toMatchObject({
      name: 'Roble Construcciones',
      industry: 'Obra civil',
      city: 'Bogotá',
    });
  });

  it('update no modifica una empresa cliente de otro tenant', async () => {
    const foreignCompanyContact = await persistCompanyContact(otherTenantId, { name: 'Empresa ajena' });
    const changes = new CompanyContact(foreignCompanyContact.id, tenantId, 'Renombrada');

    await expect(companyContactRepository.update(foreignCompanyContact.id, changes)).rejects.toThrow();

    const untouchedCompanyContact = await prisma.companyContact.findUniqueOrThrow({
      where: { id: foreignCompanyContact.id },
    });
    expect(untouchedCompanyContact.name).toBe('Empresa ajena');
  });

  it('findFiltered y countFiltered buscan dentro del tenant, sin borrados, y paginan', async () => {
    const firstMatch = await persistCompanyContact(tenantId, { name: 'Roble Uno', city: 'Bogotá' });
    const secondMatch = await persistCompanyContact(tenantId, { name: 'Roble Dos', city: 'Medellín' });
    await persistCompanyContact(tenantId, { name: 'Pino Tres', city: 'Cali' });
    await persistCompanyContact(tenantId, { name: 'Roble Borrado', deleted: DeletedState.INACTIVE });
    await persistCompanyContact(otherTenantId, { name: 'Roble Ajeno' });

    const criteria = { filters: [{ field: 'name', operator: 'contains', value: 'roble' }] };
    const companyContacts = await companyContactRepository.findFiltered(criteria, companyContactFilterConfig);
    const firstPage = await companyContactRepository.findFiltered(
      { ...criteria, limit: 1 },
      companyContactFilterConfig,
    );
    const total = await companyContactRepository.countFiltered(criteria, companyContactFilterConfig);

    expect(idsOf(companyContacts)).toEqual([firstMatch.id, secondMatch.id].sort());
    expect(firstPage).toHaveLength(1);
    expect(total).toBe(TWO_MATCHING_RECORDS);
  });
});

describe('PrismaCompanyContactRepository: borrado suave (F1-T16)', () => {
  let companyContactRepository: PrismaCompanyContactRepository;

  beforeEach(() => {
    companyContactRepository = new PrismaCompanyContactRepository(prisma, new FixedTenantContext(tenantId));
  });

  it('delete marca la empresa cliente como borrada sin eliminar la fila', async () => {
    const companyContact = await persistCompanyContact(tenantId);

    await companyContactRepository.delete(companyContact.id);

    const stored = await prisma.companyContact.findUniqueOrThrow({ where: { id: companyContact.id } });
    expect(stored.deleted).toBe(DeletedState.INACTIVE);
  });

  it('delete no borra una empresa cliente de otro tenant', async () => {
    const foreignCompanyContact = await persistCompanyContact(otherTenantId);

    await expect(companyContactRepository.delete(foreignCompanyContact.id)).rejects.toThrow();
  });
});
