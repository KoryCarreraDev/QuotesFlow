import { HttpStatus } from '@/infrastructure/web/errors/errorResponse.js';
import { Request, Response, NextFunction } from 'express';
import { RegisterCompanyAndOwnerUseCase } from '../../../application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { LoginUseCase } from '../../../application/use-case/auth/LoginUseCase.js';
import { RefreshSessionUseCase } from '../../../application/use-case/auth/RefreshSessionUseCase.js';
import { LogoutUseCase } from '../../../application/use-case/auth/LogoutUseCase.js';
import { LogoutAllSessionsUseCase } from '../../../application/use-case/auth/LogoutAllSessionsUseCase.js';
import { Role } from '../../../domain/enums/Role.js';
import { clearSessionCookies, readRefreshTokenCookie, setSessionCookies } from '../sessionCookies.js';

/** Casos de uso públicos de autenticación (registro, login, renovar y cerrar la sesión del navegador). */
export interface PublicAuthUseCases {
  register: RegisterCompanyAndOwnerUseCase;
  login: LoginUseCase;
  refresh: RefreshSessionUseCase;
  logout: LogoutUseCase;
}

export class AuthController {
  constructor(private readonly useCases: PublicAuthUseCases) {}

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.useCases.register.execute(req.body);
      res.status(HttpStatus.CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await this.useCases.login.execute(req.body);
      setSessionCookies(res, session);
      res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await this.useCases.refresh.execute(readRefreshTokenCookie(req));
      setSessionCookies(res, session);
      res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      // Con un refresh que no vale, las cookies que tiene el navegador tampoco sirven.
      clearSessionCookies(res);
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.useCases.logout.execute(readRefreshTokenCookie(req));
      clearSessionCookies(res);
      res.status(HttpStatus.NO_CONTENT).end();
    } catch (error) {
      next(error);
    }
  };
}

/** Cerrar todas las sesiones del usuario: exige sesión, por eso va aparte de los casos públicos. */
export class SessionController {
  constructor(private readonly logoutAllSessions: LogoutAllSessionsUseCase) {}

  logoutAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.logoutAllSessions.execute({ role: req.user!.role as Role, userId: req.user!.userId });
      clearSessionCookies(res);
      res.status(HttpStatus.NO_CONTENT).end();
    } catch (error) {
      next(error);
    }
  };
}
