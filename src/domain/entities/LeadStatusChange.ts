import crypto from 'crypto';

/** Un cambio de estado de un lead: qué estado tenía, cuál tomó, quién lo cambió y cuándo. Es inmutable. */
export class LeadStatusChange {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly leadId: string,
    public readonly oldStatusId: string | undefined,
    public readonly newStatusId: string,
    public readonly changedById: string,
    public readonly note: string | undefined,
    public readonly changedAt: Date,
  ) {}

  static create(props: {
    tenantId: string;
    leadId: string;
    oldStatusId?: string;
    newStatusId: string;
    changedById: string;
    note?: string;
  }): LeadStatusChange {
    return new LeadStatusChange(
      crypto.randomUUID(),
      props.tenantId,
      props.leadId,
      props.oldStatusId,
      props.newStatusId,
      props.changedById,
      props.note,
      new Date(),
    );
  }
}
