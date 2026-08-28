import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { IAuthTokenService } from "../../application/ports/services/IAuthTokenService.js";
import { companyContactController } from '../../infrastructure/web/controllers/companyContactControllers.js';
import { createCompanyContactSchema, updateCompanyContactSchema } from '../schemas/companyContactSchema.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { Request } from 'express';

function getCompanyContactController(req: Request): companyContactController {
    const getCompanyContactsUseCase = req.container!.getGetCompanyContactsUseCase();
    const listFilteredUseCase = req.container!.getListFilteredCompanyContactsUseCase();
    const createUseCase = req.container!.getCreateCompanyContactUseCase();
    const updateUseCase = req.container!.getUpdateCompanyContactUseCase();
    return new companyContactController(getCompanyContactsUseCase, listFilteredUseCase, createUseCase, updateUseCase);
}

export function companyContactRouter(jwtService: IAuthTokenService): Router {
    const router = Router();
    const authMiddleware = createAuthValidateCookie(jwtService);
    const tenantMiddleware = createTenantMiddleware();

    router.get('/getAll', authMiddleware, tenantMiddleware, (req, res, next) => {
        getCompanyContactController(req).getAll(req, res, next)
    });

    router.post('/create', authMiddleware, tenantMiddleware, validateBody(createCompanyContactSchema), (req, res, next) => {
        getCompanyContactController(req).create(req, res, next)
    });

    router.patch('/update/:id', authMiddleware, tenantMiddleware, validateBody(updateCompanyContactSchema), (req, res, next) => {
        getCompanyContactController(req).update(req, res, next)
    });

    router.get('/filtered', authMiddleware, tenantMiddleware, (req, res, next) => {
        getCompanyContactController(req).getFiltered(req, res, next);
    })

    return router;
}
