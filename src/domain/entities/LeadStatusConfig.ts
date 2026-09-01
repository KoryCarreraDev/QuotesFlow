import crypto from "crypto";

export class LeadStatusConfig{
    constructor(
        public readonly name: string,
        public readonly order: number,
        public readonly isDefault: boolean = false,
        public readonly updateAt: Date,
        public readonly createdAt?: Date,
        public readonly color?: string,
        public readonly id?: string,
        public readonly tenantId?: string,
    ) { }

    static fromPrisma(prismaLead: {
        id: string;
        tenantId: string;
        name: string;
        order: number;
        isDefault: boolean;
        createdAt: Date;
        updateAt: Date;
        color?: string;
    }): LeadStatusConfig {
        return new LeadStatusConfig(
            prismaLead.name,
            prismaLead.order,
            prismaLead.isDefault,
            prismaLead.updateAt,
            prismaLead.createdAt,
            prismaLead.color,
            prismaLead.id,
            prismaLead.tenantId,
        )
    }

    static create(props: {
        name: string;
        order: number;
        isDefault: boolean;
        tenantId: string;
        color?: string;
    }): LeadStatusConfig {
        const id = crypto.randomUUID();
        const now = new Date();
        return new LeadStatusConfig(
            props.name,
            props.order,
            props.isDefault,
            now,
            now,
            props.color,
            id,
            props.tenantId
        )
    }

    static update(props: {
        name: string;
        order: number;
        isDefault: boolean;
        updateAt: Date;
        color?: string;
    }): LeadStatusConfig {
        const now = new Date();
        return new LeadStatusConfig(
            props.name,
            props.order,
            props.isDefault,
            now,
            now,
            props.color,
        )
    }
}