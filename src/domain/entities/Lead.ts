import { DeletedState } from '../enums/DeletedState.js';
import { Money } from '../value-objects/money.js';

/** Decimal tal como lo entrega la base de datos: el `Decimal` de Prisma o su texto. */
type StoredDecimal = string | { toFixed(): string };

// `toFixed()` sin argumentos escribe el valor completo sin notación científica.
function moneyFromStoredDecimal(value: StoredDecimal): Money {
  return Money.fromDecimalStringRounded(typeof value === 'string' ? value : value.toFixed());
}
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
    public readonly estimatedValue?: Money,
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
    // Prisma lo entrega como Decimal: se lee por su texto, nunca como number (F3-T01, H21).
    estimatedValue?: StoredDecimal | null;
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
      record.estimatedValue ? moneyFromStoredDecimal(record.estimatedValue) : undefined,
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
    estimatedValue?: Money;
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
