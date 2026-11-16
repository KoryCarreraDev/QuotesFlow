// H23: la cookie dura siempre 7 días aunque JWT_EXPIRATION diga otra cosa; se corrige en F2-T02.
const SESSION_COOKIE_MAX_AGE_DAYS = 7;
const MILLISECONDS_PER_DAY = 86_400_000;
const SESSION_COOKIE_MAX_AGE_MS = SESSION_COOKIE_MAX_AGE_DAYS * MILLISECONDS_PER_DAY;

import { HttpStatus } from '@/infrastructure/web/errors/errorResponse.js';
import { Request, Response, NextFunction } from 'express';
import { RegisterCompanyAndOwnerUseCase } from '../../../application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { LoginUseCase } from '../../../application/use-case/auth/LoginUseCase.js';
import { env } from '../../../config/env.js';

export class AuthController {
  constructor(
    private registerUseCase: RegisterCompanyAndOwnerUseCase,
    private loginUseCase: LoginUseCase,
  ) {}

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.registerUseCase.execute(req.body);
      res.status(HttpStatus.CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.loginUseCase.execute(req.body);

      res.cookie('accessToken', result.token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: SESSION_COOKIE_MAX_AGE_MS,
        path: '/',
      });

      res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}
