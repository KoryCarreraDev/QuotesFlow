import { BasePrismaRepository } from './BasePrismaRepository.js';
import { IContactRepository } from '../../../application/ports/repositories/IContactRepository.js';
import { Contact } from '../../../domain/entities/Contact.js';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';

export class PrismaContactRepository extends BasePrismaRepository implements IContactRepository {

    async findByTenant(): Promise<Contact[]> {
        const records = await this.prisma.contact.findMany({
            where: this.tenantWhere(),
            include: {
                company: true,
            },
        });
        return records.map(Contact.fromPrisma);
    };

    async create(contact: Contact): Promise<void> {
        await this.prisma.contact.create({
            data: {
                id: contact.id,
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.email,
                phone: contact.phone,
                companyId: contact.companyId,
                tenantId: contact.tenantId,
                createdAt: contact.createdAt,
                updatedAt: contact.updatedAt,
            }
        });
    };

    async findById(id: string): Promise<Contact | null> {
        const record = await this.prisma.contact.findUnique({
            where: {
                id: id,
                tenantId: this.tenantId,
            },
            include: {
                company: true,
            },
        });

        return record ? Contact.fromPrisma(record) : null;
    }

    async update(contactId: string, data: Contact): Promise<void> {
        await this.prisma.contact.update({
            where: {
                id: contactId,
                tenantId: this.tenantId,
            },
            data: {
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                phone: data.phone,
                companyId: data.companyId,
            },
        });
    }

    async findFiltered (
        criteria: FilterCriteriaDTO,
        config: IFilterFieldConfig
    ): Promise<Contact[]> {
        const where = this.buildFilterWhere(criteria, config);
        const { skip, take } = this.buildPagination(criteria);

        const records = await this.prisma.contact.findMany({
            where,
            skip,
            take,
            include: {
                company: true,
            },
        });

        return records.map(Contact.fromPrisma);
    };

    async countFiltered(
        criteria: FilterCriteriaDTO,
        config: IFilterFieldConfig
    ): Promise<number> {
        const where = this.buildFilterWhere(criteria, config);
        return this.prisma.contact.count({ where });
    };
}
