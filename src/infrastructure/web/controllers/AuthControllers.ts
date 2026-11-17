import { HttpStatus } from '@/infrastructure/web/errors/errorResponse.js';
import { Request, Response, NextFunction } from 'express';
import { RegisterCompanyAndOwnerUseCase } from '../../../application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { LoginUseCase } from '../../../application/use-case/auth/LoginUseCase.js';
import { RefreshSessionUseCase } from '../../../application/use-case/auth/RefreshSessionUseCase.js';
import { LogoutUseCase } from '../../../application/use-case/auth/LogoutUseCase.js';
import { LogoutAllSessionsUseCase } from '../../../application/use-case/auth/LogoutAllSessionsUseCase.js';
import {
  ResendEmailVerificationUseCase,
  VerifyEmailUseCase,
} from '../../../application/use-case/auth/EmailVerificationUseCases.js';
import {
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from '../../../application/use-case/auth/PasswordResetUseCases.js';
import { AcceptInvitationUseCase } from '../../../application/use-case/auth/AcceptInvitationUseCase.js';
import { Role } from '../../../domain/enums/Role.js';
import { clearSessionCookies, readRefreshTokenCookie, setSessionCookies } from '../sessionCookies.js';

/** Casos de uso públicos de autenticación (registro, login, renovar y cerrar la sesión del navegador). */
export interface PublicAuthUseCases {
  register: RegisterCompanyAndOwnerUseCase;
  login: LoginUseCase;
  refresh: RefreshSessionUseCase;
  logout: LogoutUseCase;
  verifyEmail: VerifyEmailUseCase;
  resendEmailVerification: ResendEmailVerificationUseCase;
  requestPasswordReset: RequestPasswordResetUseCase;
  resetPassword: ResetPasswordUseCase;
  acceptInvitation: AcceptInvitationUseCase;
}

// Las peticiones que no deben revelar si un correo existe responden siempre esto (H8, F2-T04).
const ACCEPTED_RESPONSE = { status: 'ACCEPTED' };

export class AuthController {
  constructor(private readonly useCases: PublicAuthUseCases) {}

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 202: la empresa queda pendiente de verificar el correo (D-12); la respuesta es igual si el correo existe (H8).
      const receipt = await this.useCases.register.execute(req.body);
      res.status(HttpStatus.ACCEPTED).json(receipt);
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

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.useCases.verifyEmail.execute(req.body.token);
      res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  resendEmailVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.useCases.resendEmailVerification.execute(req.body.email);
      res.status(HttpStatus.ACCEPTED).json(ACCEPTED_RESPONSE);
    } catch (error) {
      next(error);
    }
  };

  requestPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.useCases.requestPasswordReset.execute(req.body.email);
      res.status(HttpStatus.ACCEPTED).json(ACCEPTED_RESPONSE);
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.useCases.resetPassword.execute(req.body.token, req.body.password);
      // Todas las sesiones quedaron cerradas, también la de este navegador si la había.
      clearSessionCookies(res);
      res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  acceptInvitation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // F2-T05: la cuenta nace con el correo verificado y la sesión abierta.
      const session = await this.useCases.acceptInvitation.execute(req.body);
      setSessionCookies(res, session);
      res.status(HttpStatus.CREATED).json({ success: true });
    } catch (error) {
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
