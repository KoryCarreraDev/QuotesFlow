import { Request, Router } from 'express';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { QuoteController } from '../../infrastructure/web/controllers/quoteControllers.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { createQuoteSchema, updateQuoteSchema } from '../schemas/quoteSchema.js';

function getQuoteController(req: Request): QuoteController {
  const quotes = req.container!.quotes;
  return new QuoteController(
    quotes.getListQuotesUseCase(),
    quotes.getGetQuoteUseCase(),
    quotes.getCreateQuoteUseCase(),
    quotes.getUpdateQuoteUseCase(),
    quotes.getDeleteQuoteUseCase(),
    quotes.getSendQuoteUseCase(),
    quotes.getAcceptQuoteUseCase(),
    quotes.getRejectQuoteUseCase(),
    quotes.getReviseQuoteUseCase(),
    quotes.getGenerateQuotePdfUseCase(),
  );
}

/** Cotizaciones de la empresa de la sesión (F3-T05). */
export function quoteRouter(authenticateSession: AuthenticateSessionUseCase): Router {
  const router = Router();
  const authMiddleware = createAuthValidateCookie(authenticateSession);
  const tenantMiddleware = createTenantMiddleware();

  router.get('/search', authMiddleware, tenantMiddleware, (req, res, next) => {
    getQuoteController(req).search(req, res, next);
  });

  router.post('/', authMiddleware, tenantMiddleware, validateBody(createQuoteSchema), (req, res, next) => {
    getQuoteController(req).create(req, res, next);
  });

  router.get('/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getQuoteController(req).get(req, res, next);
  });

  router.get('/:id/pdf', authMiddleware, tenantMiddleware, (req, res, next) => {
    getQuoteController(req).pdf(req, res, next);
  });

  router.patch('/:id', authMiddleware, tenantMiddleware, validateBody(updateQuoteSchema), (req, res, next) => {
    getQuoteController(req).update(req, res, next);
  });

  router.delete('/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getQuoteController(req).delete(req, res, next);
  });

  // Cambios de estado: POST sobre la cotización, sin cuerpo.
  router.post('/:id/send', authMiddleware, tenantMiddleware, (req, res, next) => {
    getQuoteController(req).send(req, res, next);
  });

  router.post('/:id/accept', authMiddleware, tenantMiddleware, (req, res, next) => {
    getQuoteController(req).accept(req, res, next);
  });

  router.post('/:id/reject', authMiddleware, tenantMiddleware, (req, res, next) => {
    getQuoteController(req).reject(req, res, next);
  });

  router.post('/:id/revise', authMiddleware, tenantMiddleware, (req, res, next) => {
    getQuoteController(req).revise(req, res, next);
  });

  return router;
}
