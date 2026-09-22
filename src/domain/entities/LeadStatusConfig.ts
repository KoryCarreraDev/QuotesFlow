import crypto from "crypto";

export class LeadStatusConfig {
    constructor(
        public readonly id: string,
        public readonly name?: string,
        public readonly order?: number,
        public readonly isDefault?: boolean,
        public readonly updateAt?: Date,
        public readonly createdAt?: Date,
        public readonly color?: string,
        public readonly tenantId?: string,
        public readonly deleted?: string
    ) { }

    static fromPrisma(prismaLead: {
        id: string;
        tenantId: string;
        name: string;
        order: number;
        isDefault: boolean;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        deleted: string | null;
    }): LeadStatusConfig {
        return new LeadStatusConfig(
            prismaLead.id,
            prismaLead.name,
            prismaLead.order,
            prismaLead.isDefault,
            prismaLead.updatedAt,
            prismaLead.createdAt,
            prismaLead.color ?? undefined,
            prismaLead.tenantId,
            prismaLead.deleted ?? undefined
        )
    }

    static create(props: {
        name?: string;
        order?: number;
        isDefault?: boolean;
        tenantId?: string;
        color?: string;
        deleted?: string;
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
            props.deleted
        )
    }
}