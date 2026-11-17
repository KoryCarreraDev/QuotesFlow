import { RequestHandler, Router } from 'express';
import { AuthController, SessionController } from '../../infrastructure/web/controllers/AuthControllers.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { ScopedContainer } from '../../cross-cutting/container.js';
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../../presentation/schemas/authSchema.js';

/**
 * Rutas de `/api/v1/auth`. El cupo estricto por IP (H6) solo va donde se prueban credenciales o tokens de
 * correo (registro, login, verificación y recuperación): renovar la sesión lo hace cada navegador cada 15
 * minutos y adivinar un refresh token de 256 bits no es posible.
 */
export function authRouter(
  container: ScopedContainer,
  authenticateSession: AuthenticateSessionUseCase,
  credentialRateLimiter: RequestHandler,
): Router {
  const router = Router();
  const controller = new AuthController({
    register: container.auth.getRegisterCompanyUseCase(),
    login: container.auth.getLoginUseCase(),
    refresh: container.auth.getRefreshSessionUseCase(),
    logout: container.auth.getLogoutUseCase(),
    verifyEmail: container.auth.getVerifyEmailUseCase(),
    resendEmailVerification: container.auth.getResendEmailVerificationUseCase(),
    requestPasswordReset: container.auth.getRequestPasswordResetUseCase(),
    resetPassword: container.auth.getResetPasswordUseCase(),
  });

  router.post('/register', credentialRateLimiter, validateBody(registerSchema), controller.register);
  router.post('/login', credentialRateLimiter, validateBody(loginSchema), controller.login);
  // F2-T04: los enlaces de correo usan el cupo estricto: se prueban tokens y se envían correos.
  router.post('/verify-email', credentialRateLimiter, validateBody(verifyEmailSchema), controller.verifyEmail);
  router.post(
    '/verify-email/resend',
    credentialRateLimiter,
    validateBody(emailOnlySchema),
    controller.resendEmailVerification,
  );
  router.post(
    '/password/forgot',
    credentialRateLimiter,
    validateBody(emailOnlySchema),
    controller.requestPasswordReset,
  );
  router.post('/password/reset', credentialRateLimiter, validateBody(resetPasswordSchema), controller.resetPassword);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.post(
    '/logout-all',
    createAuthValidateCookie(authenticateSession),
    createTenantMiddleware(),
    (req, res, next) => {
      new SessionController(req.container!.auth.getLogoutAllSessionsUseCase()).logoutAll(req, res, next);
    },
  );
  return router;
}
