import { ScopedContainer } from "../cross-cutting/container";

declare global {
    namespace Express {
        interface Request {
            container?: ScopedContainer,
            user?: {
                userId: string;
                tenantId: string;
                role: string;
            };
        }
    }
}