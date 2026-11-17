import { Request, Router } from 'express';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { TenantController } from '../../infrastructure/web/controllers/tenantControllers.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { updateTenantProfileSchema } from '../schemas/tenantSchema.js';

function getTenantController(req: Request): TenantController {
  return new TenantController(
    req.container!.tenant.getGetTenantProfileUseCase(),
    req.container!.tenant.getUpdateTenantProfileUseCase(),
  );
}

/** Perfil de la empresa de la sesión (F2-T06). Sin id en la ruta: siempre es la propia (R5). */
export function tenantRouter(authenticateSession: AuthenticateSessionUseCase): Router {
  const router = Router();
  const authMiddleware = createAuthValidateCookie(authenticateSession);
  const tenantMiddleware = createTenantMiddleware();

  router.get('/', authMiddleware, tenantMiddleware, (req, res, next) => {
    getTenantController(req).getProfile(req, res, next);
  });

  router.patch('/', authMiddleware, tenantMiddleware, validateBody(updateTenantProfileSchema), (req, res, next) => {
    getTenantController(req).updateProfile(req, res, next);
  });

  return router;
}
