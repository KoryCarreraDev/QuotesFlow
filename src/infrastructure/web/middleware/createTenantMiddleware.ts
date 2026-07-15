import { Request, Response, NextFunction } from "express";
import { ScopedContainer } from "../../../cross-cutting/container.js";

export function createTenantMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {

        try {
            const tenantId = req.user?.tenantId;

            if (!tenantId) throw new Error('Not Tenant');

            const container = new ScopedContainer(tenantId);

            req.container = container as ScopedContainer;

            next();
        } catch (error) {
            next(error);
        }
    }
}