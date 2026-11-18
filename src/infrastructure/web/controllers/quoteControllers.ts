import { NextFunction, Request, Response } from 'express';
import type { Actor } from '../../../application/policies/authorizationPolicy.js';
import {
  AcceptQuoteUseCase,
  CreateQuoteUseCase,
  DeleteQuoteUseCase,
  GetQuoteUseCase,
  ListQuotesUseCase,
  RejectQuoteUseCase,
  ReviseQuoteUseCase,
  SendQuoteUseCase,
  UpdateQuoteUseCase,
} from '../../../application/use-case/quotes/QuoteUseCases.js';
import { GenerateQuotePdfUseCase } from '../../../application/use-case/quotes/QuotePdfUseCase.js';
import { Role } from '../../../domain/enums/Role.js';
import { quoteFilterConfig } from '../../persistence/filters/quoteFilterConfig.js';
import { HttpStatus } from '../errors/errorResponse.js';
import { parseFilterQuery } from '../filters/parseFilterQuery.js';

function actorOf(req: Request): Actor & { userId: string } {
  return { role: req.user!.role as Role, userId: req.user!.userId };
}

/** Cotizaciones (F3-T05). */
export class QuoteController {
  constructor(
    private readonly listQuotes: ListQuotesUseCase,
    private readonly getQuote: GetQuoteUseCase,
    private readonly createQuote: CreateQuoteUseCase,
    private readonly updateQuote: UpdateQuoteUseCase,
    private readonly deleteQuote: DeleteQuoteUseCase,
    private readonly sendQuote: SendQuoteUseCase,
    private readonly acceptQuote: AcceptQuoteUseCase,
    private readonly rejectQuote: RejectQuoteUseCase,
    private readonly reviseQuote: ReviseQuoteUseCase,
    private readonly generateQuotePdf: GenerateQuotePdfUseCase,
  ) {}

  search = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const criteria = parseFilterQuery(req.query, quoteFilterConfig);
      res.status(HttpStatus.OK).json(await this.listQuotes.execute(actorOf(req), criteria));
    } catch (error) {
      next(error);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.OK).json(await this.getQuote.execute(actorOf(req), String(req.params.id)));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.CREATED).json(await this.createQuote.execute(actorOf(req), req.body));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.OK).json(await this.updateQuote.execute(actorOf(req), String(req.params.id), req.body));
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.deleteQuote.execute(actorOf(req), String(req.params.id));
      res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  send = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.OK).json(await this.sendQuote.execute(actorOf(req), String(req.params.id)));
    } catch (error) {
      next(error);
    }
  };

  accept = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.OK).json(await this.acceptQuote.execute(actorOf(req), String(req.params.id)));
    } catch (error) {
      next(error);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.OK).json(await this.rejectQuote.execute(actorOf(req), String(req.params.id)));
    } catch (error) {
      next(error);
    }
  };

  revise = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.CREATED).json(await this.reviseQuote.execute(actorOf(req), String(req.params.id)));
    } catch (error) {
      next(error);
    }
  };

  pdf = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await this.generateQuotePdf.execute(actorOf(req), String(req.params.id));
      // Contiene datos de clientes: nunca se guarda en cachés compartidas. El nombre sale del número de la cotización.
      res
        .status(HttpStatus.OK)
        .set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${file.fileName}"`,
          'Cache-Control': 'private, no-store',
        })
        .send(Buffer.from(file.content));
    } catch (error) {
      next(error);
    }
  };
}
