import { Request, Response, NextFunction } from 'express';
import { IAuthTokenService } from '../../../application/ports/services/IAuthTokenService.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { UnauthorizedError } from '../../../domain/errors/UnauthorizedError.js';
import { sendApplicationError } from '../errors/errorResponse.js';
import { bindSessionToRequestContext } from '../../../cross-cutting/requestContext.js';

export function createAuthValidateCookie(tokenService: IAuthTokenService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.accessToken;

    if (!token) {
      sendApplicationError(res, new UnauthorizedError(ErrorCode.SESSION_REQUIRED, 'Session cookie is required'));
      return;
    }

    try {
      const payload = tokenService.verifyToken(token);

      req.user = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
      };
      bindSessionToRequestContext(payload.sub, payload.tenantId);
    } catch (verificationError) {
      // Firma inválida, token caducado o mal formado: al cliente le basta saber que la sesión no vale.
      next(
        new UnauthorizedError(ErrorCode.INVALID_SESSION, 'Session is invalid or expired', { cause: verificationError }),
      );
      return;
    }

    next();
  };
}
