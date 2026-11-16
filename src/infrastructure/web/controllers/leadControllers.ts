import { Action, scopeFor } from '@/application/policies/authorizationPolicy.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { Request, Response, NextFunction } from 'express';
import { GetLeadsUseCase } from '@/application/use-case/leads/getLeadsUseCase.js';
import { Role } from '@/domain/enums/Role.js';
import { CreateLeadUseCase } from '@/application/use-case/leads/createLeadUseCase.js';
import { UpdateLeadUseCase } from '@/application/use-case/leads/updateLeadUseCase.js';
import { DeleteLeadUseCase } from '@/application/use-case/leads/deleteLeadUseCase.js';
import { ListFilteredLeadsUseCase } from '@/application/use-case/leads/listFilteredLeadsUseCase.js';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';

export class leadController {
  constructor(
    private readonly getLeadsUseCase: GetLeadsUseCase,
    private readonly listFilteredLeadsUseCase: ListFilteredLeadsUseCase,
    private readonly createLeadUseCase: CreateLeadUseCase,
    private readonly updateLeadUseCase: UpdateLeadUseCase,
    private readonly deleteLeadUseCase: DeleteLeadUseCase,
  ) {}

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const role = req.user?.role;
      const leads = await this.getLeadsUseCase.execute(role as Role, userId);
      res.status(200).json(leads);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      const role = req.user?.role;
      const lead = await this.createLeadUseCase.execute(req.body, userId!, role as Role);
      res.status(201).json(lead);
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
      res.status(200).json(lead);
    } catch (error) {
      next(error);
    }
  };

  getFiltered = async (req: Request, res: Response, next: NextFunction) => {
    try {
      //Extraer query params
      const { search, page, limit } = req.query;
      const filtersRaw = req.query.filters as string | undefined;

      //Parsear filters
      let filters: Array<{ field: string; operator: string; value: unknown }> = [];
      if (filtersRaw) {
        try {
          const parsed = JSON.parse(filtersRaw);
          filters = Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          return next(
            new ValidationError(ErrorCode.INVALID_FILTERS_FORMAT, 'Invalid filters format', [], { cause: error }),
          );
        }
      }

      const criteria: FilterCriteriaDTO = {
        filters,
        search: search as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      };

      // Alcance del listado según la política (H12). F1-T12 lo lleva del controller al caso de uso.
      const scope = scopeFor({ role: req.user?.role as Role, userId: req.user?.userId }, Action.LEAD_LIST);
      if (scope.kind === 'none') {
        return next(new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions'));
      }
      if (scope.kind === 'own') {
        // Se descarta cualquier filtro por responsable que envíe el cliente y se fuerza el suyo.
        filters = filters.filter((f) => f.field !== 'assignedToId');
        filters.push({ field: 'assignedToId', operator: 'equals', value: scope.userId });
        criteria.filters = filters;
      }

      //Llamar al caso de uso filtrado
      const result = await this.listFilteredLeadsUseCase.execute(criteria);

      //respuesta estandarizada
      res.status(200).json(result);
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
      res.status(200).json({ message: 'Lead deleted successfully' });
    } catch (error) {
      next(error);
    }
  };
}
