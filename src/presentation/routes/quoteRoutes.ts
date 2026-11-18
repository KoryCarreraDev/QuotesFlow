import { Request, RequestHandler, Router } from 'express';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { QuoteController } from '../../infrastructure/web/controllers/quoteControllers.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { acceptQuoteSchema, createQuoteSchema, sendQuoteSchema, updateQuoteSchema } from '../schemas/quoteSchema.js';

/** Controlador de cotizaciones de la petición; también lo usa la ruta `POST /leads/:id/quotes`. */
export function getQuoteController(req: Request): QuoteController {
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
    quotes.getCreateQuoteFromLeadUseCase(),
  );
}

/** Cotizaciones de la empresa de la sesión (F3-T05). */
export function quoteRouter(
  authenticateSession: AuthenticateSessionUseCase,
  documentRateLimiter: RequestHandler,
): Router {
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

  // PDF y envío: cupo propio por IP, antes de autenticar, porque generar el documento es lo caro (F3-A15).
  router.get('/:id/pdf', documentRateLimiter, authMiddleware, tenantMiddleware, (req, res, next) => {
    getQuoteController(req).pdf(req, res, next);
  });

  router.patch('/:id', authMiddleware, tenantMiddleware, validateBody(updateQuoteSchema), (req, res, next) => {
    getQuoteController(req).update(req, res, next);
  });

  router.delete('/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getQuoteController(req).delete(req, res, next);
  });

  // Cambios de estado: POST sobre la cotización, sin cuerpo.
  router.post(
    '/:id/send',
    documentRateLimiter,
    authMiddleware,
    tenantMiddleware,
    validateBody(sendQuoteSchema),
    (req, res, next) => {
      getQuoteController(req).send(req, res, next);
    },
  );

  router.post('/:id/accept', authMiddleware, tenantMiddleware, validateBody(acceptQuoteSchema), (req, res, next) => {
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
