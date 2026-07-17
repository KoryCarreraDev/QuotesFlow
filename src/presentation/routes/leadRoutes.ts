import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { IAuthTokenService } from "../../application/ports/services/IAuthTokenService.js";
import { leadController } from '../../infrastructure/web/controllers/leadControllers.js';
import { createLeadSchema } from '../schemas/leadSchema.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { CreateLeadUseCase } from '@/application/use-case/leads/createLeadUseCase.js';

export function leadRouter(jwtService: IAuthTokenService): Router {
    const router = Router();
    const authMiddleware = createAuthValidateCookie(jwtService);
    const tenantMiddleware = createTenantMiddleware();

    router.get('/getAll', authMiddleware, tenantMiddleware, (req, res, next) => {
        const getUseCase = req.container!.getGetLeadsUseCase();
        const createUseCase = req.container!.getCreateLeadUseCase();
        const controller = new leadController(getUseCase, createUseCase);
        controller.getAll(req, res, next);
    });

    router.post('/create', authMiddleware, tenantMiddleware, validateBody(createLeadSchema), (req, res, next) => {
        const getUseCase = req.container!.getGetLeadsUseCase();
        const createUseCase = req.container!.getCreateLeadUseCase();
        const controller = new leadController(getUseCase, createUseCase);
        controller.create(req, res, next);
    });
    return router;
}