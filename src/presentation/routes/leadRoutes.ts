import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { LeadController } from '../../infrastructure/web/controllers/leadControllers.js';
import { createLeadSchema } from '../schemas/leadSchema.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { changeLeadStatusSchema, updateLeadSchema } from '../schemas/leadSchema.js';
import { Request } from 'express';

function getLeadController(req: Request): LeadController {
  const getLeadsUseCase = req.container!.leads.getGetLeadsUseCase();
  const listFilteredUseCase = req.container!.leads.getListFilteredLeadsUseCase();
  const createUseCase = req.container!.leads.getCreateLeadUseCase();
  const updateUseCase = req.container!.leads.getUpdateLeadUseCase();
  const deleteUseCase = req.container!.leads.getDeleteLeadUseCase();
  const changeStatusUseCase = req.container!.leads.getChangeLeadStatusUseCase();
  return new LeadController(
    getLeadsUseCase,
    listFilteredUseCase,
    createUseCase,
    updateUseCase,
    deleteUseCase,
    changeStatusUseCase,
  );
}

export function leadRouter(authenticateSession: AuthenticateSessionUseCase): Router {
  const router = Router();
  const authMiddleware = createAuthValidateCookie(authenticateSession);
  const tenantMiddleware = createTenantMiddleware();

  router.get('/', authMiddleware, tenantMiddleware, (req, res, next) => {
    getLeadController(req).getAll(req, res, next);
  });

  router.post('/', authMiddleware, tenantMiddleware, validateBody(createLeadSchema), (req, res, next) => {
    getLeadController(req).create(req, res, next);
  });

  router.patch('/:id', authMiddleware, tenantMiddleware, validateBody(updateLeadSchema), (req, res, next) => {
    getLeadController(req).update(req, res, next);
  });

  router.get('/search', authMiddleware, tenantMiddleware, (req, res, next) => {
    getLeadController(req).getFiltered(req, res, next);
  });

  router.delete('/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getLeadController(req).delete(req, res, next);
  });

  router.patch(
    '/:id/status',
    authMiddleware,
    tenantMiddleware,
    validateBody(changeLeadStatusSchema),
    (req, res, next) => {
      getLeadController(req).changeStatus(req, res, next);
    },
  );

  return router;
}
