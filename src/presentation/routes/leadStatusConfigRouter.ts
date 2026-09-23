import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { IAuthTokenService } from "../../application/ports/services/IAuthTokenService.js";
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { Request } from 'express';
import { leadStatusConfigControllers } from '@/infrastructure/web/controllers/leadStatusConfigControllers.js';
import { createLeadStatusConfigSchema } from '../schemas/leadStatusConfigSchema.js';
import { updateLeadStatusConfigSchema } from '../schemas/leadStatusConfigSchema.js';

function getLeadStatusConfigController(req: Request): leadStatusConfigControllers {
    const getLeadsStatusUseCase = req.container!.getGetLeadsUseCase();
    const createLeadStatusConfigUseCase = req.container!.getCreateLeadUseCase();
    const updateLeadStatusConfigUseCase = req.container!.getUpdateLeadUseCase();

    return new leadStatusConfigControllers(getLeadsStatusUseCase, createLeadStatusConfigUseCase, updateLeadStatusConfigUseCase);
}

export function leadStatusConfigRouter(jwtService: IAuthTokenService): Router {
    const router = Router();
    const authMiddleware = createAuthValidateCookie(jwtService);
    const tenantMiddleware = createTenantMiddleware();

    router.get('/getAll', authMiddleware, tenantMiddleware, (req, res, next) => {
        getLeadStatusConfigController(req).getAll(req, res, next)
    });

    router.post('/create', authMiddleware, tenantMiddleware, validateBody(createLeadStatusConfigSchema), (req, res, next) => {
        getLeadStatusConfigController(req).create(req, res, next)
    });

    router.patch('/update/:id', authMiddleware, tenantMiddleware, validateBody(updateLeadStatusConfigSchema), (req, res, next) => {
        getLeadStatusConfigController(req).update(req, res, next)
    });

    return router;
}