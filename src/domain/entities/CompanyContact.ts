import crypto from "crypto";

export class CompanyContact {
    constructor(
        public readonly id: string,
        public readonly tenantId: string,
        public readonly name: string,
        public readonly industry?: string,
        public readonly taxNumber?: string,
        public readonly phone?: string,
        public readonly email?: string,
        public readonly address?: string,
        public readonly city?: string,
        public readonly state?: string,
        public readonly zip?: string,
        public readonly country?: string,
        public readonly createdAt?: Date,
        public readonly updatedAt?: Date,
    ) { }

    static fromPrisma(prismaCompanyContact: {
        id: string;
        tenantId: string;
        name: string;
        industry?: string | null;
        taxNumber?: string | null;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
        country?: string | null;
        createdAt?: Date;
        updatedAt?: Date;
    }): CompanyContact {
        return new CompanyContact(
            prismaCompanyContact.id,
            prismaCompanyContact.tenantId,
            prismaCompanyContact.name,
            prismaCompanyContact.industry ?? undefined,
            prismaCompanyContact.taxNumber ?? undefined,
            prismaCompanyContact.phone ?? undefined,
            prismaCompanyContact.email ?? undefined,
            prismaCompanyContact.address ?? undefined,
            prismaCompanyContact.city ?? undefined,
            prismaCompanyContact.state ?? undefined,
            prismaCompanyContact.zip ?? undefined,
            prismaCompanyContact.country ?? undefined,
            prismaCompanyContact.createdAt ?? undefined,
            prismaCompanyContact.updatedAt ?? undefined,
        );
    }

    static create(props: {
        tenantId: string;
        name: string;
        industry?: string;
        taxNumber?: string;
        phone?: string;
        email?: string;
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
    }): CompanyContact {
        const id = crypto.randomUUID();
        const now = new Date();
        return new CompanyContact(
            id,
            props.tenantId,
            props.name,
            props.industry,
            props.taxNumber,
            props.phone,
            props.email,
            props.address,
            props.city,
            props.state,
            props.zip,
            props.country,
            now,
            now
        );
    }
}
