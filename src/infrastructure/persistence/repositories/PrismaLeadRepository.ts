import { BasePrismaRepository } from './BasePrismaRepository.js';
import { ILeadRepository } from '../../../application/ports/repositories/ILeadRepository.js';
import { Lead } from '../../../domain/entities/Lead.js';

export class PrismaLeadRepository extends BasePrismaRepository implements ILeadRepository {

    async findByTenant(): Promise<Lead[]> {
        const record = await this.prisma.lead.findMany({
            where: this.tenantWhere(),
            include: {
                assignedTo: true,
                status: true,
            },
        });
        return record.map(Lead.fromPrisma);
    }
}
