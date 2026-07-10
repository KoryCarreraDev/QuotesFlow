import crypto from "crypto";
import { Role } from '../enums/Role.js'

export class User {
    constructor (
        public readonly id: string,
        public readonly email: string,
        public readonly passwordHash: string,
        public readonly firstName: string,
        public readonly lastName: string,
        public readonly role: Role,
        public readonly isActive: boolean,
        public readonly tenantId: string,
        public readonly createdAt?: Date,
        public readonly updatedAt?: Date
    ) {}

    static create(props: {
        email: string;
        passwordHash: string;
        firstName: string;
        lastName: string;
        role: Role;
        tenantId: string;
    }): User {
        const id = crypto.randomUUID();
        return new User(
            id,
            props.email,
            props.passwordHash,
            props.firstName,
            props.lastName,
            props.role,
            true,
            props.tenantId
        );
    }
}