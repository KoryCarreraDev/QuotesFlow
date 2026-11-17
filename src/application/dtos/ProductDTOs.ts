/** Producto tal como lo devuelve la API. Los importes van como texto decimal (F3-T01). */
export interface ProductDTO {
  id: string;
  name: string;
  description?: string;
  /** Precio unitario antes de IVA, `"150000.00"`. */
  basePrice?: string;
  formulaId?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Alta de un producto, ya validada en el borde. */
export interface CreateProductDTO {
  name: string;
  description?: string;
  basePrice?: string;
  formulaId?: string;
  isActive?: boolean;
}

/** Modificación parcial. `null` en `description`, `basePrice` o `formulaId` los quita. */
export interface UpdateProductDTO {
  name?: string;
  description?: string | null;
  basePrice?: string | null;
  formulaId?: string | null;
  isActive?: boolean;
}
