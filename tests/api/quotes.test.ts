import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import {
  type TenantWithTeam,
  persistContact,
  persistFormula,
  persistProduct,
  persistQuote,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { serializeFilters, sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F3-T05: cotizaciones. Permisos por rol, aislamiento y auditoría: suites de `tests/api/security/`.

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const QUOTE_TOTAL_AS_NUMBER = 238_000;

const MILLISECONDS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;
const MONEY_DECIMAL_PLACES = 2;
const CONCURRENT_CREATIONS = 5;
const DAYS_SINCE_EXPIRY = 3;
const QUOTE_VERSIONS_AFTER_REVISION = 2;

function isoDateAfter(days: number): string {
  return new Date(Date.now() + days * MILLISECONDS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);
}

describe('API de cotizaciones', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;
  let salesRepCookie: string;
  let salesRepContactId: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
    salesRepCookie = sessionCookieFor(company.salesRep);
    salesRepContactId = (await persistContact(company.tenant.id, { ownerId: company.salesRep.id })).id;
  });

  function createQuote(cookie: string, body: Record<string, unknown>) {
    return request(app).post(apiPaths.quotes.create).set('Cookie', cookie).send(body);
  }

  const freeItem = (overrides: Record<string, unknown> = {}) => ({
    description: 'Instalación',
    quantity: 2,
    unitPrice: '100000',
    taxRate: '19',
    ...overrides,
  });

  describe('POST /api/v1/quotes', () => {
    it('crea un borrador con número, importes exactos y sin exponer el tenant', async () => {
      const response = await createQuote(salesRepCookie, { contactId: salesRepContactId, items: [freeItem()] });

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body).toMatchObject({
        number: 1,
        reference: 'COT-000001',
        version: 1,
        status: 'DRAFT',
        displayStatus: 'DRAFT',
        subtotal: '200000.00',
        taxTotal: '38000.00',
        total: '238000.00',
        createdById: company.salesRep.id,
      });
      expect(response.body).not.toHaveProperty('tenantId');
      expect(response.body.items[0]).toMatchObject({ position: 1, unitPrice: '100000.00', isPriceOverridden: false });
      const stored = await prisma.quote.findUniqueOrThrow({
        where: { id: response.body.id },
        include: { items: true },
      });
      expect(stored.tenantId).toBe(company.tenant.id);
      expect(stored.total.toFixed(MONEY_DECIMAL_PLACES)).toBe('238000.00');
      expect(stored.items).toHaveLength(1);
    });

    it('numera de forma consecutiva dentro de la empresa', async () => {
      const first = await createQuote(ownerCookie, { contactId: salesRepContactId, items: [freeItem()] });
      const second = await createQuote(ownerCookie, { contactId: salesRepContactId, items: [freeItem()] });

      expect([first.body.reference, second.body.reference]).toEqual(['COT-000001', 'COT-000002']);
    });

    it('cinco altas simultáneas obtienen números distintos y sin huecos', async () => {
      const responses = await Promise.all(
        Array.from({ length: CONCURRENT_CREATIONS }, () =>
          createQuote(ownerCookie, { contactId: salesRepContactId, items: [freeItem()] }),
        ),
      );

      expect(responses.map((response) => response.status)).toEqual(Array(CONCURRENT_CREATIONS).fill(HTTP_CREATED));
      expect(responses.map((response) => response.body.number).sort()).toEqual(
        Array.from({ length: CONCURRENT_CREATIONS }, (_, index) => index + 1),
      );
    });

    it('con producto de precio fijo, calcula el precio en el servidor', async () => {
      const product = await persistProduct(company.tenant.id, { basePrice: '450000' });

      const response = await createQuote(salesRepCookie, {
        contactId: salesRepContactId,
        items: [{ productId: product.id, quantity: 2, taxRate: '19' }],
      });

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body.items[0]).toMatchObject({
        description: 'Ventana corrediza',
        calculatedUnitPrice: '450000.00',
        unitPrice: '450000.00',
      });
      expect(response.body.total).toBe('1071000.00');
    });

    it('con producto de fórmula, calcula con las variables del ítem', async () => {
      const formula = await persistFormula(company.tenant.id, company.owner.id, {
        expression: 'ancho * precioM2',
        variables: [
          { name: 'ancho', label: 'Ancho (m)' },
          { name: 'precioM2', label: 'Precio por m²' },
        ],
      });
      const product = await persistProduct(company.tenant.id, { basePrice: null, formulaId: formula.id });

      const response = await createQuote(salesRepCookie, {
        contactId: salesRepContactId,
        items: [{ productId: product.id, quantity: 1, taxRate: '0', variables: { ancho: '1.5', precioM2: '80000' } }],
      });

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body.items[0]).toMatchObject({ unitPrice: '120000.00', variables: { ancho: '1.5' } });
    });

    it('cambiar el precio calculado exige motivo y deja el aviso en la auditoría (D-24)', async () => {
      const product = await persistProduct(company.tenant.id, { basePrice: '450000' });
      const item = { productId: product.id, quantity: 1, taxRate: '19', unitPrice: '400000' };

      const withoutReason = await createQuote(salesRepCookie, { contactId: salesRepContactId, items: [item] });
      const withReason = await createQuote(salesRepCookie, {
        contactId: salesRepContactId,
        items: [{ ...item, priceOverrideReason: 'Cliente frecuente' }],
      });

      expect(withoutReason.status).toBe(HTTP_BAD_REQUEST);
      expect(withoutReason.body.error.code).toBe(ErrorCode.PRICE_OVERRIDE_REASON_REQUIRED);
      expect(withReason.status).toBe(HTTP_CREATED);
      expect(withReason.body.items[0]).toMatchObject({ isPriceOverridden: true, calculatedUnitPrice: '450000.00' });
      const overrideEntries = await prisma.auditLog.findMany({ where: { action: 'QUOTE_PRICE_OVERRIDDEN' } });
      expect(overrideEntries).toEqual([
        expect.objectContaining({ entityId: withReason.body.id, userId: company.salesRep.id }),
      ]);
      expect(JSON.stringify(overrideEntries)).not.toContain('Cliente frecuente');
    });

    it('sin IVA por defecto lo pide; con el de la empresa configurado, no (Q-020)', async () => {
      const withoutTax = await createQuote(salesRepCookie, {
        contactId: salesRepContactId,
        items: [{ description: 'Servicio', quantity: 1, unitPrice: '1000' }],
      });
      await request(app).patch(apiPaths.tenant.profile).set('Cookie', ownerCookie).send({ defaultTaxRate: '19' });
      const withDefault = await createQuote(salesRepCookie, {
        contactId: salesRepContactId,
        items: [{ description: 'Servicio', quantity: 1, unitPrice: '1000' }],
      });

      expect(withoutTax.status).toBe(HTTP_BAD_REQUEST);
      expect(withoutTax.body.error.code).toBe(ErrorCode.TAX_RATE_REQUIRED);
      expect(withDefault.status).toBe(HTTP_CREATED);
      expect(withDefault.body).toMatchObject({ taxTotal: '190.00', total: '1190.00' });
    });

    it('el tope de descuento del comercial es el de la empresa (D-25)', async () => {
      const aboveLimit = await createQuote(salesRepCookie, {
        contactId: salesRepContactId,
        discountRate: '10.01',
        items: [freeItem()],
      });
      await request(app)
        .patch(apiPaths.tenant.profile)
        .set('Cookie', ownerCookie)
        .send({ maximumDiscountRateSalesRep: '15' });
      const afterRaising = await createQuote(salesRepCookie, {
        contactId: salesRepContactId,
        discountRate: '12',
        items: [freeItem()],
      });
      const ownerNoLimit = await createQuote(ownerCookie, {
        contactId: salesRepContactId,
        discountRate: '50',
        items: [freeItem()],
      });

      expect(aboveLimit.status).toBe(HTTP_FORBIDDEN);
      expect(aboveLimit.body.error.code).toBe(ErrorCode.DISCOUNT_ABOVE_ROLE_LIMIT);
      expect(afterRaising.status).toBe(HTTP_CREATED);
      expect(ownerNoLimit.status).toBe(HTTP_CREATED);
    });

    it('un comercial no cotiza a un cliente ajeno: 400 sin revelar si existe', async () => {
      const othersContact = await persistContact(company.tenant.id, { ownerId: company.otherSalesRep.id });

      const response = await createQuote(salesRepCookie, { contactId: othersContact.id, items: [freeItem()] });
      const missing = await createQuote(salesRepCookie, { contactId: NON_EXISTENT_ID, items: [freeItem()] });

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_QUOTE_CUSTOMER);
      expect(missing.body.error).toMatchObject({ code: ErrorCode.INVALID_QUOTE_CUSTOMER });
    });

    it('rechaza entradas inválidas con 400', async () => {
      const badBodies = [
        { items: [freeItem()] },
        { contactId: salesRepContactId, items: [] },
        { contactId: salesRepContactId, items: [freeItem({ quantity: 0 })] },
        { contactId: salesRepContactId, items: [freeItem({ unitPrice: 100000 })] },
        { contactId: salesRepContactId, items: [freeItem({ taxRate: '120' })] },
        { contactId: salesRepContactId, validUntil: '2026-02-30', items: [freeItem()] },
        { contactId: salesRepContactId, validUntil: isoDateAfter(-1), items: [freeItem()] },
        { contactId: salesRepContactId, items: [{ description: 'Sin precio', quantity: 1, taxRate: '19' }] },
      ];

      const responses = await Promise.all(badBodies.map((body) => createQuote(ownerCookie, body)));

      expect(responses.map((response) => response.status)).toEqual(Array(badBodies.length).fill(HTTP_BAD_REQUEST));
      await expect(prisma.quote.count()).resolves.toBe(0);
    });
  });

  describe('lectura y listado', () => {
    it('GET /quotes/:id devuelve la cotización; la de otro comercial es 403 y la inexistente 404', async () => {
      const mine = await persistQuote(company.tenant.id, company.salesRep.id);
      const others = await persistQuote(company.tenant.id, company.otherSalesRep.id);

      const own = await request(app).get(apiPaths.quotes.get(mine.id)).set('Cookie', salesRepCookie);
      const foreign = await request(app).get(apiPaths.quotes.get(others.id)).set('Cookie', salesRepCookie);
      const missing = await request(app).get(apiPaths.quotes.get(NON_EXISTENT_ID)).set('Cookie', salesRepCookie);

      expect(own.status).toBe(HTTP_OK);
      expect(own.body).toMatchObject({ id: mine.id, reference: 'COT-000001', total: '238000.00' });
      expect(foreign.status).toBe(HTTP_FORBIDDEN);
      expect(missing.status).toBe(HTTP_NOT_FOUND);
    });

    it('una enviada con la vigencia pasada se muestra EXPIRED, se rechaza pero no se acepta (Q-016)', async () => {
      const expired = await persistQuote(company.tenant.id, company.salesRep.id, {
        status: 'SENT',
        validUntil: isoDateAfter(-DAYS_SINCE_EXPIRY),
      });

      const read = await request(app).get(apiPaths.quotes.get(expired.id)).set('Cookie', salesRepCookie);
      const accept = await request(app).post(apiPaths.quotes.accept(expired.id)).set('Cookie', salesRepCookie);
      const reject = await request(app).post(apiPaths.quotes.reject(expired.id)).set('Cookie', salesRepCookie);

      expect(read.body).toMatchObject({ status: 'SENT', displayStatus: 'EXPIRED' });
      expect(accept.status).toBe(HTTP_CONFLICT);
      expect(accept.body.error.code).toBe(ErrorCode.QUOTE_EXPIRED);
      expect(reject.status).toBe(HTTP_OK);
      expect(reject.body.status).toBe('REJECTED');
    });

    it('el listado de un comercial solo trae las suyas; el del líder, todas; filtra por estado', async () => {
      const mineDraft = await persistQuote(company.tenant.id, company.salesRep.id);
      const mineSent = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT' });
      const others = await persistQuote(company.tenant.id, company.otherSalesRep.id);
      const search = (cookie: string, filters?: Array<{ field: string; operator: string; value: unknown }>) =>
        request(app)
          .get(apiPaths.quotes.filtered)
          .query(filters ? { filters: serializeFilters(filters) } : {})
          .set('Cookie', cookie);

      const asRep = await search(salesRepCookie);
      const asLeader = await search(sessionCookieFor(company.salesLeader));
      const sentOnly = await search(sessionCookieFor(company.salesLeader), [
        { field: 'status', operator: 'equals', value: 'SENT' },
      ]);
      // Un comercial no se salta su alcance pidiendo el autor de otro.
      const forcedOtherAuthor = await search(salesRepCookie, [
        { field: 'createdById', operator: 'equals', value: company.otherSalesRep.id },
      ]);

      const ids = (response: request.Response) => response.body.data.map((quote: { id: string }) => quote.id).sort();
      expect(ids(asRep)).toEqual([mineDraft.id, mineSent.id].sort());
      expect(ids(asLeader)).toEqual([mineDraft.id, mineSent.id, others.id].sort());
      expect(ids(sentOnly)).toEqual([mineSent.id]);
      expect(ids(forcedOtherAuthor)).not.toContain(others.id);
      expect(asLeader.body).toMatchObject({ total: 3, page: 1 });
    });

    it('el total se filtra con un importe en texto; un number responde 400 (R8, F3-A11)', async () => {
      await persistQuote(company.tenant.id, company.salesRep.id);
      const search = (value: unknown) =>
        request(app)
          .get(apiPaths.quotes.filtered)
          .query({ filters: serializeFilters([{ field: 'total', operator: 'gte', value }]) })
          .set('Cookie', ownerCookie);

      const exact = await search('238000.00');
      const above = await search('238000.01');
      const asNumber = await search(QUOTE_TOTAL_AS_NUMBER);

      expect(exact.body.data).toHaveLength(1);
      expect(above.body.data).toHaveLength(0);
      expect(asNumber.status).toBe(HTTP_BAD_REQUEST);
      expect(asNumber.body.error.code).toBe(ErrorCode.INVALID_FILTER_VALUE);
    });

    it('un estado inexistente en el filtro es 400, no 500', async () => {
      const response = await request(app)
        .get(apiPaths.quotes.filtered)
        .query({ filters: serializeFilters([{ field: 'status', operator: 'equals', value: 'INVENTADO' }]) })
        .set('Cookie', ownerCookie);

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_FILTER_VALUE);
    });
  });

  describe('PATCH y DELETE de un borrador', () => {
    it('modifica notas e ítems y recalcula los importes', async () => {
      const created = await createQuote(salesRepCookie, { contactId: salesRepContactId, items: [freeItem()] });

      const response = await request(app)
        .patch(apiPaths.quotes.update(created.body.id))
        .set('Cookie', salesRepCookie)
        .send({ notes: 'Entrega en obra', items: [freeItem({ quantity: 5 })] });

      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toMatchObject({ notes: 'Entrega en obra', subtotal: '500000.00', total: '595000.00' });
      await expect(prisma.quoteItem.count({ where: { quoteId: created.body.id } })).resolves.toBe(1);
    });

    it('un cuerpo vacío o con campos inválidos es 400', async () => {
      const created = await createQuote(salesRepCookie, { contactId: salesRepContactId, items: [freeItem()] });

      const empty = await request(app)
        .patch(apiPaths.quotes.update(created.body.id))
        .set('Cookie', salesRepCookie)
        .send({});
      const noItems = await request(app)
        .patch(apiPaths.quotes.update(created.body.id))
        .set('Cookie', salesRepCookie)
        .send({ items: [] });

      expect([empty.status, noItems.status]).toEqual([HTTP_BAD_REQUEST, HTTP_BAD_REQUEST]);
    });

    it('borra el borrador (suave) y deja de existir para la API', async () => {
      const created = await createQuote(salesRepCookie, { contactId: salesRepContactId, items: [freeItem()] });

      const deleted = await request(app).delete(apiPaths.quotes.delete(created.body.id)).set('Cookie', salesRepCookie);
      const read = await request(app).get(apiPaths.quotes.get(created.body.id)).set('Cookie', salesRepCookie);

      expect(deleted.status).toBe(HTTP_OK);
      expect(read.status).toBe(HTTP_NOT_FOUND);
      await expect(prisma.quote.findUnique({ where: { id: created.body.id } })).resolves.toMatchObject({
        deleted: 'DELETED',
      });
    });
  });

  describe('ciclo de vida', () => {
    it('enviar, aceptar: después ya no se edita, ni se borra, ni se vuelve a decidir', async () => {
      const created = await createQuote(salesRepCookie, { contactId: salesRepContactId, items: [freeItem()] });
      const id = created.body.id;

      const sent = await request(app).post(apiPaths.quotes.send(id)).set('Cookie', salesRepCookie);
      const edit = await request(app)
        .patch(apiPaths.quotes.update(id))
        .set('Cookie', salesRepCookie)
        .send({ notes: 'tarde' });
      const remove = await request(app).delete(apiPaths.quotes.delete(id)).set('Cookie', salesRepCookie);
      const accepted = await request(app).post(apiPaths.quotes.accept(id)).set('Cookie', salesRepCookie);
      const rejectAfter = await request(app).post(apiPaths.quotes.reject(id)).set('Cookie', salesRepCookie);
      const reviseAfter = await request(app).post(apiPaths.quotes.revise(id)).set('Cookie', salesRepCookie);

      expect(sent.body).toMatchObject({ status: 'SENT' });
      expect(sent.body.sentAt).toBeDefined();
      expect(edit.status).toBe(HTTP_CONFLICT);
      expect(edit.body.error.code).toBe(ErrorCode.QUOTE_NOT_EDITABLE);
      expect(remove.status).toBe(HTTP_CONFLICT);
      expect(accepted.body).toMatchObject({ status: 'ACCEPTED' });
      expect(rejectAfter.body.error.code).toBe(ErrorCode.QUOTE_INVALID_TRANSITION);
      expect(reviseAfter.body.error.code).toBe(ErrorCode.QUOTE_INVALID_TRANSITION);
    });

    it('no se envía dos veces ni un borrador sin vigencia', async () => {
      const created = await createQuote(salesRepCookie, { contactId: salesRepContactId, items: [freeItem()] });
      await request(app).post(apiPaths.quotes.send(created.body.id)).set('Cookie', salesRepCookie);

      const again = await request(app).post(apiPaths.quotes.send(created.body.id)).set('Cookie', salesRepCookie);

      expect(again.status).toBe(HTTP_CONFLICT);
      expect(again.body.error.code).toBe(ErrorCode.QUOTE_INVALID_TRANSITION);
    });

    it('un borrador con la vigencia ya pasada no se envía (D-23)', async () => {
      const stale = await persistQuote(company.tenant.id, company.salesRep.id, { validUntil: isoDateAfter(-1) });

      const response = await request(app).post(apiPaths.quotes.send(stale.id)).set('Cookie', salesRepCookie);

      expect(response.status).toBe(HTTP_CONFLICT);
      expect(response.body.error.code).toBe(ErrorCode.QUOTE_EXPIRED);
    });

    it('rechazar y revisar crea la versión 2 en borrador con el mismo número; la 1 queda reemplazada', async () => {
      const created = await createQuote(salesRepCookie, { contactId: salesRepContactId, items: [freeItem()] });
      await request(app).post(apiPaths.quotes.send(created.body.id)).set('Cookie', salesRepCookie);
      await request(app).post(apiPaths.quotes.reject(created.body.id)).set('Cookie', salesRepCookie);

      const revised = await request(app).post(apiPaths.quotes.revise(created.body.id)).set('Cookie', salesRepCookie);
      const original = await request(app).get(apiPaths.quotes.get(created.body.id)).set('Cookie', salesRepCookie);
      const editNext = await request(app)
        .patch(apiPaths.quotes.update(revised.body.id))
        .set('Cookie', salesRepCookie)
        .send({ items: [freeItem({ quantity: 10 })] });
      const reviseAgain = await request(app)
        .post(apiPaths.quotes.revise(created.body.id))
        .set('Cookie', salesRepCookie);

      expect(revised.status).toBe(HTTP_CREATED);
      expect(revised.body).toMatchObject({
        number: 1,
        version: 2,
        reference: 'COT-000001 v2',
        status: 'DRAFT',
        previousVersionId: created.body.id,
        total: '238000.00',
      });
      expect(original.body.status).toBe('SUPERSEDED');
      expect(editNext.status).toBe(HTTP_OK);
      expect(reviseAgain.status).toBe(HTTP_CONFLICT);
    });

    it('revisar dos veces a la vez crea una sola versión', async () => {
      const sent = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT' });

      const responses = await Promise.all([
        request(app).post(apiPaths.quotes.revise(sent.id)).set('Cookie', salesRepCookie),
        request(app).post(apiPaths.quotes.revise(sent.id)).set('Cookie', salesRepCookie),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([HTTP_CREATED, HTTP_CONFLICT]);
      await expect(prisma.quote.count({ where: { number: sent.number } })).resolves.toBe(QUOTE_VERSIONS_AFTER_REVISION);
    });

    it('aceptar y rechazar a la vez: una gana y la otra es 409', async () => {
      const sent = await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT' });

      const responses = await Promise.all([
        request(app).post(apiPaths.quotes.accept(sent.id)).set('Cookie', salesRepCookie),
        request(app).post(apiPaths.quotes.reject(sent.id)).set('Cookie', salesRepCookie),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([HTTP_OK, HTTP_CONFLICT]);
      const stored = await prisma.quote.findUniqueOrThrow({ where: { id: sent.id } });
      expect(['ACCEPTED', 'REJECTED']).toContain(stored.status);
    });

    it('cada paso del ciclo queda auditado', async () => {
      const created = await createQuote(salesRepCookie, { contactId: salesRepContactId, items: [freeItem()] });
      await request(app).post(apiPaths.quotes.send(created.body.id)).set('Cookie', salesRepCookie);
      await request(app).post(apiPaths.quotes.accept(created.body.id)).set('Cookie', salesRepCookie);

      const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((entry) => entry.action);

      expect(actions).toEqual(['QUOTE_CREATED', 'QUOTE_SENT', 'QUOTE_ACCEPTED']);
    });
  });
});
