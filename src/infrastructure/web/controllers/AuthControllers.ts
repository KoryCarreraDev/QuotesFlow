import { Request, Response, NextFunction } from 'express';
import { RegisterCompanyAndOwnerUseCase } from '../../../application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { LoginUseCase } from '../../../application/use-case/auth/LoginUseCase.js';

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
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };
}
