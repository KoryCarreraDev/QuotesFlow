import { BasePrismaRepository } from './BasePrismaRepository.js';
import { ICompanyContactRepository } from '../../../application/ports/repositories/ICompanyContactRepository.js';
import { CompanyContact } from '../../../domain/entities/CompanyContact.js';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';

export class PrismaCompanyContactRepository extends BasePrismaRepository implements ICompanyContactRepository {
  async findByTenant(ownerId?: string): Promise<CompanyContact[]> {
    const records = await this.prisma.companyContact.findMany({
      where: ownerId ? { ...this.tenantWhere(), ownerId } : this.tenantWhere(),
      include: {
        contacts: true,
      },
    });
    return records.map(CompanyContact.fromPrisma);
  }

  async create(companyContact: CompanyContact): Promise<void> {
    await this.prisma.companyContact.create({
      data: {
        id: companyContact.id,
        name: companyContact.name,
        industry: companyContact.industry,
        taxNumber: companyContact.taxNumber,
        documentNumber: companyContact.documentNumber,
        ownerId: companyContact.ownerId,
        phone: companyContact.phone,
        email: companyContact.email,
        address: companyContact.address,
        city: companyContact.city,
        state: companyContact.state,
        zip: companyContact.zip,
        country: companyContact.country,
        tenantId: companyContact.tenantId,
        createdAt: companyContact.createdAt,
        updatedAt: companyContact.updatedAt,
      },
    });
  }

  async findById(id: string): Promise<CompanyContact | null> {
    const record = await this.prisma.companyContact.findUnique({
      where: {
        id: id,
        ...this.tenantWhere(),
      },
      include: {
        contacts: true,
      },
    });

    return record ? CompanyContact.fromPrisma(record) : null;
  }

  async findActiveByDocumentNumber(documentNumber: string): Promise<CompanyContact | null> {
    const record = await this.prisma.companyContact.findFirst({ where: { ...this.tenantWhere(), documentNumber } });
    return record ? CompanyContact.fromPrisma(record) : null;
  }

  async delete(companyContactId: string): Promise<void> {
    await this.softDeleteRegister(this.prisma.companyContact, companyContactId);
  }

  async update(companyContactId: string, data: CompanyContact): Promise<void> {
    await this.prisma.companyContact.update({
      where: {
        id: companyContactId,
        ...this.tenantWhere(),
      },
      data: {
        name: data.name,
        industry: data.industry,
        taxNumber: data.taxNumber,
        documentNumber: data.documentNumber ?? null,
        ownerId: data.ownerId ?? null,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        country: data.country,
      },
    });
  }

  async findFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<CompanyContact[]> {
    const where = this.buildFilterWhere(criteria, config);
    const { skip, take } = this.buildPagination(criteria);

    const records = await this.prisma.companyContact.findMany({
      where,
      orderBy: this.buildOrderBy(criteria, config),
      skip,
      take,
    });

    return records.map(CompanyContact.fromPrisma);
  }

  async countFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<number> {
    const where = this.buildFilterWhere(criteria, config);
    return this.prisma.companyContact.count({ where });
  }
}
