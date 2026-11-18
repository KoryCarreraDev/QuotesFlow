import { NextFunction, Request, Response } from 'express';
import type { Actor } from '../../../application/policies/authorizationPolicy.js';
import {
  CreateProductUseCase,
  DeleteProductUseCase,
  ListProductsUseCase,
  UpdateProductUseCase,
} from '../../../application/use-case/products/ProductUseCases.js';
import { Role } from '../../../domain/enums/Role.js';
import { productFilterConfig } from '../../persistence/filters/productFilterConfig.js';
import { HttpStatus } from '../errors/errorResponse.js';
import { parseFilterQuery } from '../filters/parseFilterQuery.js';

function actorOf(req: Request): Actor {
  return { role: req.user!.role as Role, userId: req.user!.userId };
}

/** Catálogo de productos (F3-T02). */
export class ProductController {
  constructor(
    private readonly listProducts: ListProductsUseCase,
    private readonly createProduct: CreateProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly deleteProduct: DeleteProductUseCase,
  ) {}

  search = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const criteria = parseFilterQuery(req.query, productFilterConfig);
      res.status(HttpStatus.OK).json(await this.listProducts.execute(actorOf(req), criteria));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.CREATED).json(await this.createProduct.execute(actorOf(req), req.body));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = String(req.params.id);
      res.status(HttpStatus.OK).json(await this.updateProduct.execute(actorOf(req), productId, req.body));
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.deleteProduct.execute(actorOf(req), String(req.params.id));
      res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}
