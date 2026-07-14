declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
                tenantId: string;
                role: string;
            };
        }
    }
}

export {};