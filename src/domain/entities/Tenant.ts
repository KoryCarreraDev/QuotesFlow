import crypto from 'crypto';

export class Tenant {
    constructor(
        public readonly id: string,
        public readonly name: string,
        public readonly logoUrl?: string | null,
        public readonly settings?: Record<string, unknown> | null,
        public readonly createdAt?: Date,
        public readonly updatedAt?: Date
    ) {}

    static create(props: { name: string; logoUrl?: string; settings?: Record<string, unknown >}): Tenant {
        const id = crypto.randomUUID();
        return new Tenant(
            id,
            props.name,
            props.logoUrl ?? null,
            props.settings ?? null
        );
    }
}