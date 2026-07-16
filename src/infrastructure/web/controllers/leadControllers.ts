import { Request, Response, NextFunction } from 'express';
import { GetLeadsUseCase } from '@/application/use-case/leads/getLeadsUseCase.js';
import { Role } from '@/domain/enums/Role.js';

export class leadController {

    constructor (
        private readonly getLeadsUseCase: GetLeadsUseCase
    ) {}

    getAll = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId;
            const role = req.user?.role;
            const leads = await this.getLeadsUseCase.execute(role as Role, userId);
            res.status(200).json(leads);
        } catch (error) {
            next (error);
        }
    };
}

