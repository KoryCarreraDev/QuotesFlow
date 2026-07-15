import { Request, Response, NextFunction } from 'express';
import { GetLeadsUseCase } from '@/application/use-case/leads/getLeadsUseCase.js';

export class leadController {

    constructor (
        private readonly getLeadsUseCase: GetLeadsUseCase
    ) {}

    getAll = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const leads = await this.getLeadsUseCase.execute();
            res.status(200).json(leads);
        } catch (error) {
            next (error);
        }
    };
}

