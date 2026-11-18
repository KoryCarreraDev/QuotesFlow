import crypto from 'crypto';
import { ErrorCode } from '../errors/ErrorCode.js';
import { ValidationError } from '../errors/ValidationError.js';
import { Money } from '../value-objects/money.js';

/** Datos de un producto que se pueden escribir al crearlo o modificarlo. */
export interface ProductData {
  name: string;
  description?: string;
  /** Precio unitario fijo, antes de IVA (Q-020). Sin él, el precio sale de la fórmula. */
  basePrice?: Money;
  /** Fórmula de precio (F3-T04). Si existe, manda sobre `basePrice` al cotizar. */
  formulaId?: string;
  /** Un producto inactivo no se ofrece en cotizaciones nuevas; las existentes lo conservan. */
  isActive: boolean;
}

/**
 * Producto o servicio que vende una empresa (F3-T02). Tiene precio fijo, fórmula de precio o ambos (la fórmula
 * calcula y el precio fijo queda de referencia); nunca ninguno de los dos.
 */
export class Product {
  private constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly name: string,
    readonly isActive: boolean,
    readonly description?: string,
    readonly basePrice?: Money,
    readonly formulaId?: string,
    readonly createdAt?: Date,
    readonly updatedAt?: Date,
  ) {}

  /**
   * @throws {ValidationError} `PRODUCT_PRICE_REQUIRED` si no tiene ni precio fijo ni fórmula.
   */
  static create(tenantId: string, data: ProductData): Product {
    const now = new Date();
    return Product.restore({ id: crypto.randomUUID(), tenantId, ...data, createdAt: now, updatedAt: now });
  }

  /**
   * Producto guardado, o el resultado de aplicar cambios a uno guardado. Comprueba la misma regla que `create`.
   *
   * @throws {ValidationError} `PRODUCT_PRICE_REQUIRED` si no tiene ni precio fijo ni fórmula.
   */
  static restore(record: ProductData & { id: string; tenantId: string; createdAt?: Date; updatedAt?: Date }): Product {
    if (record.basePrice === undefined && record.formulaId === undefined) {
      throw new ValidationError(ErrorCode.PRODUCT_PRICE_REQUIRED, 'Product needs a base price or a price formula');
    }
    return new Product(
      record.id,
      record.tenantId,
      record.name,
      record.isActive,
      record.description,
      record.basePrice,
      record.formulaId,
      record.createdAt,
      record.updatedAt,
    );
  }

  /** Producto con los cambios aplicados; `null` en `description`, `basePrice` o `formulaId` los quita. */
  withChanges(changes: ProductChanges): Product {
    return Product.restore({
      id: this.id,
      tenantId: this.tenantId,
      name: changes.name ?? this.name,
      description: changes.description === null ? undefined : (changes.description ?? this.description),
      basePrice: changes.basePrice === null ? undefined : (changes.basePrice ?? this.basePrice),
      formulaId: changes.formulaId === null ? undefined : (changes.formulaId ?? this.formulaId),
      isActive: changes.isActive ?? this.isActive,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }
}

/** Cambios de una modificación parcial. `undefined`: no se toca; `null`: se quita. */
export interface ProductChanges {
  name?: string;
  description?: string | null;
  basePrice?: Money | null;
  formulaId?: string | null;
  isActive?: boolean;
}
