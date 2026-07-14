import { Request, Response, NextFunction } from 'express';
import { RegisterCompanyAndOwnerUseCase } from '../../../application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { LoginUseCase } from '../../../application/use-case/auth/LoginUseCase.js';
import { env } from '../../../config/env.js';

export class AuthController {
    constructor(private registerUseCase: RegisterCompanyAndOwnerUseCase, private loginUseCase: LoginUseCase) {}

    register = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await this.registerUseCase.execute(req.body);
            res.status(201).json(result);
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
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });

            res.status(200).json({ success: true });
        } catch (error) {
            next(error);
        }
    };
}
