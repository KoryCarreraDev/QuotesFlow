import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import {
  type TenantWithTeam,
  persistFormula,
  persistProduct,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { serializeFilters, sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F3-T02: catálogo de productos. Permisos por rol y aislamiento: suites de `tests/api/security/`.

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

describe('API de productos', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;
  let salesRepCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
    salesRepCookie = sessionCookieFor(company.salesRep);
  });

  describe('POST /api/v1/products', () => {
    it('crea un producto con precio exacto y responde 201 sin exponer el tenant', async () => {
      const response = await request(app)
        .post(apiPaths.products.create)
        .set('Cookie', ownerCookie)
        .send({ name: 'Ventana corrediza', description: 'Aluminio', basePrice: '450000.5' });

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body).toMatchObject({ name: 'Ventana corrediza', basePrice: '450000.50', isActive: true });
      expect(response.body).not.toHaveProperty('tenantId');
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(stored.tenantId).toBe(company.tenant.id);
      expect(stored.basePrice?.toFixed()).toBe('450000.5');
    });

    it('crea un producto con una fórmula de la empresa', async () => {
      const formula = await persistFormula(company.tenant.id, company.owner.id);

      const response = await request(app)
        .post(apiPaths.products.create)
        .set('Cookie', ownerCookie)
        .send({ name: 'Ventana a medida', formulaId: formula.id });

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body.formulaId).toBe(formula.id);
    });

    it('una fórmula de otra empresa responde 400 INVALID_PRODUCT_FORMULA', async () => {
      const otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
      const foreignFormula = await persistFormula(otherCompany.tenant.id, otherCompany.owner.id);

      const response = await request(app)
        .post(apiPaths.products.create)
        .set('Cookie', ownerCookie)
        .send({ name: 'Ventana a medida', formulaId: foreignFormula.id });

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_PRODUCT_FORMULA);
    });

    it('sin precio ni fórmula responde 400 PRODUCT_PRICE_REQUIRED', async () => {
      const response = await request(app)
        .post(apiPaths.products.create)
        .set('Cookie', ownerCookie)
        .send({ name: 'Sin precio' });

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.PRODUCT_PRICE_REQUIRED);
    });

    it.each([
      ['precio como number', { name: 'X', basePrice: 450000 }],
      ['precio negativo', { name: 'X', basePrice: '-1' }],
      ['precio con tres decimales', { name: 'X', basePrice: '1.001' }],
      ['nombre vacío', { name: '   ', basePrice: '1' }],
      ['fórmula que no es un uuid', { name: 'X', formulaId: 'not-a-uuid' }],
    ])('rechaza con 400 VALIDATION_FAILED: %s', async (_case, body) => {
      const response = await request(app).post(apiPaths.products.create).set('Cookie', ownerCookie).send(body);

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  describe('GET /api/v1/products/search', () => {
    it('el comercial busca los productos activos de su empresa', async () => {
      const active = await persistProduct(company.tenant.id, { name: 'Ventana corrediza' });
      await persistProduct(company.tenant.id, { name: 'Ventana retirada', isActive: false });

      const response = await request(app)
        .get(apiPaths.products.filtered)
        .query({
          search: 'ventana',
          filters: serializeFilters([{ field: 'isActive', operator: 'equals', value: true }]),
        })
        .set('Cookie', salesRepCookie);

      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toMatchObject({ total: 1, page: 1 });
      expect(response.body.data).toEqual([expect.objectContaining({ id: active.id, basePrice: '450000.00' })]);
    });

    it('un filtro booleano con otro tipo de valor responde 400 INVALID_FILTER_VALUE', async () => {
      const response = await request(app)
        .get(apiPaths.products.filtered)
        .query({ filters: serializeFilters([{ field: 'isActive', operator: 'equals', value: 'true' }]) })
        .set('Cookie', ownerCookie);

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_FILTER_VALUE);
    });
  });

  describe('PATCH /api/v1/products/:id', () => {
    it('modifica el precio y desactiva el producto', async () => {
      const product = await persistProduct(company.tenant.id);

      const response = await request(app)
        .patch(apiPaths.products.update(product.id))
        .set('Cookie', ownerCookie)
        .send({ basePrice: '520000', isActive: false });

      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toMatchObject({ basePrice: '520000.00', isActive: false });
    });

    it('quitar el precio a un producto sin fórmula responde 400 PRODUCT_PRICE_REQUIRED', async () => {
      const product = await persistProduct(company.tenant.id);

      const response = await request(app)
        .patch(apiPaths.products.update(product.id))
        .set('Cookie', ownerCookie)
        .send({ basePrice: null });

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.PRODUCT_PRICE_REQUIRED);
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(stored.basePrice?.toFixed()).toBe('450000');
    });

    it('un cuerpo vacío responde 400 VALIDATION_FAILED', async () => {
      const product = await persistProduct(company.tenant.id);

      const response = await request(app)
        .patch(apiPaths.products.update(product.id))
        .set('Cookie', ownerCookie)
        .send({});

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('un producto inexistente responde 404 PRODUCT_NOT_FOUND', async () => {
      const response = await request(app)
        .patch(apiPaths.products.update(NON_EXISTENT_ID))
        .set('Cookie', ownerCookie)
        .send({ name: 'X' });

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(response.body.error.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
    });
  });

  describe('DELETE /api/v1/products/:id', () => {
    it('borra (suave) el producto y deja de aparecer en el catálogo', async () => {
      const product = await persistProduct(company.tenant.id);

      const response = await request(app).delete(apiPaths.products.delete(product.id)).set('Cookie', ownerCookie);

      expect(response.status).toBe(HTTP_OK);
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(stored.deleted).toBe('DELETED');
      const search = await request(app).get(apiPaths.products.filtered).set('Cookie', ownerCookie);
      expect(search.body.total).toBe(0);
    });
  });
});
