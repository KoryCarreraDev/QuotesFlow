import { BasePrismaRepository } from "./BasePrismaRepository.js";
import { ILeadStatusConfigRepository } from "@/application/ports/repositories/ILeadStatusConfigRepository.js";
import { LeadStatusConfig } from "@/domain/entities/LeadStatusConfig.js";

export class PrismaLeadStatusConfigRepository extends BasePrismaRepository implements ILeadStatusConfigRepository {

    async create(status: LeadStatusConfig): Promise<void> {
        await this.prisma.leadStatusConfig.create({
            data: {
                id: status.id,
                tenantId: status.tenantId!,
                name: status.name!,
                order: status.order!,
                color: status.color,
                isDefault: status.isDefault,
            }
        });
    };

    async update(statusid: string, data: LeadStatusConfig): Promise<void> {
        await this.prisma.leadStatusConfig.update({
            where: {
                id: statusid,
                tenantId: this.tenantId,
            },
            data: {
                name: data.name,
                color: data.color,
                order: data.order,
                isDefault: data.isDefault,
                createdAt: data.createdAt,
                updatedAt: data.updateAt
            },
        });
    };

    async findAllByTenant(assignedTenant: string): Promise<LeadStatusConfig[]> {
        const record = await this.prisma.leadStatusConfig.findMany({
            where: {
                tenantId: assignedTenant,
                deleted: "INUSE"
            },
            orderBy: {
                order: "asc"
            }
        });

        return record.map(LeadStatusConfig.fromPrisma)
    };

    async findById(id: string): Promise<LeadStatusConfig | null>{
        const record = await this.prisma.leadStatusConfig.findUnique({
            where: {
                id: id,
                deleted: "INUSE",
                tenantId: this.tenantId
            }
        })

        return record ? LeadStatusConfig.fromPrisma(record) : null;
    }

    async countLeadByStatus(statusId: string): Promise<number> {
        const record = await this.prisma.leadStatusConfig.findUnique({
            where: {
                id: statusId,
                deleted: "INUSE",
                tenantId: this.tenantId
            },
            select: {
                _count: {
                    select: { leads: true },
                },
            },
        });

        return record?._count.leads ?? 0;
    }

    async findDefaultByTenant(assignedTenant: string): Promise<LeadStatusConfig | null> {
        const record = await this.prisma.leadStatusConfig.findFirst({
            where: {
                tenantId: assignedTenant,
                deleted: "INUSE",
                isDefault: true
            },
        });

        return record ? LeadStatusConfig.fromPrisma(record) : null;
    }
}