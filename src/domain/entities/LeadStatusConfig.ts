import { DeletedState } from '../enums/DeletedState.js';
import crypto from 'crypto';
import { LeadStatusType } from '../enums/LeadStatusType.js';

/**
 * Estado de lead configurable por empresa: nombre, orden, color, si es el predeterminado y su tipo (OPEN, WON, LOST; D-51).
 */
export class LeadStatusConfig {
  constructor(
    public readonly id: string,
    public readonly name?: string,
    public readonly order?: number,
    public readonly isDefault?: boolean,
    public readonly updatedAt?: Date,
    public readonly createdAt?: Date,
    public readonly color?: string,
    public readonly tenantId?: string,
    public readonly deleted?: DeletedState,
    public readonly type: LeadStatusType = LeadStatusType.OPEN,
  ) {}

  static fromPrisma(record: {
    id: string;
    tenantId: string;
    name: string;
    order: number;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    color: string | null;
    deleted: string | null;
    type?: string;
  }): LeadStatusConfig {
    return new LeadStatusConfig(
      record.id,
      record.name,
      record.order,
      record.isDefault,
      record.updatedAt,
      record.createdAt,
      record.color ?? undefined,
      record.tenantId,
      (record.deleted as DeletedState | null) ?? undefined,
      (record.type as LeadStatusType | undefined) ?? LeadStatusType.OPEN,
    );
  }

  static create(props: {
    name?: string;
    order?: number;
    isDefault?: boolean;
    tenantId?: string;
    color?: string;
    deleted?: DeletedState;
    type?: LeadStatusType;
  }): LeadStatusConfig {
    const id = crypto.randomUUID();
    const now = new Date();
    return new LeadStatusConfig(
      id,
      props.name,
      props.order,
      props.isDefault,
      now,
      now,
      props.color,
      props.tenantId,
      props.deleted,
      props.type ?? LeadStatusType.OPEN,
    );
  }
}
