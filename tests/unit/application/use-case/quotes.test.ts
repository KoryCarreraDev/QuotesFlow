import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateQuoteInput, QuoteItemInput } from '@/application/dtos/QuoteDTOs.js';
import { ITenantProfileRepository, TenantProfile } from '@/application/ports/repositories/ITenantProfileRepository.js';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import { QuoteContentResolver } from '@/application/use-case/quotes/QuoteContentResolver.js';
import {
  AcceptQuoteUseCase,
  CreateQuoteUseCase,
  DeleteQuoteUseCase,
  GetQuoteUseCase,
  ListQuotesUseCase,
  RejectQuoteUseCase,
  ReviseQuoteUseCase,
  SendQuoteUseCase,
  UpdateQuoteUseCase,
} from '@/application/use-case/quotes/QuoteUseCases.js';
import { Formula } from '@/domain/entities/Formula.js';
import { Product } from '@/domain/entities/Product.js';
import { Quote, QuoteItem, QuoteStatus } from '@/domain/entities/Quote.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { Money, Percentage } from '@/domain/value-objects/money.js';
import { MathjsFormulaEvaluator } from '@/infrastructure/services/MathjsFormulaEvaluator.js';
import { quoteFilterConfig } from '@/infrastructure/persistence/filters/quoteFilterConfig.js';
import { DEFAULT_TEST_TENANT_ID, buildContact } from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryCompanyContactRepository } from '@tests/support/doubles/InMemoryCompanyContactRepository.js';
import { InMemoryContactRepository } from '@tests/support/doubles/InMemoryContactRepository.js';
import { InMemoryFormulaRepository } from '@tests/support/doubles/InMemoryFormulaRepository.js';
import { InMemoryLeadRepository } from '@tests/support/doubles/InMemoryLeadRepository.js';
import { InMemoryProductRepository } from '@tests/support/doubles/InMemoryProductRepository.js';
import { InMemoryQuoteRepository } from '@tests/support/doubles/InMemoryQuoteRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

// F3-T05: casos de uso de cotizaciones. Los efectos contra PostgreSQL (secuencia, carreras) están en integration/.

// 10:00 en Bogotá (UTC-5): hoy es 2026-11-17 allí.
const NOW = new Date('2026-11-17T15:00:00.000Z');
const TODAY = '2026-11-17';
const YESTERDAY = '2026-11-16';
const NEXT_WEEK = '2026-11-24';
const OTHER_TENANT_ID = 'other-tenant-id';
const CREATED_QUOTES = 2;

const owner = { role: Role.OWNER, userId: 'owner-id' };
const salesLeader = { role: Role.SALES_LEADER, userId: 'leader-id' };
const salesRep = { role: Role.SALES_REP, userId: 'rep-id' };
const otherSalesRep = { role: Role.SALES_REP, userId: 'other-rep-id' };

class StubTenantProfileRepository implements ITenantProfileRepository {
  profile: TenantProfile = {
    id: DEFAULT_TEST_TENANT_ID,
    name: 'Aluminios Andinos SAS',
    timezone: 'America/Bogota',
    emailDeliveryEnabled: false,
    defaultTaxRate: '19.00',
    maximumDiscountRateSalesRep: '10.00',
    maximumDiscountRateSalesLeader: '20.00',
  };

  async findCurrent(): Promise<TenantProfile | null> {
    return this.profile;
  }

  async updateCurrent(): Promise<void> {}
}

function setup() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const quotes = new InMemoryQuoteRepository(tenantContext);
  const products = new InMemoryProductRepository(tenantContext);
  const formulas = new InMemoryFormulaRepository(tenantContext);
  const contacts = new InMemoryContactRepository(tenantContext);
  const profiles = new StubTenantProfileRepository();
  const auditLogger = new RecordingAuditLogger();
  const transactionManager = new RecordingTransactionManager();
  const resolver = new QuoteContentResolver(
    products,
    formulas,
    new MathjsFormulaEvaluator(),
    new InMemoryLeadRepository(tenantContext),
    contacts,
    new InMemoryCompanyContactRepository(tenantContext),
  );
  return {
    quotes,
    products,
    formulas,
    contacts,
    profiles,
    auditLogger,
    transactionManager,
    list: new ListQuotesUseCase(quotes, profiles, quoteFilterConfig),
    get: new GetQuoteUseCase(quotes, profiles),
    create: new CreateQuoteUseCase(quotes, resolver, profiles, tenantContext, transactionManager, auditLogger),
    update: new UpdateQuoteUseCase(quotes, resolver, profiles, transactionManager, auditLogger),
    remove: new DeleteQuoteUseCase(quotes, transactionManager, auditLogger),
    send: new SendQuoteUseCase(quotes, profiles, transactionManager, auditLogger),
    accept: new AcceptQuoteUseCase(quotes, profiles, transactionManager, auditLogger),
    reject: new RejectQuoteUseCase(quotes, profiles, transactionManager, auditLogger),
    revise: new ReviseQuoteUseCase(quotes, profiles, transactionManager, auditLogger),
  };
}

type Setup = ReturnType<typeof setup>;

/** Contacto de la empresa a cargo de `ownerId`. */
function seedContact(context: Setup, ownerId: string): string {
  const contact = buildContact({ ownerId });
  context.contacts.seed(contact);
  return contact.id;
}

function seedFixedPriceProduct(context: Setup, basePrice = '450000', isActive = true): string {
  const product = Product.restore({
    id: randomUUID(),
    tenantId: DEFAULT_TEST_TENANT_ID,
    name: 'Ventana corrediza',
    basePrice: Money.fromDecimalString(basePrice),
    isActive,
  });
  context.products.seed(product);
  return product.id;
}

function seedFormulaProduct(context: Setup): string {
  const formula = Formula.restore({
    id: randomUUID(),
    tenantId: DEFAULT_TEST_TENANT_ID,
    createdById: owner.userId,
    name: 'Por ancho',
    expression: 'ancho * 100000',
    variables: [{ name: 'ancho', label: 'Ancho (m)' }],
  });
  context.formulas.seed(formula);
  const product = Product.restore({
    id: randomUUID(),
    tenantId: DEFAULT_TEST_TENANT_ID,
    name: 'Vidrio a medida',
    formulaId: formula.id,
    isActive: true,
  });
  context.products.seed(product);
  return product.id;
}

const freeItem = (overrides: Partial<QuoteItemInput> = {}): QuoteItemInput => ({
  description: 'Instalación',
  quantity: 1,
  unitPrice: '100000',
  ...overrides,
});

function quoteInput(contactId: string, overrides: Partial<CreateQuoteInput> = {}): CreateQuoteInput {
  return { contactId, items: [freeItem()], ...overrides };
}

/** Una cotización ya guardada, en el estado indicado. */
function seedQuote(
  context: Setup,
  status: QuoteStatus,
  overrides: { createdById?: string; validUntil?: string; tenantId?: string; number?: number; version?: number } = {},
): Quote {
  const quote = Quote.restore({
    id: randomUUID(),
    tenantId: overrides.tenantId ?? DEFAULT_TEST_TENANT_ID,
    number: overrides.number ?? 1,
    version: overrides.version ?? 1,
    status,
    customer: { contactId: 'contact-id' },
    validUntil: overrides.validUntil ?? NEXT_WEEK,
    discountRate: Percentage.fromDecimalString('0'),
    items: [
      new QuoteItem(1, {
        description: 'Ventana',
        quantity: 2,
        unitPrice: Money.fromDecimalString('100000'),
        discountRate: Percentage.fromDecimalString('0'),
        taxRate: Percentage.fromDecimalString('19'),
      }),
    ],
    createdById: overrides.createdById ?? salesRep.userId,
    sentAt: status === QuoteStatus.DRAFT ? undefined : NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  context.quotes.seed(quote);
  return quote;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Crear una cotización', () => {
  it('numera de forma consecutiva, calcula los importes y audita dentro de la transacción', async () => {
    const context = setup();
    const contactId = seedContact(context, salesRep.userId);

    const first = await context.create.execute(salesRep, quoteInput(contactId, { items: [freeItem({ quantity: 2 })] }));
    const second = await context.create.execute(salesRep, quoteInput(contactId));

    expect(first).toMatchObject({
      number: 1,
      reference: 'COT-000001',
      version: 1,
      status: 'DRAFT',
      displayStatus: 'DRAFT',
      subtotal: '200000.00',
      taxTotal: '38000.00',
      total: '238000.00',
      createdById: salesRep.userId,
    });
    expect(second.reference).toBe('COT-000002');
    expect(context.auditLogger.entries.map((entry) => entry.action)).toEqual([
      AuditAction.QUOTE_CREATED,
      AuditAction.QUOTE_CREATED,
    ]);
    expect(context.transactionManager.completedTransactionCount).toBe(CREATED_QUOTES);
  });

  it('la vigencia por defecto es de 30 días en la zona horaria de la empresa', async () => {
    const context = setup();
    const contactId = seedContact(context, salesRep.userId);

    // 2026-11-17 22:00 en Bogotá ya es el 18 en UTC: la vigencia cuenta desde el día de la empresa.
    vi.setSystemTime(new Date('2026-11-18T03:00:00.000Z'));
    const quote = await context.create.execute(salesRep, quoteInput(contactId));

    expect(quote.validUntil).toBe('2026-12-17');
  });

  it('rechaza una vigencia en el pasado', async () => {
    const context = setup();
    const contactId = seedContact(context, salesRep.userId);

    await expect(
      context.create.execute(salesRep, quoteInput(contactId, { validUntil: YESTERDAY })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_VALIDITY_DATE });
  });

  it('exige un cliente: lead, contacto o empresa', async () => {
    const context = setup();

    await expect(context.create.execute(owner, { items: [freeItem()] })).rejects.toMatchObject({
      code: ErrorCode.QUOTE_CUSTOMER_REQUIRED,
    });
    expect(context.quotes.allStored()).toHaveLength(0);
  });

  it('un comercial no cotiza a un cliente ajeno, y el error no revela si existe', async () => {
    const context = setup();
    const othersContact = seedContact(context, otherSalesRep.userId);

    await expect(context.create.execute(salesRep, quoteInput(othersContact))).rejects.toMatchObject({
      code: ErrorCode.INVALID_QUOTE_CUSTOMER,
    });
    await expect(context.create.execute(salesRep, quoteInput(randomUUID()))).rejects.toMatchObject({
      code: ErrorCode.INVALID_QUOTE_CUSTOMER,
    });
  });

  it('gestión cotiza a cualquier cliente de la empresa', async () => {
    const context = setup();

    const quote = await context.create.execute(salesLeader, quoteInput(seedContact(context, salesRep.userId)));

    expect(quote.createdById).toBe(salesLeader.userId);
  });

  it('la cotización queda a nombre de quien la crea', async () => {
    const context = setup();
    await context.create.execute(salesRep, quoteInput(seedContact(context, salesRep.userId)));

    expect(context.quotes.allStored()[0]).toMatchObject({
      createdById: salesRep.userId,
      tenantId: DEFAULT_TEST_TENANT_ID,
    });
  });
});

describe('Precio de los ítems', () => {
  it('con producto de precio fijo, el servidor pone el precio y la descripción', async () => {
    const context = setup();
    const productId = seedFixedPriceProduct(context, '450000');

    const quote = await context.create.execute(
      salesRep,
      quoteInput(seedContact(context, salesRep.userId), { items: [{ productId, quantity: 2 }] }),
    );

    expect(quote.items[0]).toMatchObject({
      description: 'Ventana corrediza',
      calculatedUnitPrice: '450000.00',
      unitPrice: '450000.00',
      isPriceOverridden: false,
      taxRate: '19.00',
    });
    expect(quote.total).toBe('1071000.00');
  });

  it('con producto de fórmula, calcula con las variables y guarda solo las que la fórmula declara', async () => {
    const context = setup();
    const productId = seedFormulaProduct(context);

    const quote = await context.create.execute(
      salesRep,
      quoteInput(seedContact(context, salesRep.userId), {
        items: [{ productId, quantity: 1, variables: { ancho: '1.20', intruso: '99' } }],
      }),
    );

    expect(quote.items[0]).toMatchObject({
      calculatedUnitPrice: '120000.00',
      unitPrice: '120000.00',
      variables: { ancho: '1.20' },
    });
  });

  it('una variable de la fórmula sin valor es un error de validación', async () => {
    const context = setup();
    const productId = seedFormulaProduct(context);

    await expect(
      context.create.execute(
        salesRep,
        quoteInput(seedContact(context, salesRep.userId), { items: [{ productId, quantity: 1 }] }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_FORMULA_VARIABLE });
  });

  it('un producto inactivo, inexistente o de otra empresa no se cotiza', async () => {
    const context = setup();
    const contactId = seedContact(context, salesRep.userId);
    const inactiveId = seedFixedPriceProduct(context, '1000', false);
    const foreign = Product.restore({
      id: randomUUID(),
      tenantId: OTHER_TENANT_ID,
      name: 'Ajeno',
      basePrice: Money.fromDecimalString('1'),
      isActive: true,
    });
    context.products.seed(foreign);

    for (const productId of [inactiveId, foreign.id, randomUUID()]) {
      await expect(
        context.create.execute(salesRep, quoteInput(contactId, { items: [{ productId, quantity: 1 }] })),
      ).rejects.toMatchObject({ code: ErrorCode.PRODUCT_NOT_AVAILABLE });
    }
  });

  it('cambiar el precio calculado exige motivo; con motivo queda marcado y auditado (D-24)', async () => {
    const context = setup();
    const contactId = seedContact(context, salesRep.userId);
    const productId = seedFixedPriceProduct(context, '450000');

    await expect(
      context.create.execute(
        salesRep,
        quoteInput(contactId, { items: [{ productId, quantity: 1, unitPrice: '400000' }] }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.PRICE_OVERRIDE_REASON_REQUIRED });

    const quote = await context.create.execute(
      salesRep,
      quoteInput(contactId, {
        items: [{ productId, quantity: 1, unitPrice: '400000', priceOverrideReason: 'Cliente frecuente' }],
      }),
    );

    expect(quote.items[0]).toMatchObject({
      calculatedUnitPrice: '450000.00',
      unitPrice: '400000.00',
      isPriceOverridden: true,
      priceOverrideReason: 'Cliente frecuente',
    });
    const overrideEntry = context.auditLogger.entries.find(
      (entry) => entry.action === AuditAction.QUOTE_PRICE_OVERRIDDEN,
    );
    expect(overrideEntry?.metadata).toEqual({ itemPositions: [1] });
    expect(JSON.stringify(context.auditLogger.entries)).not.toContain('Cliente frecuente');
  });

  it('enviar el mismo precio calculado como precio no cuenta como cambio', async () => {
    const context = setup();
    const productId = seedFixedPriceProduct(context, '450000');

    const quote = await context.create.execute(
      salesRep,
      quoteInput(seedContact(context, salesRep.userId), { items: [{ productId, quantity: 1, unitPrice: '450000' }] }),
    );

    expect(quote.items[0].isPriceOverridden).toBe(false);
    expect(context.auditLogger.entries.map((entry) => entry.action)).not.toContain(AuditAction.QUOTE_PRICE_OVERRIDDEN);
  });

  it('un ítem sin producto necesita descripción y precio', async () => {
    const context = setup();
    const contactId = seedContact(context, salesRep.userId);

    await expect(
      context.create.execute(salesRep, quoteInput(contactId, { items: [{ description: 'Sin precio', quantity: 1 }] })),
    ).rejects.toMatchObject({ code: ErrorCode.ITEM_PRICE_REQUIRED });
    await expect(
      context.create.execute(salesRep, quoteInput(contactId, { items: [{ unitPrice: '1000', quantity: 1 }] })),
    ).rejects.toMatchObject({ code: ErrorCode.MISSING_REQUIRED_DATA });
  });
});

describe('IVA (Q-020)', () => {
  it('usa el IVA por defecto de la empresa, y el del ítem si lo trae', async () => {
    const context = setup();
    const contactId = seedContact(context, salesRep.userId);

    const quote = await context.create.execute(
      salesRep,
      quoteInput(contactId, { items: [freeItem(), freeItem({ taxRate: '5' })] }),
    );

    expect(quote.items.map((item) => item.taxRate)).toEqual(['19.00', '5.00']);
    expect(quote.taxTotal).toBe('24000.00');
  });

  it('sin IVA por defecto, el IVA se pide al cotizar', async () => {
    const context = setup();
    context.profiles.profile = { ...context.profiles.profile, defaultTaxRate: undefined };
    const contactId = seedContact(context, salesRep.userId);

    await expect(context.create.execute(salesRep, quoteInput(contactId))).rejects.toMatchObject({
      code: ErrorCode.TAX_RATE_REQUIRED,
    });
    await expect(
      context.create.execute(salesRep, quoteInput(contactId, { items: [freeItem({ taxRate: '0' })] })),
    ).resolves.toMatchObject({ taxTotal: '0.00' });
  });
});

describe('Descuentos y topes por rol (D-25, Q-019)', () => {
  it('un comercial llega hasta el 10 %, sumando el descuento del ítem y el global', async () => {
    const context = setup();
    const contactId = seedContact(context, salesRep.userId);

    await expect(
      context.create.execute(salesRep, quoteInput(contactId, { items: [freeItem({ discountRate: '10' })] })),
    ).resolves.toBeDefined();
    await expect(
      context.create.execute(salesRep, quoteInput(contactId, { items: [freeItem({ discountRate: '10.01' })] })),
    ).rejects.toMatchObject({ code: ErrorCode.DISCOUNT_ABOVE_ROLE_LIMIT });
    // 6 % del ítem y 5 % global suman más del 10 %.
    await expect(
      context.create.execute(
        salesRep,
        quoteInput(contactId, { discountRate: '5', items: [freeItem({ discountRate: '6' })] }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.DISCOUNT_ABOVE_ROLE_LIMIT });
  });

  it('un líder llega hasta el 20 %; dueño y socio no tienen tope', async () => {
    const context = setup();
    const contactId = seedContact(context, salesRep.userId);

    await expect(
      context.create.execute(salesLeader, quoteInput(contactId, { discountRate: '20' })),
    ).resolves.toBeDefined();
    await expect(
      context.create.execute(salesLeader, quoteInput(contactId, { discountRate: '20.5' })),
    ).rejects.toMatchObject({ code: ErrorCode.DISCOUNT_ABOVE_ROLE_LIMIT });
    await expect(context.create.execute(owner, quoteInput(contactId, { discountRate: '100' }))).resolves.toMatchObject({
      total: '0.00',
    });
  });

  it('los topes salen de la configuración de la empresa', async () => {
    const context = setup();
    context.profiles.profile = { ...context.profiles.profile, maximumDiscountRateSalesRep: '0.00' };
    const contactId = seedContact(context, salesRep.userId);

    await expect(context.create.execute(salesRep, quoteInput(contactId, { discountRate: '1' }))).rejects.toMatchObject({
      code: ErrorCode.DISCOUNT_ABOVE_ROLE_LIMIT,
    });
  });

  it('el descuento global se aplica después del de cada ítem', async () => {
    const context = setup();

    const quote = await context.create.execute(
      owner,
      quoteInput(seedContact(context, salesRep.userId), {
        discountRate: '10',
        items: [freeItem({ unitPrice: '100000', discountRate: '10', taxRate: '0' })],
      }),
    );

    // 100 000 − 10 % = 90 000; − 10 % = 81 000.
    expect(quote).toMatchObject({ subtotal: '100000.00', discountTotal: '19000.00', total: '81000.00' });
  });
});

describe('Modificar un borrador', () => {
  it('reemplaza los ítems, recalcula y audita los campos cambiados', async () => {
    const context = setup();
    const contactId = seedContact(context, salesRep.userId);
    const created = await context.create.execute(salesRep, quoteInput(contactId));

    const updated = await context.update.execute(salesRep, created.id, {
      notes: 'Entrega en obra',
      items: [freeItem({ quantity: 3 })],
    });

    expect(updated).toMatchObject({ notes: 'Entrega en obra', subtotal: '300000.00' });
    expect(updated.id).toBe(created.id);
    const updateEntry = context.auditLogger.entries.find((entry) => entry.action === AuditAction.QUOTE_UPDATED);
    expect(updateEntry?.metadata).toEqual({ changedFields: ['items', 'notes'] });
  });

  it('un cambio de notas conserva los ítems y no repite el aviso de precio cambiado', async () => {
    const context = setup();
    const productId = seedFixedPriceProduct(context);
    const created = await context.create.execute(
      salesRep,
      quoteInput(seedContact(context, salesRep.userId), {
        items: [{ productId, quantity: 1, unitPrice: '1000', priceOverrideReason: 'Promoción' }],
      }),
    );
    context.auditLogger.entries.length = 0;

    const updated = await context.update.execute(salesRep, created.id, { notes: 'Solo notas' });

    expect(updated.items[0]).toMatchObject({ unitPrice: '1000.00', isPriceOverridden: true });
    expect(context.auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.QUOTE_UPDATED]);
  });

  it('quita las notas con null', async () => {
    const context = setup();
    const created = await context.create.execute(
      salesRep,
      quoteInput(seedContact(context, salesRep.userId), { notes: 'Antes' }),
    );

    const updated = await context.update.execute(salesRep, created.id, { notes: null });

    expect(updated.notes).toBeUndefined();
  });

  it('no deja una cotización sin cliente', async () => {
    const context = setup();
    const created = await context.create.execute(salesRep, quoteInput(seedContact(context, salesRep.userId)));

    await expect(context.update.execute(salesRep, created.id, { contactId: null })).rejects.toMatchObject({
      code: ErrorCode.QUOTE_CUSTOMER_REQUIRED,
    });
  });

  it('cambiar a un cliente ajeno se rechaza para el comercial', async () => {
    const context = setup();
    const created = await context.create.execute(salesRep, quoteInput(seedContact(context, salesRep.userId)));

    await expect(
      context.update.execute(salesRep, created.id, { contactId: seedContact(context, otherSalesRep.userId) }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_QUOTE_CUSTOMER });
  });

  it('subir el descuento global por encima del tope del rol se rechaza aunque no se toquen los ítems', async () => {
    const context = setup();
    const created = await context.create.execute(salesRep, quoteInput(seedContact(context, salesRep.userId)));

    await expect(context.update.execute(salesRep, created.id, { discountRate: '15' })).rejects.toMatchObject({
      code: ErrorCode.DISCOUNT_ABOVE_ROLE_LIMIT,
    });
  });

  it('una cotización enviada no se edita (D-22)', async () => {
    const context = setup();
    const sent = seedQuote(context, QuoteStatus.SENT);

    await expect(context.update.execute(salesRep, sent.id, { notes: 'x' })).rejects.toMatchObject({
      code: ErrorCode.QUOTE_NOT_EDITABLE,
    });
  });

  it('el comercial solo edita las suyas; gestión, todas', async () => {
    const context = setup();
    const others = seedQuote(context, QuoteStatus.DRAFT, { createdById: otherSalesRep.userId });

    await expect(context.update.execute(salesRep, others.id, { notes: 'x' })).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
    await expect(context.update.execute(salesLeader, others.id, { notes: 'x' })).resolves.toMatchObject({
      notes: 'x',
    });
  });
});

describe('Consultar', () => {
  it('una cotización de otra empresa o inexistente responde no encontrada', async () => {
    const context = setup();
    const foreign = seedQuote(context, QuoteStatus.DRAFT, { tenantId: OTHER_TENANT_ID });

    await expect(context.get.execute(owner, foreign.id)).rejects.toMatchObject({ code: ErrorCode.QUOTE_NOT_FOUND });
    await expect(context.get.execute(owner, randomUUID())).rejects.toMatchObject({
      code: ErrorCode.QUOTE_NOT_FOUND,
    });
  });

  it('un comercial no ve la cotización de otro comercial', async () => {
    const context = setup();
    const others = seedQuote(context, QuoteStatus.DRAFT, { createdById: otherSalesRep.userId });

    await expect(context.get.execute(salesRep, others.id)).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
    await expect(context.get.execute(salesLeader, others.id)).resolves.toMatchObject({ id: others.id });
  });

  it('una enviada con la vigencia pasada se muestra como vencida, sin cambiar su estado guardado (Q-016)', async () => {
    const context = setup();
    const expired = seedQuote(context, QuoteStatus.SENT, { validUntil: YESTERDAY });
    const lastDay = seedQuote(context, QuoteStatus.SENT, { validUntil: TODAY, number: 2 });

    await expect(context.get.execute(owner, expired.id)).resolves.toMatchObject({
      status: 'SENT',
      displayStatus: 'EXPIRED',
    });
    // El último día de vigencia todavía vale.
    await expect(context.get.execute(owner, lastDay.id)).resolves.toMatchObject({ displayStatus: 'SENT' });
  });

  it('el listado de un comercial se acota a lo que creó; el de gestión, no', async () => {
    const context = setup();
    const findFiltered = vi.spyOn(context.quotes, 'findFiltered');

    await context.list.execute(salesRep, { filters: [{ field: 'createdById', operator: 'equals', value: 'otro' }] });
    await context.list.execute(salesLeader, {});

    expect(findFiltered.mock.calls[0][0].filters).toEqual([
      { field: 'createdById', operator: 'equals', value: salesRep.userId },
    ]);
    expect(findFiltered.mock.calls[1][0].filters).toBeUndefined();
  });
});

describe('Enviar, aceptar, rechazar', () => {
  it('enviar un borrador lo deja SENT con su fecha de envío y lo audita', async () => {
    const context = setup();
    const draft = seedQuote(context, QuoteStatus.DRAFT);

    const sent = await context.send.execute(salesRep, draft.id);

    expect(sent).toMatchObject({ status: 'SENT' });
    expect(sent.sentAt).toEqual(NOW);
    expect(context.quotes.findStoredById(draft.id)?.status).toBe(QuoteStatus.SENT);
    expect(context.auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.QUOTE_SENT]);
  });

  it('no se envía dos veces ni con la vigencia pasada', async () => {
    const context = setup();
    const draft = seedQuote(context, QuoteStatus.DRAFT);
    const expiredDraft = seedQuote(context, QuoteStatus.DRAFT, { validUntil: YESTERDAY, number: 2 });
    await context.send.execute(salesRep, draft.id);

    await expect(context.send.execute(salesRep, draft.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_INVALID_TRANSITION,
    });
    await expect(context.send.execute(salesRep, expiredDraft.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_EXPIRED,
    });
  });

  it('el comercial solo envía las suyas', async () => {
    const context = setup();
    const others = seedQuote(context, QuoteStatus.DRAFT, { createdById: otherSalesRep.userId });

    await expect(context.send.execute(salesRep, others.id)).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
  });

  it('aceptar una enviada vigente es definitivo', async () => {
    const context = setup();
    const sent = seedQuote(context, QuoteStatus.SENT);

    const accepted = await context.accept.execute(salesRep, sent.id);

    expect(accepted).toMatchObject({ status: 'ACCEPTED' });
    expect(accepted.decidedAt).toEqual(NOW);
    await expect(context.reject.execute(salesRep, sent.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_INVALID_TRANSITION,
    });
    await expect(context.revise.execute(salesRep, sent.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_INVALID_TRANSITION,
    });
  });

  it('una vencida no se acepta, pero sí se rechaza (Q-016)', async () => {
    const context = setup();
    const expired = seedQuote(context, QuoteStatus.SENT, { validUntil: YESTERDAY });

    await expect(context.accept.execute(owner, expired.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_EXPIRED,
    });
    await expect(context.reject.execute(owner, expired.id)).resolves.toMatchObject({ status: 'REJECTED' });
  });

  it('un borrador no se acepta ni se rechaza', async () => {
    const context = setup();
    const draft = seedQuote(context, QuoteStatus.DRAFT);

    await expect(context.accept.execute(owner, draft.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_INVALID_TRANSITION,
    });
    await expect(context.reject.execute(owner, draft.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_INVALID_TRANSITION,
    });
  });

  it('si otra petición cambió el estado mientras tanto, es un conflicto y no se audita', async () => {
    const context = setup();
    const sent = seedQuote(context, QuoteStatus.SENT);
    context.quotes.failNextStateSave = true;

    await expect(context.accept.execute(owner, sent.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_INVALID_TRANSITION,
    });
    expect(context.auditLogger.entries).toEqual([]);
    expect(context.transactionManager.failedTransactionCount).toBe(1);
  });
});

describe('Revisar (D-22, Q-018)', () => {
  it('crea la versión 2 en borrador con el mismo número y deja la anterior reemplazada', async () => {
    const context = setup();
    const sent = seedQuote(context, QuoteStatus.SENT, { number: 7 });

    const next = await context.revise.execute(salesRep, sent.id);

    expect(next).toMatchObject({
      number: 7,
      version: 2,
      reference: 'COT-000007 v2',
      status: 'DRAFT',
      previousVersionId: sent.id,
      total: '238000.00',
    });
    expect(context.quotes.findStoredById(sent.id)?.status).toBe(QuoteStatus.SUPERSEDED);
    expect(context.auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.QUOTE_REVISED]);
  });

  it('una rechazada o vencida se revisa; un borrador o una ya reemplazada, no', async () => {
    const context = setup();
    const rejected = seedQuote(context, QuoteStatus.REJECTED);
    const expired = seedQuote(context, QuoteStatus.SENT, { validUntil: YESTERDAY, number: 2 });
    const draft = seedQuote(context, QuoteStatus.DRAFT, { number: 3 });
    const superseded = seedQuote(context, QuoteStatus.SUPERSEDED, { number: 4 });

    await expect(context.revise.execute(owner, rejected.id)).resolves.toMatchObject({ version: 2 });
    await expect(context.revise.execute(owner, expired.id)).resolves.toMatchObject({ version: 2 });
    for (const quote of [draft, superseded]) {
      await expect(context.revise.execute(owner, quote.id)).rejects.toMatchObject({
        code: ErrorCode.QUOTE_INVALID_TRANSITION,
      });
    }
  });

  it('dos revisiones simultáneas: solo una gana', async () => {
    const context = setup();
    const sent = seedQuote(context, QuoteStatus.SENT);
    context.quotes.failNextStateSave = true;

    await expect(context.revise.execute(owner, sent.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_INVALID_TRANSITION,
    });
    expect(context.quotes.allStored()).toHaveLength(1);
  });
});

describe('Borrar', () => {
  it('borra un borrador (suave) y lo audita', async () => {
    const context = setup();
    const draft = seedQuote(context, QuoteStatus.DRAFT);

    await context.remove.execute(salesRep, draft.id);

    expect(context.quotes.isDeleted(draft.id)).toBe(true);
    expect(context.auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.QUOTE_DELETED]);
  });

  it('lo enviado queda como historial', async () => {
    const context = setup();
    const sent = seedQuote(context, QuoteStatus.SENT);

    await expect(context.remove.execute(owner, sent.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_NOT_EDITABLE,
    });
    expect(context.quotes.isDeleted(sent.id)).toBe(false);
  });

  it('el comercial no borra la de otro', async () => {
    const context = setup();
    const others = seedQuote(context, QuoteStatus.DRAFT, { createdById: otherSalesRep.userId });

    await expect(context.remove.execute(salesRep, others.id)).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
  });
});
