import { Request, Response, NextFunction } from 'express';
import { ScopedContainer } from '../../../cross-cutting/container.js';
import { TenantContext } from '@/cross-cutting/tenantContext.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { UnauthorizedError } from '../../../domain/errors/UnauthorizedError.js';

export function createTenantMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.user?.tenantId;

    // Un token válido sin tenant no identifica a qué empresa pertenece la sesión.
    if (!tenantId) {
      next(new UnauthorizedError(ErrorCode.INVALID_SESSION, 'Session is invalid or expired'));
      return;
    }

    TenantContext.run(tenantId, () => {
      const container = new ScopedContainer(tenantId);
      req.container = container;
      next();
    });
  };
}
