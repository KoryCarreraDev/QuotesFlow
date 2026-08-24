import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { IAuthTokenService } from "../../application/ports/services/IAuthTokenService.js";
import { contactController } from '../../infrastructure/web/controllers/contactControllers.js';
import { createContactSchema, updateContactSchema } from '../schemas/contactSchema.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { Request } from 'express';

function getContactController(req: Request): contactController {
    const getContactsUseCase = req.container!.getGetContactsUseCase();
    const listFilteredUseCase = req.container!.getListFilteredContactsUseCase();
    const createUseCase = req.container!.getCreateContactUseCase();
    const updateUseCase = req.container!.getUpdateContactUseCase();
    return new contactController(getContactsUseCase, listFilteredUseCase, createUseCase, updateUseCase);
}

export function contactRouter(jwtService: IAuthTokenService): Router {
    const router = Router();
    const authMiddleware = createAuthValidateCookie(jwtService);
    const tenantMiddleware = createTenantMiddleware();

    router.get('/getAll', authMiddleware, tenantMiddleware, (req, res, next) => {
        getContactController(req).getAll(req, res, next)
    });

    router.post('/create', authMiddleware, tenantMiddleware, validateBody(createContactSchema), (req, res, next) => {
        getContactController(req).create(req, res, next)
    });

    router.patch('/update/:id', authMiddleware, tenantMiddleware, validateBody(updateContactSchema), (req, res, next) => {
        getContactController(req).update(req, res, next)
    });

    router.get('/filtered', authMiddleware, tenantMiddleware, (req, res, next) => {
        getContactController(req).getFiltered(req, res, next);
    })

    return router;
}
