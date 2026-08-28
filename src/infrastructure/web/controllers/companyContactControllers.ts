import { Request, Response, NextFunction } from 'express';
import { GetCompanyContactsUseCase } from '@/application/use-case/companyContacts/getCompanyContactsUseCase.js';
import { CreateCompanyContactUseCase } from '@/application/use-case/companyContacts/createCompanyContactUseCase.js';
import { UpdateCompanyContactUseCase } from '@/application/use-case/companyContacts/updateCompanyContactUseCase.js';
import { ListFilteredCompanyContactsUseCase } from '@/application/use-case/companyContacts/listFilteredCompanyContactsUseCase.js';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';

export class companyContactController {

    constructor (
        private readonly getCompanyContactsUseCase: GetCompanyContactsUseCase,
        private readonly listFilteredCompanyContactsUseCase: ListFilteredCompanyContactsUseCase,
        private readonly createCompanyContactUseCase: CreateCompanyContactUseCase,
        private readonly updateCompanyContactUseCase: UpdateCompanyContactUseCase
    ) {}

    getAll = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyContacts = await this.getCompanyContactsUseCase.execute();
            res.status(200).json(companyContacts);
        } catch (error) {
            next (error);
        }
    };

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyContact = await this.createCompanyContactUseCase.execute(req.body);
            res.status(201).json(companyContact);
        } catch (error) {
            next (error);
        }
    }

    update = async(req: Request, res: Response, next: NextFunction) => {
        try {
            const companyContactId = req.params.id as string;
            const companyContact = await this.updateCompanyContactUseCase.execute(companyContactId, req.body);
            res.status(200).json(companyContact);
        } catch(error) {
            next(error)
        }
    }

    getFiltered = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const {search, page, limit } = req.query;
            const filtersRaw = req.query.filters as string | undefined;

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

            const result = await this.listFilteredCompanyContactsUseCase.execute(criteria);

            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };
}
