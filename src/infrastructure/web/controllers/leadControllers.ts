import { Request, Response, NextFunction } from 'express';
import { GetLeadsUseCase } from '@/application/use-case/leads/getLeadsUseCase.js';
import { Role } from '@/domain/enums/Role.js';
import { CreateLeadUseCase } from '@/application/use-case/leads/createLeadUseCase.js';
import { UpdateLeadUseCase } from '@/application/use-case/leads/updateLeadUseCase.js';
import { ListFilteredLeadsUseCase } from '@/application/use-case/leads/listFilteredLeadsUseCase.js';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';

export class leadController {

    constructor (
        private readonly getLeadsUseCase: GetLeadsUseCase,
        private readonly listFilteredLeadsUseCase: ListFilteredLeadsUseCase,
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

    getFiltered = async (req: Request, res: Response, next: NextFunction) => {
        try {
            //Extraer query params
            const {search, page, limit } = req.query;
            const filtersRaw = req.query.filters as string | undefined;

            //Parsear filters
            let filters: Array<{ field: string; operator: string; value: unknown }> = [];
            if (filtersRaw) {
                try {
                    const parsed = JSON.parse(filtersRaw);
                    filters = Array.isArray(parsed) ? parsed : [];
                } catch (error) {
                    return res.status(400).json({ error: 'Invalid filters format' });
                }
            }

            const criteria: FilterCriteriaDTO = {
                filters,
                search: search as string | undefined,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined
            };

            //SALES_REP solo ve sus leads asignados
            if (req.user?.role === Role.SALES_REP) {

                //Elimina cualquier filtro que intente modificar assignedToId
                filters = filters?.filter(f => f.field !== 'assignedToId');

                //Forzar el filtro por su propio userId
                filters.push({
                    field: 'assignedToId',
                    operator: 'equals',
                    value: req.user!.userId
                });
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
}

