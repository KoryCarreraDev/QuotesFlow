import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { IAuthTokenService } from "../../application/ports/services/IAuthTokenService.js";
import { leadController } from '../../infrastructure/web/controllers/leadControllers.js';
import { createLeadSchema } from '../schemas/leadSchema.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { updateLeadSchema } from '../schemas/leadSchema.js';
import { Request } from 'express';

function getLeadController(req: Request): leadController {
    const getLeadsUseCase = req.container!.getGetLeadsUseCase();
    const listFilteredUseCase = req.container!.getListFilteredLeadsUseCase();
    const createUseCase = req.container!.getCreateLeadUseCase();
    const updateUseCase = req.container!.getUpdateLeadUseCase();
    return new leadController(getLeadsUseCase, listFilteredUseCase, createUseCase, updateUseCase);
}

export function leadRouter(jwtService: IAuthTokenService): Router {
    const router = Router();
    const authMiddleware = createAuthValidateCookie(jwtService);
    const tenantMiddleware = createTenantMiddleware();

    router.get('/getAll', authMiddleware, tenantMiddleware, (req, res, next) => {
        getLeadController(req).getAll(req, res, next)
    });

    router.post('/create', authMiddleware, tenantMiddleware, validateBody(createLeadSchema), (req, res, next) => {
        getLeadController(req).create(req, res, next)
    });

    router.patch('/update/:id', authMiddleware, tenantMiddleware, validateBody(updateLeadSchema), (req, res, next) => {
        getLeadController(req).update(req, res, next)
    });

    router.get('/filtered', authMiddleware, tenantMiddleware, (req, res, next) => {
        getLeadController(req).getFiltered(req, res, next);
    })

    return router;
}