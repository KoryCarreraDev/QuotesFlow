import { NextFunction, Request, Response } from 'express';
import {
  CreateFormulaUseCase,
  DeleteFormulaUseCase,
  ListFormulasUseCase,
  UpdateFormulaUseCase,
} from '../../../application/use-case/formulas/FormulaUseCases.js';
import { Role } from '../../../domain/enums/Role.js';
import { formulaFilterConfig } from '../../persistence/filters/formulaFilterConfig.js';
import { HttpStatus } from '../errors/errorResponse.js';
import { parseFilterQuery } from '../filters/parseFilterQuery.js';

function actorOf(req: Request): { role: Role; userId: string } {
  return { role: req.user!.role as Role, userId: req.user!.userId };
}

/** Fórmulas de precio (F3-T04). */
export class FormulaController {
  constructor(
    private readonly listFormulas: ListFormulasUseCase,
    private readonly createFormula: CreateFormulaUseCase,
    private readonly updateFormula: UpdateFormulaUseCase,
    private readonly deleteFormula: DeleteFormulaUseCase,
  ) {}

  search = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const criteria = parseFilterQuery(req.query, formulaFilterConfig);
      res.status(HttpStatus.OK).json(await this.listFormulas.execute(actorOf(req), criteria));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.CREATED).json(await this.createFormula.execute(actorOf(req), req.body));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const formulaId = String(req.params.id);
      res.status(HttpStatus.OK).json(await this.updateFormula.execute(actorOf(req), formulaId, req.body));
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.deleteFormula.execute(actorOf(req), String(req.params.id));
      res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}
