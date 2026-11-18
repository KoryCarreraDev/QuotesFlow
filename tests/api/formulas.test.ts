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
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F3-T04: fórmulas de precio. Permisos por rol y aislamiento: suites de `tests/api/security/`.

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

const WINDOW_FORMULA = {
  name: 'Ventana por metro cuadrado',
  expression: 'ancho * alto * precioM2',
  variables: [
    { name: 'ancho', label: 'Ancho (m)' },
    { name: 'alto', label: 'Alto (m)' },
    { name: 'precioM2', label: 'Precio por m²' },
  ],
};

describe('API de fórmulas de precio', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;
  let salesRepCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
    salesRepCookie = sessionCookieFor(company.salesRep);
  });

  it('POST /formulas crea una fórmula válida y responde 201', async () => {
    const response = await request(app).post(apiPaths.formulas.create).set('Cookie', ownerCookie).send(WINDOW_FORMULA);

    expect(response.status).toBe(HTTP_CREATED);
    expect(response.body).toMatchObject(WINDOW_FORMULA);
    const stored = await prisma.formula.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored).toMatchObject({ tenantId: company.tenant.id, createdById: company.owner.id });
  });

  it.each([
    ['una función peligrosa', 'import({}, {})', ErrorCode.INVALID_FORMULA],
    ['un acceso a propiedades', 'ancho.constructor', ErrorCode.INVALID_FORMULA],
    ['una potencia', 'ancho ^ 999', ErrorCode.INVALID_FORMULA],
    ['una variable no declarada', 'ancho * largo', ErrorCode.INVALID_FORMULA],
  ])('POST /formulas con %s responde 400 %s y no guarda nada', async (_case, expression, code) => {
    const response = await request(app)
      .post(apiPaths.formulas.create)
      .set('Cookie', ownerCookie)
      .send({ ...WINDOW_FORMULA, expression });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe(code);
    await expect(prisma.formula.count({ where: { tenantId: company.tenant.id } })).resolves.toBe(0);
  });

  it('POST /formulas con variables repetidas responde 400 INVALID_FORMULA_VARIABLE', async () => {
    const response = await request(app)
      .post(apiPaths.formulas.create)
      .set('Cookie', ownerCookie)
      .send({ ...WINDOW_FORMULA, variables: [WINDOW_FORMULA.variables[0], WINDOW_FORMULA.variables[0]] });

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(response.body.error.code).toBe(ErrorCode.INVALID_FORMULA_VARIABLE);
  });

  it('GET /formulas/search: el comercial ve las fórmulas de su empresa con sus variables', async () => {
    const formula = await persistFormula(company.tenant.id, company.owner.id);

    const response = await request(app).get(apiPaths.formulas.filtered).set('Cookie', salesRepCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body.data).toEqual([
      expect.objectContaining({ id: formula.id, variables: WINDOW_FORMULA.variables }),
    ]);
  });

  it('PATCH /formulas/:id cambia la expresión validándola', async () => {
    const formula = await persistFormula(company.tenant.id, company.owner.id);

    const valid = await request(app)
      .patch(apiPaths.formulas.update(formula.id))
      .set('Cookie', ownerCookie)
      .send({ expression: 'round(ancho * alto * precioM2, 0)' });
    const invalid = await request(app)
      .patch(apiPaths.formulas.update(formula.id))
      .set('Cookie', ownerCookie)
      .send({ expression: 'ancho; alto' });

    expect(valid.status).toBe(HTTP_OK);
    expect(valid.body.expression).toBe('round(ancho * alto * precioM2, 0)');
    expect(invalid.status).toBe(HTTP_BAD_REQUEST);
    expect(invalid.body.error.code).toBe(ErrorCode.INVALID_FORMULA);
  });

  it('PATCH /formulas/:id de una fórmula inexistente responde 404 FORMULA_NOT_FOUND', async () => {
    const response = await request(app)
      .patch(apiPaths.formulas.update(NON_EXISTENT_ID))
      .set('Cookie', ownerCookie)
      .send({ name: 'X' });

    expect(response.status).toBe(HTTP_NOT_FOUND);
    expect(response.body.error.code).toBe(ErrorCode.FORMULA_NOT_FOUND);
  });

  it('DELETE /formulas/:id de una fórmula que usa un producto responde 409 FORMULA_IN_USE', async () => {
    const formula = await persistFormula(company.tenant.id, company.owner.id);
    await persistProduct(company.tenant.id, { formulaId: formula.id });

    const response = await request(app).delete(apiPaths.formulas.delete(formula.id)).set('Cookie', ownerCookie);

    expect(response.status).toBe(HTTP_CONFLICT);
    expect(response.body.error.code).toBe(ErrorCode.FORMULA_IN_USE);
  });

  it('DELETE /formulas/:id borra (suave) una fórmula sin productos', async () => {
    const formula = await persistFormula(company.tenant.id, company.owner.id);

    const response = await request(app).delete(apiPaths.formulas.delete(formula.id)).set('Cookie', ownerCookie);

    expect(response.status).toBe(HTTP_OK);
    const stored = await prisma.formula.findUniqueOrThrow({ where: { id: formula.id } });
    expect(stored.deleted).toBe('DELETED');
  });
});
