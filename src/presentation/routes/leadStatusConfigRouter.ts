import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { IAuthTokenService } from '../../application/ports/services/IAuthTokenService.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { Request } from 'express';
import { LeadStatusConfigController } from '@/infrastructure/web/controllers/leadStatusConfigControllers.js';
import { createLeadStatusConfigSchema } from '../schemas/leadStatusConfigSchema.js';
import { reorderLeadStatusConfigsSchema, updateLeadStatusConfigSchema } from '../schemas/leadStatusConfigSchema.js';

function getLeadStatusConfigController(req: Request): LeadStatusConfigController {
  const getLeadStatusConfigUseCase = req.container!.leadStatuses.getGetLeadStatusConfigUseCase();
  const createLeadStatusConfigUseCase = req.container!.leadStatuses.getCreateLeadStatusConfigUseCase();
  const updateLeadStatusConfigUseCase = req.container!.leadStatuses.getUpdateLeadStatusConfigUseCase();
  const deleteLeadStatusConfigUseCase = req.container!.leadStatuses.getDeleteLeadStatusConfigUseCase();
  const reorderLeadStatusConfigsUseCase = req.container!.leadStatuses.getReorderLeadStatusConfigsUseCase();

  return new LeadStatusConfigController(
    getLeadStatusConfigUseCase,
    createLeadStatusConfigUseCase,
    updateLeadStatusConfigUseCase,
    deleteLeadStatusConfigUseCase,
    reorderLeadStatusConfigsUseCase,
  );
}

export function leadStatusConfigRouter(jwtService: IAuthTokenService): Router {
  const router = Router();
  const authMiddleware = createAuthValidateCookie(jwtService);
  const tenantMiddleware = createTenantMiddleware();

  router.get('/getAll', authMiddleware, tenantMiddleware, (req, res, next) => {
    getLeadStatusConfigController(req).getAll(req, res, next);
  });

  router.post(
    '/create',
    authMiddleware,
    tenantMiddleware,
    validateBody(createLeadStatusConfigSchema),
    (req, res, next) => {
      getLeadStatusConfigController(req).create(req, res, next);
    },
  );

  router.patch(
    '/update/:id',
    authMiddleware,
    tenantMiddleware,
    validateBody(updateLeadStatusConfigSchema),
    (req, res, next) => {
      getLeadStatusConfigController(req).update(req, res, next);
    },
  );

  router.post('/delete/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getLeadStatusConfigController(req).delete(req, res, next);
  });

  router.patch(
    '/reorder',
    authMiddleware,
    tenantMiddleware,
    validateBody(reorderLeadStatusConfigsSchema),
    (req, res, next) => {
      getLeadStatusConfigController(req).reorder(req, res, next);
    },
  );

  return router;
}
