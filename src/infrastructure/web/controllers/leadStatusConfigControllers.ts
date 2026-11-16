import { DeleteLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/deleteLeadStatusConfigUseCase.js';
import { ReorderLeadStatusConfigsUseCase } from '@/application/use-case/LeadStatusConfig/reorderLeadStatusConfigsUseCase.js';
import { HttpStatus } from '@/infrastructure/web/errors/errorResponse.js';
import { Request, Response, NextFunction } from 'express';
import { GetLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/getLeadStatusConfigUseCase.js';
import { CreateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/createLeadStatusConfigUseCase.js';
import { UpdateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/updateLeadStatusConfigUseCase.js';
import { Role } from '@/domain/enums/Role.js';

export class LeadStatusConfigController {
  constructor(
    private readonly getLeadStatusUseCase: GetLeadStatusConfigUseCase,
    private readonly createLeadStatusUseCase: CreateLeadStatusConfigUseCase,
    private readonly updateLeadStatusUseCase: UpdateLeadStatusConfigUseCase,
    private readonly deleteLeadStatusUseCase: DeleteLeadStatusConfigUseCase,
    private readonly reorderLeadStatusesUseCase: ReorderLeadStatusConfigsUseCase,
  ) {}

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user?.role as Role, userId: req.user?.userId };
      await this.deleteLeadStatusUseCase.execute(req.params.id as string, actor);
      res.status(HttpStatus.OK).json({ message: 'Deleted successfully' });
    } catch (err) {
      next(err);
    }
  };

  reorder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user?.role as Role, userId: req.user?.userId };
      const statuses = await this.reorderLeadStatusesUseCase.execute(req.body.statusIds, actor);
      res.status(HttpStatus.OK).json(statuses);
    } catch (err) {
      next(err);
    }
  };

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const leadStatus = await this.getLeadStatusUseCase.execute();
      res.status(HttpStatus.OK).json(leadStatus);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role: Role = req.user?.role as Role;
      const status = await this.createLeadStatusUseCase.execute(req.body, role);
      res.status(HttpStatus.CREATED).json(status);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const role = req.user?.role as Role;
      const statusId = req.params.id as string;
      const status = await this.updateLeadStatusUseCase.execute(statusId, req.body, role, userId as string);
      res.status(HttpStatus.OK).json(status);
    } catch (err) {
      next(err);
    }
  };
}
