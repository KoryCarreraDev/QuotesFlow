import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { CompanyContactController } from '../../infrastructure/web/controllers/companyContactControllers.js';
import { createCompanyContactSchema, updateCompanyContactSchema } from '../schemas/companyContactSchema.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { Request } from 'express';

function getCompanyContactController(req: Request): CompanyContactController {
  const getCompanyContactsUseCase = req.container!.companyContacts.getGetCompanyContactsUseCase();
  const listFilteredUseCase = req.container!.companyContacts.getListFilteredCompanyContactsUseCase();
  const createUseCase = req.container!.companyContacts.getCreateCompanyContactUseCase();
  const updateUseCase = req.container!.companyContacts.getUpdateCompanyContactUseCase();
  const deleteUseCase = req.container!.companyContacts.getDeleteCompanyContactUseCase();
  return new CompanyContactController(
    getCompanyContactsUseCase,
    listFilteredUseCase,
    createUseCase,
    updateUseCase,
    deleteUseCase,
  );
}

export function companyContactRouter(authenticateSession: AuthenticateSessionUseCase): Router {
  const router = Router();
  const authMiddleware = createAuthValidateCookie(authenticateSession);
  const tenantMiddleware = createTenantMiddleware();

  router.get('/', authMiddleware, tenantMiddleware, (req, res, next) => {
    getCompanyContactController(req).getAll(req, res, next);
  });

  router.post('/', authMiddleware, tenantMiddleware, validateBody(createCompanyContactSchema), (req, res, next) => {
    getCompanyContactController(req).create(req, res, next);
  });

  router.patch('/:id', authMiddleware, tenantMiddleware, validateBody(updateCompanyContactSchema), (req, res, next) => {
    getCompanyContactController(req).update(req, res, next);
  });

  router.get('/search', authMiddleware, tenantMiddleware, (req, res, next) => {
    getCompanyContactController(req).getFiltered(req, res, next);
  });

  router.delete('/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getCompanyContactController(req).delete(req, res, next);
  });

  return router;
}
