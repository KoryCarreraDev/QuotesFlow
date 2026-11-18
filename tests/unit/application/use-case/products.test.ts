import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import {
  CreateProductUseCase,
  DeleteProductUseCase,
  ListProductsUseCase,
  UpdateProductUseCase,
} from '@/application/use-case/products/ProductUseCases.js';
import { Product } from '@/domain/entities/Product.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { Money } from '@/domain/value-objects/money.js';
import { productFilterConfig } from '@/infrastructure/persistence/filters/productFilterConfig.js';
import { DEFAULT_TEST_TENANT_ID } from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryProductRepository } from '@tests/support/doubles/InMemoryProductRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

// F3-T02: catálogo de productos.

const OTHER_TENANT_ID = 'other-tenant-id';
const owner = { role: Role.OWNER, userId: 'owner-id' };
const salesLeader = { role: Role.SALES_LEADER, userId: 'leader-id' };
const salesRep = { role: Role.SALES_REP, userId: 'rep-id' };

function buildProduct(overrides: Partial<Parameters<typeof Product.restore>[0]> = {}): Product {
  return Product.restore({
    id: randomUUID(),
    tenantId: DEFAULT_TEST_TENANT_ID,
    name: 'Ventana corrediza',
    basePrice: Money.fromDecimalString('450000'),
    isActive: true,
    ...overrides,
  });
}

function setup() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const repository = new InMemoryProductRepository(tenantContext);
  const auditLogger = new RecordingAuditLogger();
  const transactionManager = new RecordingTransactionManager();
  return {
    repository,
    auditLogger,
    transactionManager,
    listProducts: new ListProductsUseCase(repository, productFilterConfig),
    createProduct: new CreateProductUseCase(repository, tenantContext, transactionManager, auditLogger),
    updateProduct: new UpdateProductUseCase(repository, transactionManager, auditLogger),
    deleteProduct: new DeleteProductUseCase(repository, transactionManager, auditLogger),
  };
}

describe('Product (entidad)', () => {
  it('sin precio fijo ni fórmula no es un producto válido', () => {
    expect(() => Product.create(DEFAULT_TEST_TENANT_ID, { name: 'Sin precio', isActive: true })).toThrow(
      expect.objectContaining({ code: ErrorCode.PRODUCT_PRICE_REQUIRED }),
    );
  });

  it('quitar el precio fijo de un producto sin fórmula no está permitido', () => {
    expect(() => buildProduct().withChanges({ basePrice: null })).toThrow(
      expect.objectContaining({ code: ErrorCode.PRODUCT_PRICE_REQUIRED }),
    );
  });

  it('con fórmula puede quedarse sin precio fijo', () => {
    const product = buildProduct({ formulaId: randomUUID() }).withChanges({ basePrice: null, description: null });

    expect(product.basePrice).toBeUndefined();
    expect(product.description).toBeUndefined();
  });

  it('los cambios parciales conservan el resto de datos', () => {
    const product = buildProduct({ description: 'Aluminio' }).withChanges({ isActive: false });

    expect(product).toMatchObject({ name: 'Ventana corrediza', description: 'Aluminio', isActive: false });
    expect(product.basePrice?.toDecimalString()).toBe('450000.00');
  });
});

describe('Catálogo de productos', () => {
  it('todo el equipo busca en el catálogo, solo en el de su empresa', async () => {
    const { listProducts, repository } = setup();
    repository.seed(buildProduct(), buildProduct({ tenantId: OTHER_TENANT_ID }));

    const result = await listProducts.execute(salesRep, {});

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({ name: 'Ventana corrediza', basePrice: '450000.00', isActive: true });
  });

  it('un rol desconocido no ve el catálogo', async () => {
    const { listProducts } = setup();

    await expect(listProducts.execute({ role: 'UNKNOWN' as Role }, {})).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
  });

  it('el líder crea un producto con precio exacto y queda auditado en la transacción', async () => {
    const { createProduct, repository, auditLogger, transactionManager } = setup();

    const created = await createProduct.execute(salesLeader, { name: 'Puerta', basePrice: '1250000.50' });

    expect(created).toMatchObject({ name: 'Puerta', basePrice: '1250000.50', isActive: true });
    expect(repository.findStoredById(created.id)?.tenantId).toBe(DEFAULT_TEST_TENANT_ID);
    expect(auditLogger.entries).toEqual([
      expect.objectContaining({ action: AuditAction.PRODUCT_CREATED, entityId: created.id }),
    ]);
    expect(transactionManager.completedTransactionCount).toBe(1);
  });

  it('crea un producto con una fórmula de la empresa', async () => {
    const { createProduct, repository } = setup();
    const formulaId = randomUUID();
    repository.existingFormulaIds.add(formulaId);

    const created = await createProduct.execute(owner, { name: 'Ventana a medida', formulaId });

    expect(created).toMatchObject({ formulaId, basePrice: undefined });
  });

  it('rechaza una fórmula que no es de la empresa', async () => {
    const { createProduct, auditLogger } = setup();

    await expect(
      createProduct.execute(owner, { name: 'Ventana a medida', formulaId: randomUUID() }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_PRODUCT_FORMULA });
    expect(auditLogger.entries).toEqual([]);
  });

  it('rechaza un producto sin precio ni fórmula', async () => {
    const { createProduct } = setup();

    await expect(createProduct.execute(owner, { name: 'Sin precio' })).rejects.toMatchObject({
      code: ErrorCode.PRODUCT_PRICE_REQUIRED,
    });
  });

  it.each(['create', 'update', 'delete'] as const)('el comercial no puede %s productos', async (operation) => {
    const { createProduct, updateProduct, deleteProduct, repository } = setup();
    const product = buildProduct();
    repository.seed(product);

    const attempt = {
      create: () => createProduct.execute(salesRep, { name: 'X', basePrice: '1' }),
      update: () => updateProduct.execute(salesRep, product.id, { name: 'X' }),
      delete: () => deleteProduct.execute(salesRep, product.id),
    }[operation];

    await expect(attempt()).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });
    expect(repository.findStoredById(product.id)?.name).toBe('Ventana corrediza');
  });

  it('modifica el precio y audita solo los nombres de los campos cambiados', async () => {
    const { updateProduct, repository, auditLogger } = setup();
    const product = buildProduct();
    repository.seed(product);

    const updated = await updateProduct.execute(owner, product.id, { basePrice: '99.90', isActive: false });

    expect(updated).toMatchObject({ basePrice: '99.90', isActive: false });
    expect(auditLogger.entries).toEqual([
      expect.objectContaining({
        action: AuditAction.PRODUCT_UPDATED,
        metadata: {
          changedFields: ['basePrice', 'isActive'],
          // F3-A21: el precio sí deja su valor anterior y el nuevo; `isActive` no es un campo sensible.
          changedValues: { basePrice: { from: '450000.00', to: '99.90' } },
        },
      }),
    ]);
  });

  it('cambiar o quitar la fórmula también deja el valor anterior y el nuevo (F3-A21)', async () => {
    const { updateProduct, repository, auditLogger } = setup();
    const oldFormulaId = randomUUID();
    const newFormulaId = randomUUID();
    repository.existingFormulaIds.add(newFormulaId);
    const product = buildProduct({ formulaId: oldFormulaId });
    repository.seed(product);

    await updateProduct.execute(owner, product.id, { formulaId: newFormulaId });
    await updateProduct.execute(owner, product.id, { formulaId: null });

    expect(auditLogger.entries.map((entry) => entry.metadata)).toEqual([
      { changedFields: ['formulaId'], changedValues: { formulaId: { from: oldFormulaId, to: newFormulaId } } },
      { changedFields: ['formulaId'], changedValues: { formulaId: { from: newFormulaId, to: null } } },
    ]);
  });

  it('un cambio que no toca el precio ni la fórmula no lleva valores', async () => {
    const { updateProduct, repository, auditLogger } = setup();
    const product = buildProduct();
    repository.seed(product);

    await updateProduct.execute(owner, product.id, { name: 'Otro nombre' });

    expect(auditLogger.entries[0].metadata).toEqual({ changedFields: ['name'] });
  });

  it('cambiar a una fórmula de otra empresa responde INVALID_PRODUCT_FORMULA', async () => {
    const { updateProduct, repository } = setup();
    const product = buildProduct();
    repository.seed(product);

    await expect(updateProduct.execute(owner, product.id, { formulaId: randomUUID() })).rejects.toMatchObject({
      code: ErrorCode.INVALID_PRODUCT_FORMULA,
    });
  });

  it.each(['update', 'delete'] as const)('%s de un producto de otra empresa responde PRODUCT_NOT_FOUND', async (op) => {
    const { updateProduct, deleteProduct, repository } = setup();
    const foreignProduct = buildProduct({ tenantId: OTHER_TENANT_ID });
    repository.seed(foreignProduct);

    const attempt =
      op === 'update'
        ? updateProduct.execute(owner, foreignProduct.id, { name: 'X' })
        : deleteProduct.execute(owner, foreignProduct.id);

    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.PRODUCT_NOT_FOUND });
  });

  it('borra (suave) un producto y queda auditado', async () => {
    const { deleteProduct, repository, auditLogger } = setup();
    const product = buildProduct();
    repository.seed(product);

    await deleteProduct.execute(salesLeader, product.id);

    expect(repository.isDeleted(product.id)).toBe(true);
    expect(auditLogger.entries).toEqual([
      expect.objectContaining({ action: AuditAction.PRODUCT_DELETED, entityId: product.id }),
    ]);
  });
});
