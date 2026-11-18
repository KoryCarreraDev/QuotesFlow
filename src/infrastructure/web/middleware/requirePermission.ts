import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Action, can } from '../../../application/policies/authorizationPolicy.js';
import { Role } from '../../../domain/enums/Role.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';

/**
 * Corta con 403 antes de leer el cuerpo si el rol de la sesión no tiene la acción (F3-A17). Solo sirve para
 * acciones sin alcance `own` (sin recurso concreto, `can` deniega los permisos `own`). El caso de uso vuelve a
 * comprobar el permiso: esto evita que quien no puede subir un archivo lo haga leer en memoria igualmente.
 *
 * Va después de la autenticación (necesita `req.user`).
 */
export function requirePermission(action: Action): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    const allowed = user !== undefined && can({ role: user.role as Role, userId: user.userId }, action);
    if (!allowed) {
      next(new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions'));
      return;
    }
    next();
  };
}
