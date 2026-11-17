import { BasePrismaRepository } from './BasePrismaRepository.js';
import { ConflictError } from '../../../domain/errors/ConflictError.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { isUniqueConstraintViolation } from '../prisma/prismaErrors.js';
import { IContactRepository } from '../../../application/ports/repositories/IContactRepository.js';
import { Contact } from '../../../domain/entities/Contact.js';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';

export class PrismaContactRepository extends BasePrismaRepository implements IContactRepository {
  async findByTenant(ownerId?: string): Promise<Contact[]> {
    const records = await this.prisma.contact.findMany({
      where: ownerId ? { ...this.tenantWhere(), ownerId } : this.tenantWhere(),
      include: {
        company: true,
      },
    });
    return records.map(Contact.fromPrisma);
  }

  async create(contact: Contact): Promise<void> {
    await this.translateDocumentConflict(() =>
      this.prisma.contact.create({
        data: {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          companyId: contact.companyId,
          ownerId: contact.ownerId,
          documentType: contact.documentType,
          documentNumber: contact.documentNumber,
          tenantId: contact.tenantId,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        },
      }),
    );
  }

  async findById(id: string): Promise<Contact | null> {
    const record = await this.prisma.contact.findUnique({
      where: {
        id: id,
        ...this.tenantWhere(),
      },
      include: {
        company: true,
      },
    });

    return record ? Contact.fromPrisma(record) : null;
  }

  async findActiveByDocumentNumber(documentNumber: string): Promise<Contact | null> {
    const record = await this.prisma.contact.findFirst({ where: { ...this.tenantWhere(), documentNumber } });
    return record ? Contact.fromPrisma(record) : null;
  }

  async delete(contactId: string): Promise<void> {
    await this.softDeleteRegister(this.prisma.contact, contactId);
  }

  async countActiveByCompany(companyContactId: string): Promise<number> {
    return this.prisma.contact.count({ where: { ...this.tenantWhere(), companyId: companyContactId } });
  }

  async update(contactId: string, data: Contact): Promise<void> {
    await this.translateDocumentConflict(() =>
      this.prisma.contact.update({
        where: {
          id: contactId,
          ...this.tenantWhere(),
        },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          companyId: data.companyId,
          ownerId: data.ownerId ?? null,
          documentType: data.documentType ?? null,
          documentNumber: data.documentNumber ?? null,
        },
      }),
    );
  }

  async findFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<Contact[]> {
    const where = this.buildFilterWhere(criteria, config);
    const { skip, take } = this.buildPagination(criteria);

    const records = await this.prisma.contact.findMany({
      where,
      orderBy: this.buildOrderBy(criteria, config),
      skip,
      take,
      include: {
        company: true,
      },
    });

    return records.map(Contact.fromPrisma);
  }

  async countFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<number> {
    const where = this.buildFilterWhere(criteria, config);
    return this.prisma.contact.count({ where });
  }

  /**
   * D-19 (F2-T09): el índice único parcial decide entre dos altas simultáneas con el mismo documento. Es la
   * única restricción única de la tabla además del id, que se genera aleatorio, así que la violación es la
   * del documento.
   */
  private async translateDocumentConflict(write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictError(ErrorCode.DOCUMENT_ALREADY_REGISTERED, 'Document number is already registered', {
          cause: error,
        });
      }
      throw error;
    }
  }
}
