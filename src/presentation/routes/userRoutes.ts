import { Request, Router } from 'express';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { UserController } from '../../infrastructure/web/controllers/userControllers.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { inviteUserSchema, updateUserSchema } from '../schemas/userSchema.js';

function getUserController(req: Request): UserController {
  const users = req.container!.users;
  return new UserController({
    listUsers: users.getListTenantUsersUseCase(),
    listInvitations: users.getListUserInvitationsUseCase(),
    invite: users.getInviteUserUseCase(),
    revokeInvitation: users.getRevokeUserInvitationUseCase(),
    update: users.getUpdateTenantUserUseCase(),
  });
}

/** Usuarios de la empresa (F2-T05). Aceptar una invitación es público y vive en `/auth/invitations/accept`. */
export function userRouter(authenticateSession: AuthenticateSessionUseCase): Router {
  const router = Router();
  const authMiddleware = createAuthValidateCookie(authenticateSession);
  const tenantMiddleware = createTenantMiddleware();

  router.get('/', authMiddleware, tenantMiddleware, (req, res, next) => {
    getUserController(req).listUsers(req, res, next);
  });

  router.get('/invitations', authMiddleware, tenantMiddleware, (req, res, next) => {
    getUserController(req).listInvitations(req, res, next);
  });

  router.post('/invitations', authMiddleware, tenantMiddleware, validateBody(inviteUserSchema), (req, res, next) => {
    getUserController(req).invite(req, res, next);
  });

  router.delete('/invitations/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getUserController(req).revokeInvitation(req, res, next);
  });

  router.patch('/:id', authMiddleware, tenantMiddleware, validateBody(updateUserSchema), (req, res, next) => {
    getUserController(req).update(req, res, next);
  });

  return router;
}
