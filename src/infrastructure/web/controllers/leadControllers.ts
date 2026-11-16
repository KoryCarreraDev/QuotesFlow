import { parseFilterQuery } from '@/infrastructure/web/filters/parseFilterQuery.js';
import { leadFilterConfig } from '@/infrastructure/persistence/filters/leadFilterConfig.js';
import { HttpStatus } from '@/infrastructure/web/errors/errorResponse.js';
import { Request, Response, NextFunction } from 'express';
import { GetLeadsUseCase } from '@/application/use-case/leads/getLeadsUseCase.js';
import { Role } from '@/domain/enums/Role.js';
import { CreateLeadUseCase } from '@/application/use-case/leads/createLeadUseCase.js';
import { UpdateLeadUseCase } from '@/application/use-case/leads/updateLeadUseCase.js';
import { DeleteLeadUseCase } from '@/application/use-case/leads/deleteLeadUseCase.js';
import { ChangeLeadStatusUseCase } from '@/application/use-case/leads/changeLeadStatusUseCase.js';
import { ListFilteredLeadsUseCase } from '@/application/use-case/leads/listFilteredLeadsUseCase.js';

export class leadController {
  constructor(
    private readonly getLeadsUseCase: GetLeadsUseCase,
    private readonly listFilteredLeadsUseCase: ListFilteredLeadsUseCase,
    private readonly createLeadUseCase: CreateLeadUseCase,
    private readonly updateLeadUseCase: UpdateLeadUseCase,
    private readonly deleteLeadUseCase: DeleteLeadUseCase,
    private readonly changeLeadStatusUseCase: ChangeLeadStatusUseCase,
  ) {}

  changeStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user?.role as Role, userId: req.user?.userId };
      const lead = await this.changeLeadStatusUseCase.execute(req.params.id as string, req.body, actor);
      res.status(HttpStatus.OK).json(lead);
    } catch (error) {
      next(error);
    }
  };

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const role = req.user?.role;
      const leads = await this.getLeadsUseCase.execute(role as Role, userId);
      res.status(HttpStatus.OK).json(leads);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const role = req.user?.role;
      const lead = await this.createLeadUseCase.execute(req.body, userId!, role as Role);
      res.status(HttpStatus.CREATED).json(lead);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const role = req.user?.role;
      const leadId = req.params.id as string;
      const lead = await this.updateLeadUseCase.execute(leadId, req.body, role as Role, userId!);
      res.status(HttpStatus.OK).json(lead);
    } catch (error) {
      next(error);
    }
  };

  getFiltered = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const criteria = parseFilterQuery(req.query, leadFilterConfig);
      const result = await this.listFilteredLeadsUseCase.execute(criteria, {
        role: req.user?.role as Role,
        userId: req.user?.userId,
      });
      res.status(HttpStatus.OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const role = req.user?.role;
      const leadId = req.params.id as string;
      await this.deleteLeadUseCase.execute(leadId, userId!, role as Role);
      res.status(HttpStatus.OK).json({ message: 'Lead deleted successfully' });
    } catch (error) {
      next(error);
    }
  };
}
