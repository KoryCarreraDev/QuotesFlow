import crypto from "crypto";

export class Contact {
    constructor(
        public readonly id: string,
        public readonly tenantId: string,
        public readonly firstName: string,
        public readonly lastName: string,
        public readonly email?: string,
        public readonly phone?: string,
        public readonly companyId?: string,
        public readonly createdAt?: Date,
        public readonly updatedAt?: Date,
    ) { }

    static fromPrisma(prismaContact: {
        id: string;
        tenantId: string;
        firstName: string;
        lastName: string;
        email?: string | null;
        phone?: string | null;
        companyId?: string | null;
        createdAt?: Date;
        updatedAt?: Date;
    }): Contact {
        return new Contact(
            prismaContact.id,
            prismaContact.tenantId,
            prismaContact.firstName,
            prismaContact.lastName,
            prismaContact.email ?? undefined,
            prismaContact.phone ?? undefined,
            prismaContact.companyId ?? undefined,
            prismaContact.createdAt ?? undefined,
            prismaContact.updatedAt ?? undefined,
        );
    }

    static create(props: {
        tenantId: string;
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
        companyId?: string;
    }): Contact {
        const id = crypto.randomUUID();
        const now = new Date();
        return new Contact(
            id,
            props.tenantId,
            props.firstName,
            props.lastName,
            props.email,
            props.phone,
            props.companyId,
            now,
            now
        );
    }
}
