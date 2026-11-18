import { Request, Router } from 'express';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { FormulaController } from '../../infrastructure/web/controllers/formulaControllers.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { createFormulaSchema, updateFormulaSchema } from '../schemas/formulaSchema.js';

function getFormulaController(req: Request): FormulaController {
  const formulas = req.container!.formulas;
  return new FormulaController(
    formulas.getListFormulasUseCase(),
    formulas.getCreateFormulaUseCase(),
    formulas.getUpdateFormulaUseCase(),
    formulas.getDeleteFormulaUseCase(),
  );
}

/** Fórmulas de precio de la empresa de la sesión (F3-T04). */
export function formulaRouter(authenticateSession: AuthenticateSessionUseCase): Router {
  const router = Router();
  const authMiddleware = createAuthValidateCookie(authenticateSession);
  const tenantMiddleware = createTenantMiddleware();

  router.get('/search', authMiddleware, tenantMiddleware, (req, res, next) => {
    getFormulaController(req).search(req, res, next);
  });

  router.post('/', authMiddleware, tenantMiddleware, validateBody(createFormulaSchema), (req, res, next) => {
    getFormulaController(req).create(req, res, next);
  });

  router.patch('/:id', authMiddleware, tenantMiddleware, validateBody(updateFormulaSchema), (req, res, next) => {
    getFormulaController(req).update(req, res, next);
  });

  router.delete('/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getFormulaController(req).delete(req, res, next);
  });

  return router;
}
