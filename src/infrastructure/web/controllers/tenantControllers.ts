import { Request, Response, NextFunction } from 'express';
import {
  GetTenantProfileUseCase,
  UpdateTenantProfileUseCase,
} from '../../../application/use-case/tenant/TenantProfileUseCases.js';
import { Role } from '../../../domain/enums/Role.js';
import { HttpStatus } from '../errors/errorResponse.js';

export class TenantController {
  constructor(
    private readonly getProfileUseCase: GetTenantProfileUseCase,
    private readonly updateProfileUseCase: UpdateTenantProfileUseCase,
  ) {}

  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user!.role as Role, userId: req.user!.userId };
      res.status(HttpStatus.OK).json(await this.getProfileUseCase.execute(actor));
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user!.role as Role, userId: req.user!.userId };
      res.status(HttpStatus.OK).json(await this.updateProfileUseCase.execute(actor, req.body));
    } catch (error) {
      next(error);
    }
  };
}
