import { Request, Response, NextFunction } from 'express';
import { GetLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/getLeadStatusConfigUseCase.js';
import { CreateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/createLeadStatusConfigUseCase.js';
import { UpdateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/updateLeadStatusConfigUseCase.js';
import { Role } from '@/domain/enums/Role.js';

export class leadStatusConfigControllers {

    constructor(
        private readonly getLeadStatusUseCase: GetLeadStatusConfigUseCase,
        private readonly createLeadStatusUseCase: CreateLeadStatusConfigUseCase,
        private readonly updateLeadStatusUseCase: UpdateLeadStatusConfigUseCase
    ){}

    getAll = async(req: Request, res: Response, next: NextFunction) => {
        try {
            const leadStatus = await this.getLeadStatusUseCase.execute();
            res.status(200).json(leadStatus);
        } catch (err) {
            next(err);
        }
    }

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const rolUser: Role = req.user?.role as Role;
            const status = await this.createLeadStatusUseCase.execute(req.body, rolUser);
            res.status(201).json(status);
        } catch (err) {
            next(err);
        }
    }

    update = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId;
            const rolUser = req.user?.role as Role;
            const statusId = req.params.id as string;
            const status = await this.updateLeadStatusUseCase.execute(
                statusId,
                req.body,
                rolUser,
                userId as string
            )
            res.status(200).json(status);
        } catch (err) {
            next(err);
        }
    }

}