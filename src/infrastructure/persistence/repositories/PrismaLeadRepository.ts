import { BasePrismaRepository } from './BasePrismaRepository.js';
import { ILeadRepository } from '../../../application/ports/repositories/ILeadRepository.js';
import { Lead } from '../../../domain/entities/Lead.js';

export class PrismaLeadRepository extends BasePrismaRepository implements ILeadRepository {

    async findByTenant(assignedTo?: string): Promise<Lead[]> {

        if (!assignedTo) {
        const record = await this.prisma.lead.findMany({
            where: this.tenantWhere(),
            include: {
                assignedTo: true,
                status: true,
            },
        });
        return record.map(Lead.fromPrisma);
        }

        const record = await this.prisma.lead.findMany({
            where: {
                AND: [
                    this.tenantWhere(),
                    { assignedToId: assignedTo }
                ]
            },
            include: {
                assignedTo: true,
                status: true,
            },
        });
        return record.map(Lead.fromPrisma);
    };

    async create(lead: Lead): Promise<void> {
        const record = await this.prisma.lead.create({
            data: {
                id: lead.id,
                companyName: lead.companyName,
                contactName: lead.contactName,
                email: lead.email,
                phone: lead.phone,
                statusId: lead.statusId,
                source: lead.source,
                assignedToId: lead.assignedToId,
                estimatedValue: lead.estimatedValue,
                expectedCloseDate: lead.expectedCloseDate,
                notes: lead.notes,
                tenantId: lead.tenantId,
                createdAt: lead.createdAt,
                updatedAt: lead.updatedAt,
            }
        });
    };

    async findById(id: string): Promise<Lead | null> {
        const record = await this.prisma.lead.findUnique({
            where: {
                id: id,
                tenantId: this.tenantId,
            },
            include: {
                assignedTo: true,
                status: true,
            },
        });

        return record ? Lead.fromPrisma(record) : null;
    }

    async update(leadId: string, data: Lead): Promise<void> {
        await this.prisma.lead.update({
            where: {
                id: leadId,
                tenantId: this.tenantId,
            },
            data: {
                companyName: data.companyName,
                contactName: data.contactName,
                email: data.email,
                phone: data.phone,
                source: data.source,
                assignedToId: data.assignedToId,
                estimatedValue: data.estimatedValue,
                expectedCloseDate: data.expectedCloseDate,
                notes: data.notes,
            },
        });
    }
}
