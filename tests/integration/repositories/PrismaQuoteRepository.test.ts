import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { Quote, QuoteItem, QuoteStatus } from '@/domain/entities/Quote.js';
import { Money, Percentage } from '@/domain/value-objects/money.js';
import { quoteFilterConfig } from '@/infrastructure/persistence/filters/quoteFilterConfig.js';
import { PrismaTransactionManager } from '@/infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaQuoteRepository } from '@/infrastructure/persistence/repositories/PrismaQuoteRepository.js';
import {
  type TenantWithTeam,
  persistContact,
  persistProduct,
  persistQuote,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

// F3-T05: cotizaciones contra PostgreSQL real: secuencia sin huecos, importes exactos y cambios de estado atómicos.

// Más cifras de las que number guarda sin error: el precio no pasa por number (F3-T01).
const PRECISE_PRICE = '98765432109876.54';
const NOW = new Date('2026-11-17T15:00:00.000Z');
const rate = (text: string) => Percentage.fromDecimalString(text);
const FIRST = 1;
const SECOND = 2;
const THIRD = 3;
const MONEY_DECIMAL_PLACES = 2;

function repositoryFor(tenantId: string): PrismaQuoteRepository {
  return new PrismaQuoteRepository(prisma, new FixedTenantContext(tenantId));
}

describe('PrismaQuoteRepository', () => {
  let company: TenantWithTeam;
  let otherCompany: TenantWithTeam;
  let repository: PrismaQuoteRepository;
  let transactionManager: PrismaTransactionManager;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    repository = repositoryFor(company.tenant.id);
    transactionManager = new PrismaTransactionManager(prisma);
  });

  async function buildDraft(overrides: { number?: number; unitPrice?: string; productId?: string } = {}) {
    const contact = await persistContact(company.tenant.id, { ownerId: company.salesRep.id });
    return Quote.createDraft({
      id: randomUUID(),
      tenantId: company.tenant.id,
      number: overrides.number ?? (await transactionManager.runInTransaction(() => repository.nextNumber())),
      createdById: company.salesRep.id,
      now: NOW,
      content: {
        customer: { contactId: contact.id },
        validUntil: '2026-12-17',
        discountRate: rate('5'),
        notes: 'Entrega en obra',
        items: [
          new QuoteItem(1, {
            productId: overrides.productId,
            description: 'Fachada flotante',
            quantity: THIRD,
            variables: { ancho: '1.20' },
            calculatedUnitPrice: Money.fromDecimalString('1000'),
            unitPrice: Money.fromDecimalString(overrides.unitPrice ?? PRECISE_PRICE),
            priceOverrideReason: 'Cliente frecuente',
            discountRate: rate('2.5'),
            taxRate: rate('19'),
          }),
          new QuoteItem(SECOND, {
            description: 'Instalación',
            quantity: 1,
            unitPrice: Money.fromDecimalString('250000'),
            discountRate: rate('0'),
            taxRate: rate('5'),
          }),
        ],
      },
    });
  }

  describe('numeración consecutiva por empresa', () => {
    it('empieza en 1 y sigue de uno en uno, por empresa', async () => {
      const otherRepository = repositoryFor(otherCompany.tenant.id);

      const numbers = [
        await transactionManager.runInTransaction(() => repository.nextNumber()),
        await transactionManager.runInTransaction(() => repository.nextNumber()),
        await transactionManager.runInTransaction(() => otherRepository.nextNumber()),
        await transactionManager.runInTransaction(() => repository.nextNumber()),
      ];

      expect(numbers).toEqual([FIRST, SECOND, FIRST, THIRD]);
    });

    it('una transacción revertida no deja hueco', async () => {
      await transactionManager.runInTransaction(() => repository.nextNumber());

      await expect(
        transactionManager.runInTransaction(async () => {
          await repository.nextNumber();
          throw new Error('fallo después de tomar el número');
        }),
      ).rejects.toThrow('fallo después');

      await expect(transactionManager.runInTransaction(() => repository.nextNumber())).resolves.toBe(SECOND);
    });

    it('veinte altas simultáneas obtienen números distintos y sin huecos', async () => {
      const numbers = await Promise.all(
        Array.from({ length: 20 }, () => transactionManager.runInTransaction(() => repository.nextNumber())),
      );

      expect([...numbers].sort((first, second) => first - second)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
    });

    it('sigue la secuencia que dejaron las cotizaciones ya guardadas', async () => {
      await persistQuote(company.tenant.id, company.salesRep.id);
      await persistQuote(company.tenant.id, company.salesRep.id);

      await expect(transactionManager.runInTransaction(() => repository.nextNumber())).resolves.toBe(THIRD);
    });
  });

  describe('guardar y leer', () => {
    it('guarda y lee una cotización con importes, porcentajes y variables exactos', async () => {
      const draft = await buildDraft();

      await repository.create(draft);
      const stored = await repository.findById(draft.id);

      expect(stored).toMatchObject({
        id: draft.id,
        tenantId: company.tenant.id,
        number: 1,
        version: 1,
        status: QuoteStatus.DRAFT,
        validUntil: '2026-12-17',
        notes: 'Entrega en obra',
        createdById: company.salesRep.id,
      });
      expect(stored?.discountRate.toDecimalString()).toBe('5.00');
      expect(stored?.items.map((item) => item.position)).toEqual([FIRST, SECOND]);
      expect(stored?.items[0]).toMatchObject({
        description: 'Fachada flotante',
        quantity: THIRD,
        variables: { ancho: '1.20' },
        priceOverrideReason: 'Cliente frecuente',
      });
      expect(stored?.items[0].unitPrice.toDecimalString()).toBe(PRECISE_PRICE);
      expect(stored?.items[0].calculatedUnitPrice?.toDecimalString()).toBe('1000.00');
      expect(stored?.items[0].discountRate.toDecimalString()).toBe('2.50');
      expect(stored?.items[1].taxRate.toDecimalString()).toBe('5.00');
      expect(stored?.totals().total.toDecimalString()).toBe(draft.totals().total.toDecimalString());
    });

    it('los totales guardados en la fila coinciden con los del dominio', async () => {
      const draft = await buildDraft();

      await repository.create(draft);
      const row = await prisma.quote.findUniqueOrThrow({ where: { id: draft.id } });

      const totals = draft.totals();
      expect(row.subtotal.toFixed(MONEY_DECIMAL_PLACES)).toBe(totals.subtotal.toDecimalString());
      expect(row.discountTotal.toFixed(MONEY_DECIMAL_PLACES)).toBe(totals.discountTotal.toDecimalString());
      expect(row.taxTotal.toFixed(MONEY_DECIMAL_PLACES)).toBe(totals.taxTotal.toDecimalString());
      expect(row.total.toFixed(MONEY_DECIMAL_PLACES)).toBe(totals.total.toDecimalString());
    });

    it('guarda la referencia al producto del ítem', async () => {
      const product = await persistProduct(company.tenant.id);
      const draft = await buildDraft({ productId: product.id });

      await repository.create(draft);

      await expect(repository.findById(draft.id)).resolves.toMatchObject({
        items: [expect.objectContaining({ productId: product.id }), expect.anything()],
      });
    });

    it('no ve cotizaciones de otra empresa ni borradas', async () => {
      const draft = await buildDraft();
      await repository.create(draft);

      await expect(repositoryFor(otherCompany.tenant.id).findById(draft.id)).resolves.toBeNull();
      await repository.deleteDraft(draft.id);
      await expect(repository.findById(draft.id)).resolves.toBeNull();
      await expect(prisma.quote.findUnique({ where: { id: draft.id } })).resolves.toMatchObject({
        deleted: 'DELETED',
      });
    });

    it('un número y versión repetidos en la misma empresa violan la unicidad', async () => {
      await repository.create(await buildDraft({ number: 5 }));

      await expect(repository.create(await buildDraft({ number: 5 }))).rejects.toThrow();
    });

    it('no pierde ni cambia cotizaciones al repetir lecturas dentro de una transacción', async () => {
      const draft = await buildDraft();

      const inTransaction = await transactionManager.runInTransaction(async () => {
        await repository.create(draft);
        return repository.findById(draft.id);
      });

      expect(inTransaction?.items).toHaveLength(SECOND);
    });
  });

  describe('saveContent', () => {
    it('reemplaza los datos y todos los ítems de un borrador', async () => {
      const draft = await buildDraft();
      await repository.create(draft);
      const replacement = draft.withContent(
        {
          customer: draft.customer,
          validUntil: '2027-01-31',
          discountRate: rate('0'),
          notes: undefined,
          items: [
            new QuoteItem(1, {
              description: 'Un solo ítem',
              quantity: 1,
              unitPrice: Money.fromDecimalString('100'),
              discountRate: rate('0'),
              taxRate: rate('0'),
            }),
          ],
        },
        new Date('2026-11-18T10:00:00.000Z'),
      );

      await repository.saveContent(replacement);
      const stored = await repository.findById(draft.id);

      expect(stored).toMatchObject({ validUntil: '2027-01-31', notes: undefined });
      expect(stored?.items.map((item) => item.description)).toEqual(['Un solo ítem']);
      await expect(prisma.quoteItem.count({ where: { quoteId: draft.id } })).resolves.toBe(1);
    });

    it('no pisa una cotización que ya dejó de ser borrador', async () => {
      const draft = await buildDraft();
      await repository.create(draft);
      await repository.saveState(draft.markSent(NOW, '2026-11-17'), QuoteStatus.DRAFT);

      await expect(repository.saveContent(draft)).rejects.toMatchObject({ code: 'QUOTE_NOT_EDITABLE' });
      await expect(repository.findById(draft.id)).resolves.toMatchObject({ status: QuoteStatus.SENT });
    });
  });

  describe('saveState (comparar y cambiar)', () => {
    it('cambia el estado y sus fechas si sigue en el estado esperado', async () => {
      const draft = await buildDraft();
      await repository.create(draft);

      const saved = await repository.saveState(draft.markSent(NOW, '2026-11-17'), QuoteStatus.DRAFT);

      expect(saved).toBe(true);
      const stored = await repository.findById(draft.id);
      expect(stored).toMatchObject({ status: QuoteStatus.SENT, sentAt: NOW });
    });

    it('devuelve false si otra petición ya cambió el estado', async () => {
      const draft = await buildDraft();
      await repository.create(draft);
      const sent = draft.markSent(NOW, '2026-11-17');
      await repository.saveState(sent, QuoteStatus.DRAFT);

      await expect(repository.saveState(sent, QuoteStatus.DRAFT)).resolves.toBe(false);
    });

    it('aceptar y rechazar a la vez: solo una gana', async () => {
      const draft = await buildDraft();
      await repository.create(draft);
      const sent = draft.markSent(NOW, '2026-11-17');
      await repository.saveState(sent, QuoteStatus.DRAFT);

      const results = await Promise.all([
        repository.saveState(sent.accept(NOW, '2026-11-17'), QuoteStatus.SENT),
        repository.saveState(sent.reject(NOW), QuoteStatus.SENT),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('no toca cotizaciones de otra empresa', async () => {
      const draft = await buildDraft();
      await repository.create(draft);

      await expect(
        repositoryFor(otherCompany.tenant.id).saveState(draft.markSent(NOW, '2026-11-17'), QuoteStatus.DRAFT),
      ).resolves.toBe(false);
      await expect(repository.findById(draft.id)).resolves.toMatchObject({ status: QuoteStatus.DRAFT });
    });
  });

  describe('deleteDraft (comparar y cambiar, F3-A04)', () => {
    it('borra (suave) un borrador', async () => {
      const draft = await buildDraft();
      await repository.create(draft);

      await expect(repository.deleteDraft(draft.id)).resolves.toBe(true);

      await expect(repository.findById(draft.id)).resolves.toBeNull();
    });

    it('no borra una cotización que ya se envió', async () => {
      const draft = await buildDraft();
      await repository.create(draft);
      await repository.saveState(draft.markSent(NOW, '2026-11-17'), QuoteStatus.DRAFT);

      await expect(repository.deleteDraft(draft.id)).resolves.toBe(false);

      await expect(repository.findById(draft.id)).resolves.toMatchObject({ status: QuoteStatus.SENT });
    });

    it('borrar y enviar a la vez: solo una de las dos gana', async () => {
      const draft = await buildDraft();
      await repository.create(draft);

      const [deleted, sent] = await Promise.all([
        repository.deleteDraft(draft.id),
        repository.saveState(draft.markSent(NOW, '2026-11-17'), QuoteStatus.DRAFT),
      ]);

      expect(deleted).not.toBe(sent);
    });

    it('no toca una cotización de otra empresa', async () => {
      const draft = await buildDraft();
      await repository.create(draft);

      await expect(repositoryFor(otherCompany.tenant.id).deleteDraft(draft.id)).resolves.toBe(false);
      await expect(repository.findById(draft.id)).resolves.not.toBeNull();
    });
  });

  describe('versiones (D-22)', () => {
    it('la versión siguiente conserva el número y enlaza con la anterior', async () => {
      const draft = await buildDraft();
      await repository.create(draft);
      const sent = draft.markSent(NOW, '2026-11-17');
      await repository.saveState(sent, QuoteStatus.DRAFT);

      const { superseded, nextVersion } = sent.revise(randomUUID(), NOW);
      await transactionManager.runInTransaction(async () => {
        await repository.saveState(superseded, QuoteStatus.SENT);
        await repository.create(nextVersion);
      });

      await expect(repository.findById(draft.id)).resolves.toMatchObject({ status: QuoteStatus.SUPERSEDED });
      await expect(repository.findById(nextVersion.id)).resolves.toMatchObject({
        number: draft.number,
        version: 2,
        status: QuoteStatus.DRAFT,
        previousVersionId: draft.id,
      });
    });

    it('una cotización solo tiene una versión siguiente', async () => {
      const draft = await buildDraft();
      await repository.create(draft);
      const sent = draft.markSent(NOW, '2026-11-17');

      await repository.create(sent.revise(randomUUID(), NOW).nextVersion);

      await expect(repository.create(sent.revise(randomUUID(), NOW).nextVersion)).rejects.toThrow();
    });
  });

  describe('listado filtrado', () => {
    it('filtra por estado y por autor, solo de la empresa', async () => {
      await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT' });
      await persistQuote(company.tenant.id, company.otherSalesRep.id, { status: 'DRAFT' });
      await persistQuote(otherCompany.tenant.id, otherCompany.salesRep.id, { status: 'SENT' });

      const sent = await repository.findFiltered(
        { filters: [{ field: 'status', operator: 'equals', value: 'SENT' }] },
        quoteFilterConfig,
      );
      const byAuthor = await repository.findFiltered(
        { filters: [{ field: 'createdById', operator: 'equals', value: company.otherSalesRep.id }] },
        quoteFilterConfig,
      );
      const total = await repository.countFiltered({}, quoteFilterConfig);

      expect(sent.map((quote) => quote.status)).toEqual([QuoteStatus.SENT]);
      expect(byAuthor.map((quote) => quote.createdById)).toEqual([company.otherSalesRep.id]);
      expect(total).toBe(SECOND);
    });

    it('el listado no carga los ítems y trae los totales guardados (F3-A07)', async () => {
      await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT' });

      const [listed] = await repository.findFiltered({}, quoteFilterConfig);
      const detail = await repository.findById(listed.id);

      expect(listed.items).toEqual([]);
      expect(listed.snapshotTotals().total.toDecimalString()).toBe('238000.00');
      expect(detail?.items).toHaveLength(1);
    });

    it('un estado que no existe es un filtro inválido, no un error interno', async () => {
      const criteria = { filters: [{ field: 'status', operator: 'equals', value: 'INVENTADO' }] };

      await expect(repository.findFiltered(criteria, quoteFilterConfig)).rejects.toMatchObject({
        code: 'INVALID_FILTER_VALUE',
      });
      await expect(repository.countFiltered(criteria, quoteFilterConfig)).rejects.toMatchObject({
        code: 'INVALID_FILTER_VALUE',
      });
    });

    it('filtra por varios estados con in, ordena por número y pagina', async () => {
      for (const status of ['DRAFT', 'SENT', 'ACCEPTED'] as const) {
        await persistQuote(company.tenant.id, company.salesRep.id, { status });
      }

      const page = await repository.findFiltered(
        {
          filters: [{ field: 'status', operator: 'in', value: ['SENT', 'ACCEPTED'] }],
          sortBy: 'number',
          sortDir: 'asc',
          limit: 1,
          page: 2,
        },
        quoteFilterConfig,
      );

      expect(page.map((quote) => quote.number)).toEqual([THIRD]);
    });

    it('filtra el total con importes en texto, con la exactitud de los centavos (R8)', async () => {
      await persistQuote(company.tenant.id, company.salesRep.id);

      const find = async (operator: string, value: string) =>
        (await repository.findFiltered({ filters: [{ field: 'total', operator, value }] }, quoteFilterConfig)).length;

      // El total guardado es 238000.00.
      expect(await find('gte', '238000.00')).toBe(1);
      expect(await find('gt', '238000.00')).toBe(0);
      expect(await find('gt', '237999.99')).toBe(1);
      expect(await find('lt', '238000.01')).toBe(1);
      expect(await find('lte', '237999.99')).toBe(0);
    });

    it('filtra por vigencia', async () => {
      await persistQuote(company.tenant.id, company.salesRep.id, { validUntil: '2026-01-31' });
      await persistQuote(company.tenant.id, company.salesRep.id, { validUntil: '2027-01-31' });

      const expiredBefore = await repository.findFiltered(
        { filters: [{ field: 'validUntil', operator: 'lt', value: new Date('2026-06-01') }] },
        quoteFilterConfig,
      );

      expect(expiredBefore.map((quote) => quote.validUntil)).toEqual(['2026-01-31']);
    });
  });
});
