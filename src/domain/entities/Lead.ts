import { DeletedState } from '../enums/DeletedState.js';
import crypto from 'crypto';

/**
 * Oportunidad comercial de un tenant: datos de contacto, estado, responsable (`assignedToId`) y valor estimado.
 */
export class Lead {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly companyName?: string,
    public readonly contactName?: string,
    public readonly email?: string,
    public readonly phone?: string,
    public readonly statusId?: string,
    public readonly source?: string,
    public readonly assignedToId?: string,
    public readonly estimatedValue?: number,
    public readonly expectedCloseDate?: Date,
    public readonly notes?: string,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
    public readonly deleted?: DeletedState,
  ) {}

  static fromPrisma(record: {
    id: string;
    tenantId: string;
    companyName?: string | null;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    statusId?: string | null;
    source?: string | null;
    assignedToId?: string | null;
    // Prisma lo entrega como Decimal; la conversión a número exacto llega con F3-T01 (H21).
    estimatedValue?: unknown;
    expectedCloseDate?: Date | null;
    notes?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    deleted?: string;
  }): Lead {
    return new Lead(
      record.id,
      record.tenantId,
      record.companyName ?? undefined,
      record.contactName ?? undefined,
      record.email ?? undefined,
      record.phone ?? undefined,
      record.statusId ?? undefined,
      record.source ?? undefined,
      record.assignedToId ?? undefined,
      record.estimatedValue ? Number(record.estimatedValue) : undefined,
      record.expectedCloseDate ?? undefined,
      record.notes ?? undefined,
      record.createdAt ?? undefined,
      record.updatedAt ?? undefined,
      (record.deleted as DeletedState | null) ?? undefined,
    );
  }

  static create(props: {
    tenantId: string;
    companyName?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    statusId?: string;
    source?: string;
    assignedToId?: string;
    estimatedValue?: number;
    expectedCloseDate?: Date;
    notes?: string;
    deleted?: DeletedState;
  }): Lead {
    const id = crypto.randomUUID();
    const now = new Date();
    return new Lead(
      id,
      props.tenantId,
      props.companyName,
      props.contactName,
      props.email,
      props.phone,
      props.statusId,
      props.source,
      props.assignedToId,
      props.estimatedValue,
      props.expectedCloseDate,
      props.notes,
      now,
      now,
      props.deleted,
    );
  }
}
