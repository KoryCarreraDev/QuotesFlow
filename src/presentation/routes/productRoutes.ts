import { Request, Router } from 'express';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { ProductController } from '../../infrastructure/web/controllers/productControllers.js';
import { createAuthValidateCookie } from '../../infrastructure/web/middleware/createAuthValidateCookie.js';
import { createTenantMiddleware } from '../../infrastructure/web/middleware/createTenantMiddleware.js';
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { createProductSchema, updateProductSchema } from '../schemas/productSchema.js';

function getProductController(req: Request): ProductController {
  const products = req.container!.products;
  return new ProductController(
    products.getListProductsUseCase(),
    products.getCreateProductUseCase(),
    products.getUpdateProductUseCase(),
    products.getDeleteProductUseCase(),
  );
}

/** Catálogo de productos de la empresa de la sesión (F3-T02). */
export function productRouter(authenticateSession: AuthenticateSessionUseCase): Router {
  const router = Router();
  const authMiddleware = createAuthValidateCookie(authenticateSession);
  const tenantMiddleware = createTenantMiddleware();

  router.get('/search', authMiddleware, tenantMiddleware, (req, res, next) => {
    getProductController(req).search(req, res, next);
  });

  router.post('/', authMiddleware, tenantMiddleware, validateBody(createProductSchema), (req, res, next) => {
    getProductController(req).create(req, res, next);
  });

  router.patch('/:id', authMiddleware, tenantMiddleware, validateBody(updateProductSchema), (req, res, next) => {
    getProductController(req).update(req, res, next);
  });

  router.delete('/:id', authMiddleware, tenantMiddleware, (req, res, next) => {
    getProductController(req).delete(req, res, next);
  });

  return router;
}
