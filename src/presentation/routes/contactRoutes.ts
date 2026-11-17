import { Router } from 'express';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { ContactController } from '../../infrastructure/web/controllers/contactControllers.js';
import { createContactSchema, updateContactSchema } from '../schemas/contactSchema.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { Request } from 'express';

function getContactController(req: Request): ContactController {
  const getContactsUseCase = req.container!.contacts.getGetContactsUseCase();
  const listFilteredUseCase = req.container!.contacts.getListFilteredContactsUseCase();
  const createUseCase = req.container!.contacts.getCreateContactUseCase();
  const updateUseCase = req.container!.contacts.getUpdateContactUseCase();
  const deleteUseCase = req.container!.contacts.getDeleteContactUseCase();
  return new ContactController(getContactsUseCase, listFilteredUseCase, createUseCase, updateUseCase, deleteUseCase);
}

export function contactRouter(authenticateSession: AuthenticateSessionUseCase): Router {
  const router = Router();
  const authMiddleware = createAuthValidateCookie(authenticateSession);
  const tenantMiddleware = createTenantMiddleware();

  router.get('/', authMiddleware, tenantMiddleware, (req, res, next) => {
    getContactController(req).getAll(req, res, next);
  });

  router.post('/', authMiddleware, tenantMiddleware, validateBody(createContactSchema), (req, res, next) => {
    getContactController(req).create(req, res, next);
  });

  router.patch('/:id', authMiddleware, tenantMiddleware, validateBody(updateContactSchema), (req, res, next) => {
    getContactController(req).update(req, res, next);
  });

  router.get('/search', authMiddleware, tenantMiddleware, (req, res, next) => {
    getContactController(req).getFiltered(req, res, next);
  });

  router.delete('/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getContactController(req).delete(req, res, next);
  });

  return router;
}
