import { DeletedState as StoredDeletedState } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';

// Código de Prisma para una restricción única violada.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
// Valores provisionales del reordenamiento; muy por debajo de los órdenes liberados por borrados.
const TEMPORARY_REORDER_BASE = -1_000_000_000;
import { BasePrismaRepository } from './BasePrismaRepository.js';
import { ILeadStatusConfigRepository } from '@/application/ports/repositories/ILeadStatusConfigRepository.js';
import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';

export class PrismaLeadStatusConfigRepository extends BasePrismaRepository implements ILeadStatusConfigRepository {
  async create(status: LeadStatusConfig): Promise<void> {
    await this.translateOrderConflict(() =>
      this.prisma.leadStatusConfig.create({
        data: {
          id: status.id,
          tenantId: status.tenantId!,
          name: status.name!,
          order: status.order!,
          color: status.color,
          isDefault: status.isDefault,
          type: status.type,
        },
      }),
    );
  }

  async update(statusId: string, data: LeadStatusConfig): Promise<void> {
    await this.translateOrderConflict(() => this.updateRecord(statusId, data));
  }

  async delete(statusId: string): Promise<void> {
    // La restricción única (tenantId, order) incluye los borrados: se mueve el orden por debajo de
    // todos los usados para que cualquier orden positivo quede libre.
    const lowest = await this.prisma.leadStatusConfig.aggregate({
      where: { tenantId: this.tenantId },
      _min: { order: true },
    });
    const freedOrder = Math.min(lowest._min.order ?? 0, 0) - 1;
    await this.prisma.leadStatusConfig.update({
      where: { id: statusId, ...this.tenantWhere() },
      data: { deleted: StoredDeletedState.DELETED, order: freedOrder, updatedAt: new Date() },
    });
  }

  async reorder(statusIdsInOrder: string[]): Promise<void> {
    // Dos pasadas para no chocar con la restricción única mientras se intercambian órdenes: primero a
    // valores provisionales lejos de los usados (los borrados viven en negativos pequeños), luego 1..n.
    for (const [index, statusId] of statusIdsInOrder.entries()) {
      await this.prisma.leadStatusConfig.update({
        where: { id: statusId, ...this.tenantWhere() },
        data: { order: TEMPORARY_REORDER_BASE - index },
      });
    }
    for (const [index, statusId] of statusIdsInOrder.entries()) {
      await this.prisma.leadStatusConfig.update({
        where: { id: statusId, ...this.tenantWhere() },
        data: { order: index + 1, updatedAt: new Date() },
      });
    }
  }

  private async updateRecord(statusId: string, data: LeadStatusConfig): Promise<void> {
    await this.prisma.leadStatusConfig.update({
      where: {
        id: statusId,
        tenantId: this.tenantId,
      },
      data: {
        name: data.name,
        color: data.color,
        order: data.order,
        isDefault: data.isDefault,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        type: data.type,
      },
    });
  }

  /** Un `order` repetido viola `@@unique([tenantId, order])`: es un conflicto del cliente, no un 500. */
  private async translateOrderConflict(write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new ConflictError(ErrorCode.LEAD_STATUS_ORDER_TAKEN, 'Another lead status already uses this order', {
          cause: error,
        });
      }
      throw error;
    }
  }

  async findAllByTenant(tenantId: string): Promise<LeadStatusConfig[]> {
    const record = await this.prisma.leadStatusConfig.findMany({
      where: {
        tenantId: tenantId,
        deleted: StoredDeletedState.INUSE,
      },
      orderBy: {
        order: 'asc',
      },
    });

    return record.map(LeadStatusConfig.fromPrisma);
  }

  async findById(id: string): Promise<LeadStatusConfig | null> {
    const record = await this.prisma.leadStatusConfig.findUnique({
      where: {
        id: id,
        deleted: StoredDeletedState.INUSE,
        tenantId: this.tenantId,
      },
    });

    return record ? LeadStatusConfig.fromPrisma(record) : null;
  }

  async countLeadByStatus(statusId: string): Promise<number> {
    const record = await this.prisma.leadStatusConfig.findUnique({
      where: {
        id: statusId,
        deleted: StoredDeletedState.INUSE,
        tenantId: this.tenantId,
      },
      select: {
        _count: {
          select: { leads: true },
        },
      },
    });

    return record?._count.leads ?? 0;
  }

  async findDefaultByTenant(tenantId: string): Promise<LeadStatusConfig | null> {
    const record = await this.prisma.leadStatusConfig.findFirst({
      where: {
        tenantId: tenantId,
        deleted: StoredDeletedState.INUSE,
        isDefault: true,
      },
    });

    return record ? LeadStatusConfig.fromPrisma(record) : null;
  }
}
