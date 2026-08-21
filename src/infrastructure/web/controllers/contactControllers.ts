import { Request, Response, NextFunction } from 'express';
import { GetContactsUseCase } from '@/application/use-case/contacts/getContactsUseCase.js';
import { CreateContactUseCase } from '@/application/use-case/contacts/createContactUseCase.js';
import { UpdateContactUseCase } from '@/application/use-case/contacts/updateContactUseCase.js';
import { ListFilteredContactsUseCase } from '@/application/use-case/contacts/listFilteredContactsUseCase.js';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';

export class contactController {

    constructor (
        private readonly getContactsUseCase: GetContactsUseCase,
        private readonly listFilteredContactsUseCase: ListFilteredContactsUseCase,
        private readonly createContactUseCase: CreateContactUseCase,
        private readonly updateContactUseCase: UpdateContactUseCase
    ) {}

    getAll = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const contacts = await this.getContactsUseCase.execute();
            res.status(200).json(contacts);
        } catch (error) {
            next (error);
        }
    };

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const contact = await this.createContactUseCase.execute(req.body);
            res.status(201).json(contact);
        } catch (error) {
            next (error);
        }
    }

    update = async(req: Request, res: Response, next: NextFunction) => {
        try {
            const contactId = req.params.id as string;
            const contact = await this.updateContactUseCase.execute(contactId, req.body);
            res.status(200).json(contact);
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

            //Llamar al caso de uso filtrado
            const result = await this.listFilteredContactsUseCase.execute(criteria);

            //respuesta estandarizada
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };
}
