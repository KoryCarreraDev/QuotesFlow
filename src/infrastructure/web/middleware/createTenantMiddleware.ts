import { Request, Response, NextFunction } from "express";
import { ScopedContainer } from "../../../cross-cutting/container.js";
import { TenantContext } from "@/cross-cutting/tenantContext.js";

export function createTenantMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {

        try {
            const tenantId = req.user?.tenantId;

            if (!tenantId) throw new Error('Not Tenant');

            TenantContext.run(tenantId, () => {
                const container = new ScopedContainer(tenantId);
                req.container = container;
                next();
            });
        } catch (error) {
            next(error);
        }
    }
}