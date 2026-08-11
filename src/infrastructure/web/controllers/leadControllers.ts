import { Request, Response, NextFunction } from 'express';
import { GetLeadsUseCase } from '@/application/use-case/leads/getLeadsUseCase.js';
import { Role } from '@/domain/enums/Role.js';
import { CreateLeadUseCase } from '@/application/use-case/leads/createLeadUseCase.js';
import { UpdateLeadUseCase } from '@/application/use-case/leads/updateLeadUseCase.js';

export class leadController {

    constructor (
        private readonly getLeadsUseCase: GetLeadsUseCase,
        private readonly createLeadUseCase: CreateLeadUseCase,
        private readonly updateLeadUseCase: UpdateLeadUseCase
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

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId;
            const role = req.user?.role;
            const lead = await this.createLeadUseCase.execute(req.body, userId!, role as Role);
            res.status(201).json(lead);
        } catch (error) {
            next (error);
        }
    }

    update = async(req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.userId;
            const role = req.user?.role;
            const leadId = req.params.id as string;
            const lead = await this.updateLeadUseCase.execute(leadId, req.body, role as Role, userId!);
            res.status(200).json(lead);
        } catch(error) {
            next(error)
        }
    }
}

