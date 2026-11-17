import { Product } from '../../domain/entities/Product.js';
import { ProductDTO } from '../dtos/ProductDTOs.js';
import { IMapper } from '../ports/mappers/IMapper.js';

/** Producto a DTO: sin tenant ni marca de borrado; el precio, como texto decimal. */
export class ProductMapper implements IMapper<Product, ProductDTO> {
  toDTO(product: Product): ProductDTO {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      basePrice: product.basePrice?.toDecimalString(),
      formulaId: product.formulaId,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
