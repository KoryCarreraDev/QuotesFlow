import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { IAuthTokenService } from "../../application/ports/services/IAuthTokenService.js";
import { leadController } from '../../infrastructure/web/controllers/leadControllers.js';

export function leadRouter(jwtService: IAuthTokenService): Router {
    const router = Router();
    const authMiddleware = createAuthValidateCookie(jwtService);
    const tenantMiddleware = createTenantMiddleware();

    router.get('/getAll', authMiddleware, tenantMiddleware, (req, res, next) => {
        const useCase = req.container!.getGetLeadsUseCase();
        const controller = new leadController(useCase);
        controller.getAll(req, res, next);
    });
    return router;
}