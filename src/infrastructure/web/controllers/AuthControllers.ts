import { Request, Response, NextFunction } from 'express';
import { RegisterCompanyAndOwnerUseCase } from '../../../application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';

export class AuthController {
    constructor(private registerUseCase: RegisterCompanyAndOwnerUseCase) {}

    register = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await this.registerUseCase.execute(req.body);
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    };
}
