import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
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

export function leadStatusConfigRouter(authenticateSession: AuthenticateSessionUseCase): Router {
  const router = Router();
  const authMiddleware = createAuthValidateCookie(authenticateSession);
  const tenantMiddleware = createTenantMiddleware();

  router.get('/', authMiddleware, tenantMiddleware, (req, res, next) => {
    getLeadStatusConfigController(req).getAll(req, res, next);
  });

  router.post('/', authMiddleware, tenantMiddleware, validateBody(createLeadStatusConfigSchema), (req, res, next) => {
    getLeadStatusConfigController(req).create(req, res, next);
  });

  router.delete('/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getLeadStatusConfigController(req).delete(req, res, next);
  });

  // `/order` antes que `/:id`: si no, Express lo tomaría como el id de un estado.
  router.patch(
    '/order',
    authMiddleware,
    tenantMiddleware,
    validateBody(reorderLeadStatusConfigsSchema),
    (req, res, next) => {
      getLeadStatusConfigController(req).reorder(req, res, next);
    },
  );

  router.patch(
    '/:id',
    authMiddleware,
    tenantMiddleware,
    validateBody(updateLeadStatusConfigSchema),
    (req, res, next) => {
      getLeadStatusConfigController(req).update(req, res, next);
    },
  );

  return router;
}
