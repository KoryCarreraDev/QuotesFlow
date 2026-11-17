// F2-T09 (F1-S2, D-19): el índice único parcial de la base impide repetir el documento entre clientes activos
// del mismo tenant, aunque la comprobación de la aplicación no lo vea (altas simultáneas).

import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { CompanyContact } from '@/domain/entities/CompanyContact.js';
import { Contact } from '@/domain/entities/Contact.js';
import { DocumentType } from '@/domain/enums/DocumentType.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { PrismaCompanyContactRepository } from '@/infrastructure/persistence/repositories/PrismaCompanyContactRepository.js';
import { PrismaContactRepository } from '@/infrastructure/persistence/repositories/PrismaContactRepository.js';
import { persistCompanyContact, persistContact, persistTenant } from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

const SHARED_DOCUMENT_NUMBER = '1020304050';
const SHARED_TAX_NUMBER = '900123456';
const TWO_RECORDS = 2;

let tenantId: string;
let contactRepository: PrismaContactRepository;
let companyContactRepository: PrismaCompanyContactRepository;

function contactWithDocument(documentNumber?: string): Contact {
  return Contact.create({
    tenantId,
    firstName: 'Laura',
    lastName: 'Martínez',
    documentType: documentNumber ? DocumentType.CC : undefined,
    documentNumber,
  });
}

beforeEach(async () => {
  tenantId = (await persistTenant()).id;
  const tenantContext = new FixedTenantContext(tenantId);
  contactRepository = new PrismaContactRepository(prisma, tenantContext);
  companyContactRepository = new PrismaCompanyContactRepository(prisma, tenantContext);
});

describe('Documento único de contactos en la base de datos', () => {
  it('un segundo contacto activo con el mismo documento se rechaza con DOCUMENT_ALREADY_REGISTERED', async () => {
    await persistContact(tenantId, { documentType: 'CC', documentNumber: SHARED_DOCUMENT_NUMBER });

    await expect(contactRepository.create(contactWithDocument(SHARED_DOCUMENT_NUMBER))).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_ALREADY_REGISTERED,
    });
    await expect(prisma.contact.count()).resolves.toBe(1);
  });

  it('el documento de un contacto borrado se puede reutilizar', async () => {
    await persistContact(tenantId, {
      documentType: 'CC',
      documentNumber: SHARED_DOCUMENT_NUMBER,
      deleted: DeletedState.INACTIVE,
    });

    await contactRepository.create(contactWithDocument(SHARED_DOCUMENT_NUMBER));

    await expect(prisma.contact.count()).resolves.toBe(TWO_RECORDS);
  });

  it('el mismo documento en otra empresa (tenant) no choca', async () => {
    const otherTenant = await persistTenant({ name: 'Otra Empresa SAS' });
    await persistContact(otherTenant.id, { documentType: 'CC', documentNumber: SHARED_DOCUMENT_NUMBER });

    await contactRepository.create(contactWithDocument(SHARED_DOCUMENT_NUMBER));

    await expect(prisma.contact.count({ where: { tenantId } })).resolves.toBe(1);
  });

  it('varios contactos sin documento no chocan entre sí', async () => {
    await contactRepository.create(contactWithDocument());
    await contactRepository.create(contactWithDocument());

    await expect(prisma.contact.count()).resolves.toBe(TWO_RECORDS);
  });

  it('cambiar el documento de un contacto por el de otro activo se rechaza y no lo modifica', async () => {
    await persistContact(tenantId, { documentType: 'CC', documentNumber: SHARED_DOCUMENT_NUMBER });
    const contact = contactWithDocument('555');
    await contactRepository.create(contact);
    const changedContact = Contact.fromPrisma({
      ...(await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } })),
      documentNumber: SHARED_DOCUMENT_NUMBER,
    });

    await expect(contactRepository.update(contact.id, changedContact)).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_ALREADY_REGISTERED,
    });
    const storedContact = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(storedContact.documentNumber).toBe('555');
  });
});

describe('NIT único de empresas cliente en la base de datos', () => {
  it('una segunda empresa cliente activa con el mismo NIT se rechaza con DOCUMENT_ALREADY_REGISTERED', async () => {
    await persistCompanyContact(tenantId, { documentNumber: SHARED_TAX_NUMBER });

    const duplicate = CompanyContact.create({ tenantId, name: 'Roble SAS', taxNumber: `${SHARED_TAX_NUMBER}-7` });

    await expect(companyContactRepository.create(duplicate)).rejects.toMatchObject({
      code: ErrorCode.DOCUMENT_ALREADY_REGISTERED,
    });
  });

  it('el NIT de una empresa cliente borrada se puede reutilizar', async () => {
    await persistCompanyContact(tenantId, { documentNumber: SHARED_TAX_NUMBER, deleted: DeletedState.INACTIVE });

    await companyContactRepository.create(
      CompanyContact.create({ tenantId, name: 'Roble SAS', taxNumber: `${SHARED_TAX_NUMBER}-7` }),
    );

    await expect(prisma.companyContact.count()).resolves.toBe(TWO_RECORDS);
  });
});
