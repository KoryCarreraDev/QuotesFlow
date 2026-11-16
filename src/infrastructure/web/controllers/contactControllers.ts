import { parseFilterQuery } from '@/infrastructure/web/filters/parseFilterQuery.js';
import { contactFilterConfig } from '@/infrastructure/persistence/filters/contactFilterConfig.js';
import { DeleteContactUseCase } from '@/application/use-case/contacts/deleteContactUseCase.js';
import { Role } from '@/domain/enums/Role.js';
import { HttpStatus } from '@/infrastructure/web/errors/errorResponse.js';
import { Request, Response, NextFunction } from 'express';
import { GetContactsUseCase } from '@/application/use-case/contacts/getContactsUseCase.js';
import { CreateContactUseCase } from '@/application/use-case/contacts/createContactUseCase.js';
import { UpdateContactUseCase } from '@/application/use-case/contacts/updateContactUseCase.js';
import { ListFilteredContactsUseCase } from '@/application/use-case/contacts/listFilteredContactsUseCase.js';

export class contactController {
  constructor(
    private readonly getContactsUseCase: GetContactsUseCase,
    private readonly listFilteredContactsUseCase: ListFilteredContactsUseCase,
    private readonly createContactUseCase: CreateContactUseCase,
    private readonly updateContactUseCase: UpdateContactUseCase,
    private readonly deleteContactUseCase: DeleteContactUseCase,
  ) {}

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user?.role as Role, userId: req.user?.userId };
      await this.deleteContactUseCase.execute(req.params.id as string, actor);
      res.status(HttpStatus.OK).json({ message: 'Deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contacts = await this.getContactsUseCase.execute();
      res.status(200).json(contacts);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contact = await this.createContactUseCase.execute(req.body);
      res.status(201).json(contact);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const contactId = req.params.id as string;
      const contact = await this.updateContactUseCase.execute(contactId, req.body);
      res.status(200).json(contact);
    } catch (error) {
      next(error);
    }
  };

  getFiltered = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const criteria = parseFilterQuery(req.query, contactFilterConfig);
      const result = await this.listFilteredContactsUseCase.execute(criteria, {
        role: req.user?.role as Role,
        userId: req.user?.userId,
      });
      res.status(HttpStatus.OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}
