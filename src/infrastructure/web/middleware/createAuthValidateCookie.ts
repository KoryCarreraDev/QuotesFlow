import { Request, Response, NextFunction } from 'express';
import { AuthenticateSessionUseCase } from '../../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { UnauthorizedError } from '../../../domain/errors/UnauthorizedError.js';
import { sendApplicationError } from '../errors/errorResponse.js';
import { bindSessionToRequestContext } from '../../../cross-cutting/requestContext.js';
import { readAccessTokenCookie } from '../sessionCookies.js';

/**
 * Exige una sesión válida (F2-T02): cookie `accessToken` con un token vigente de una sesión abierta. El rol
 * de `req.user` sale de la base en cada petición, no del token (H2).
 */
export function createAuthValidateCookie(authenticateSession: AuthenticateSessionUseCase) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = readAccessTokenCookie(req);

    if (!token) {
      sendApplicationError(res, new UnauthorizedError(ErrorCode.SESSION_REQUIRED, 'Session cookie is required'));
      return;
    }

    try {
      const session = await authenticateSession.execute(token);
      req.user = {
        userId: session.userId,
        tenantId: session.tenantId,
        role: session.role,
        sessionId: session.sessionId,
      };
      bindSessionToRequestContext(session.userId, session.tenantId);
    } catch (authenticationError) {
      next(authenticationError);
      return;
    }

    next();
  };
}
