import crypto from "crypto";

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
    ) { }

    static fromPrisma(prismaLead: {
        id: string;
        tenantId: string;
        companyName?: string | null;
        contactName?: string | null;
        email?: string | null;
        phone?: string | null;
        statusId?: string | null;
        source?: string | null;
        assignedToId?: string | null;
        estimatedValue?: any;
        expectedCloseDate?: Date | null;
        notes?: string | null;
        createdAt?: Date;
        updatedAt?: Date;
    }): Lead {
        return new Lead(
            prismaLead.id,
            prismaLead.tenantId,
            prismaLead.companyName ?? undefined,
            prismaLead.contactName ?? undefined,
            prismaLead.email ?? undefined,
            prismaLead.phone ?? undefined,
            prismaLead.statusId ?? undefined,
            prismaLead.source ?? undefined,
            prismaLead.assignedToId ?? undefined,
            prismaLead.estimatedValue ? Number(prismaLead.estimatedValue) : undefined,
            prismaLead.expectedCloseDate ?? undefined,
            prismaLead.notes ?? undefined,
            prismaLead.createdAt ?? undefined,
            prismaLead.updatedAt ?? undefined,
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
            now   
        );
    }
}