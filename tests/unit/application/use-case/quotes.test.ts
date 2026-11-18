import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateQuoteInput, QuoteItemInput } from '@/application/dtos/QuoteDTOs.js';
import {
  EmailDeliveryError,
  EmailFailureReason,
  EmailMessage,
  IEmailService,
} from '@/application/ports/services/IEmailService.js';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import { QuoteContentResolver } from '@/application/use-case/quotes/QuoteContentResolver.js';
import {
  AcceptQuoteUseCase,
  CreateQuoteFromLeadUseCase,
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
import { LeadStatusType } from '@/domain/enums/LeadStatusType.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { Money, Percentage } from '@/domain/value-objects/money.js';
import { LeadMapper } from '@/application/mappers/LeadMapper.js';
import { ChangeLeadStatusUseCase } from '@/application/use-case/leads/changeLeadStatusUseCase.js';
import { TransactionalEmailSender } from '@/application/services/TransactionalEmailSender.js';
import { GenerateQuotePdfUseCase } from '@/application/use-case/quotes/QuotePdfUseCase.js';
import { CompiledEmailTemplateRenderer } from '@/infrastructure/email/CompiledEmailTemplateRenderer.js';
import { MemoryEmailOutbox, MemoryEmailService } from '@/infrastructure/email/LocalEmailServices.js';
import { MathjsFormulaEvaluator } from '@/infrastructure/services/MathjsFormulaEvaluator.js';
import { quoteFilterConfig } from '@/infrastructure/persistence/filters/quoteFilterConfig.js';
import {
  DEFAULT_TEST_TENANT_ID,
  buildCompanyContact,
  buildContact,
  buildLead,
  buildLeadStatusConfig,
  buildUser,
} from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryCompanyContactRepository } from '@tests/support/doubles/InMemoryCompanyContactRepository.js';
import { InMemoryEmailLogRepository } from '@tests/support/doubles/InMemoryEmailLogRepository.js';
import { InMemoryFileStorage } from '@tests/support/doubles/InMemoryFileStorage.js';
import { InMemoryUserRepository } from '@tests/support/doubles/InMemoryUserRepository.js';
import { StubPdfGenerator } from '@tests/support/doubles/StubPdfGenerator.js';
import { RecordingLogger } from '@tests/support/doubles/RecordingLogger.js';
import { InMemoryLeadStatusConfigRepository } from '@tests/support/doubles/InMemoryLeadStatusConfigRepository.js';
import { InMemoryLeadStatusHistoryRepository } from '@tests/support/doubles/InMemoryLeadStatusHistoryRepository.js';
import { InMemoryContactRepository } from '@tests/support/doubles/InMemoryContactRepository.js';
import { InMemoryFormulaRepository } from '@tests/support/doubles/InMemoryFormulaRepository.js';
import { InMemoryLeadRepository } from '@tests/support/doubles/InMemoryLeadRepository.js';
import { InMemoryProductRepository } from '@tests/support/doubles/InMemoryProductRepository.js';
import { InMemoryQuoteRepository } from '@tests/support/doubles/InMemoryQuoteRepository.js';
import { InMemoryTenantProfileRepository } from '@tests/support/doubles/InMemoryTenantProfileRepository.js';
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

/** Correo en memoria que puede simular la caída del proveedor. */
class SwitchableEmailService implements IEmailService {
  failing = false;
  private readonly delegate: MemoryEmailService;

  constructor(outbox: MemoryEmailOutbox) {
    this.delegate = new MemoryEmailService(outbox);
  }

  async send(message: EmailMessage) {
    if (this.failing) throw new EmailDeliveryError(EmailFailureReason.PROVIDER_UNREACHABLE, 'provider down');
    return this.delegate.send(message);
  }
}

function setup() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const quotes = new InMemoryQuoteRepository(tenantContext);
  const products = new InMemoryProductRepository(tenantContext);
  const formulas = new InMemoryFormulaRepository(tenantContext);
  const contacts = new InMemoryContactRepository(tenantContext);
  const companyContacts = new InMemoryCompanyContactRepository(tenantContext);
  const leads = new InMemoryLeadRepository(tenantContext);
  const profiles = new InMemoryTenantProfileRepository();
  profiles.profile = { ...profiles.profile!, defaultTaxRate: '19.00' };
  const auditLogger = new RecordingAuditLogger();
  const transactionManager = new RecordingTransactionManager();
  const resolver = new QuoteContentResolver(
    products,
    formulas,
    new MathjsFormulaEvaluator(),
    leads,
    contacts,
    companyContacts,
  );
  const leadStatuses = new InMemoryLeadStatusConfigRepository(tenantContext);
  const leadHistory = new InMemoryLeadStatusHistoryRepository(tenantContext);
  const outbox = new MemoryEmailOutbox();
  const emailService = new SwitchableEmailService(outbox);
  const emailLogs = new InMemoryEmailLogRepository();
  const emailSender = new TransactionalEmailSender(
    emailService,
    new CompiledEmailTemplateRenderer(),
    emailLogs,
    new RecordingLogger(),
  );
  const pdfGenerator = new StubPdfGenerator();
  const users = new InMemoryUserRepository(tenantContext);
  users.seed(buildUser({ id: salesRep.userId, firstName: 'Carlos', lastName: 'Pérez', role: Role.SALES_REP }));
  return {
    quotes,
    products,
    formulas,
    contacts,
    companyContacts,
    leads,
    leadStatuses,
    leadHistory,
    profiles,
    outbox,
    emailService,
    emailLogs,
    pdfGenerator,
    auditLogger,
    transactionManager,
    list: new ListQuotesUseCase(quotes, profiles, quoteFilterConfig),
    get: new GetQuoteUseCase(quotes, profiles),
    create: new CreateQuoteUseCase(quotes, resolver, profiles, tenantContext, transactionManager, auditLogger),
    update: new UpdateQuoteUseCase(quotes, resolver, profiles, transactionManager, auditLogger),
    remove: new DeleteQuoteUseCase(quotes, transactionManager, auditLogger),
    send: new SendQuoteUseCase(
      quotes,
      profiles,
      transactionManager,
      auditLogger,
      emailSender,
      new GenerateQuotePdfUseCase(
        quotes,
        profiles,
        leads,
        contacts,
        companyContacts,
        new InMemoryFileStorage(),
        pdfGenerator,
        new RecordingLogger(),
        auditLogger,
      ),
      users,
      leads,
      contacts,
      companyContacts,
    ),
    accept: new AcceptQuoteUseCase(
      quotes,
      profiles,
      transactionManager,
      auditLogger,
      leads,
      leadStatuses,
      new ChangeLeadStatusUseCase(
        leads,
        leadStatuses,
        leadHistory,
        transactionManager,
        new LeadMapper(),
        tenantContext,
        auditLogger,
      ),
      tenantContext,
    ),
    createFromLead: new CreateQuoteFromLeadUseCase(
      leads,
      new CreateQuoteUseCase(quotes, resolver, profiles, tenantContext, transactionManager, auditLogger),
    ),
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
  overrides: {
    createdById?: string;
    validUntil?: string;
    tenantId?: string;
    number?: number;
    version?: number;
    customer?: Quote['customer'];
  } = {},
): Quote {
  const quote = Quote.restore({
    id: randomUUID(),
    tenantId: overrides.tenantId ?? DEFAULT_TEST_TENANT_ID,
    number: overrides.number ?? 1,
    version: overrides.version ?? 1,
    status,
    customer: overrides.customer ?? { contactId: 'contact-id' },
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
    await context.profiles.updateCurrent({ defaultTaxRate: null });
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
    await context.profiles.updateCurrent({ maximumDiscountRateSalesRep: '0.00' });
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

  it('si la cotización se envió mientras tanto, el borrado responde conflicto y no la borra (F3-A04)', async () => {
    const context = setup();
    const draft = seedQuote(context, QuoteStatus.DRAFT);
    // Otra petición la deja SENT después de que este caso de uso la leyó como borrador.
    const read = context.quotes.findById.bind(context.quotes);
    vi.spyOn(context.quotes, 'findById').mockImplementationOnce(async (quoteId) => {
      const loaded = await read(quoteId);
      await context.quotes.saveState(draft.markSent(NOW, TODAY), QuoteStatus.DRAFT);
      return loaded;
    });

    await expect(context.remove.execute(salesRep, draft.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_NOT_EDITABLE,
    });

    expect(context.quotes.isDeleted(draft.id)).toBe(false);
    expect(context.quotes.findStoredById(draft.id)?.status).toBe(QuoteStatus.SENT);
    expect(context.auditLogger.entries).toEqual([]);
  });

  it('el comercial no borra la de otro', async () => {
    const context = setup();
    const others = seedQuote(context, QuoteStatus.DRAFT, { createdById: otherSalesRep.userId });

    await expect(context.remove.execute(salesRep, others.id)).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
  });
});

describe('Enviar con el canal de correo (D-57, F3-T08)', () => {
  async function enabledSetup() {
    const context = setup();
    await context.profiles.updateCurrent({ emailDeliveryEnabled: true });
    return context;
  }

  function seedDraftFor(context: Setup, customer: Quote['customer'], overrides: { createdById?: string } = {}) {
    return seedQuote(context, QuoteStatus.DRAFT, { customer, ...overrides });
  }

  it('con el canal desactivado solo cambia el estado: no sale correo ni se genera el PDF', async () => {
    const context = setup();
    const contact = buildContact({ email: 'cliente@example.com' });
    context.contacts.seed(contact);
    const draft = seedDraftFor(context, { contactId: contact.id });

    const result = await context.send.execute(salesRep, draft.id, { recipientEmail: 'otro@example.com' });

    expect(result).toMatchObject({ status: 'SENT', emailed: false });
    expect(context.outbox.sentTo('cliente@example.com')).toEqual([]);
    expect(context.outbox.sentTo('otro@example.com')).toEqual([]);
    expect(context.pdfGenerator.received).toBeUndefined();
    expect(context.auditLogger.entries[0].metadata).toEqual({ emailed: false });
  });

  it('con el canal activo envía al contacto el PDF adjunto de la cotización ya enviada, y lo registra', async () => {
    const context = await enabledSetup();
    const contact = buildContact({ firstName: 'Laura', lastName: 'Gómez', email: 'laura@example.com' });
    context.contacts.seed(contact);
    const draft = seedDraftFor(context, { contactId: contact.id });

    const result = await context.send.execute(salesRep, draft.id);

    expect(result).toMatchObject({ status: 'SENT', emailed: true });
    const [email] = context.outbox.sentTo('laura@example.com');
    expect(email.subject).toBe('Cotización COT-000001 de Aluminios Andinos SAS');
    expect(email.text).toContain('Hola, Laura Gómez:');
    expect(email.text).toContain('Carlos Pérez de Aluminios Andinos SAS');
    expect(email.text).toContain('Total: $ 238.000,00');
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments?.[0]).toMatchObject({ fileName: 'COT-000001.pdf', contentType: 'application/pdf' });
    // El PDF adjunto ya dice ENVIADA, no BORRADOR.
    expect(Buffer.from(email.attachments?.[0].content ?? []).toString()).toContain('ENVIADA');
    expect(context.auditLogger.entries.map((entry) => [entry.action, entry.metadata])).toEqual([
      [AuditAction.QUOTE_SENT, { emailed: true }],
    ]);
    expect(JSON.stringify(context.auditLogger.entries)).not.toContain('laura@example.com');
    expect(context.emailLogs.entries).toEqual([
      expect.objectContaining({ template: 'QUOTE_SENT', recipient: 'laura@example.com', status: 'SENT' }),
    ]);
  });

  it('el correo indicado por quien envía manda sobre el del cliente', async () => {
    const context = await enabledSetup();
    const contact = buildContact({ email: 'laura@example.com' });
    context.contacts.seed(contact);
    const draft = seedDraftFor(context, { contactId: contact.id });

    await context.send.execute(salesRep, draft.id, { recipientEmail: 'compras@example.com' });

    expect(context.outbox.sentTo('compras@example.com')).toHaveLength(1);
    expect(context.outbox.sentTo('laura@example.com')).toEqual([]);
  });

  it('sin correo en el contacto usa el de la empresa cliente y, después, el del lead', async () => {
    const context = await enabledSetup();
    const contact = buildContact({ email: undefined });
    const company = buildCompanyContact({ name: 'Constructora El Roble', email: 'roble@example.com' });
    const lead = buildLead({ contactName: 'Pedro', email: 'pedro@example.com' });
    context.contacts.seed(contact);
    context.companyContacts.seed(company);
    context.leads.seed(lead);
    const withCompany = seedDraftFor(context, { contactId: contact.id, companyContactId: company.id });
    const onlyLead = seedQuote(context, QuoteStatus.DRAFT, { customer: { leadId: lead.id }, number: 2 });

    await context.send.execute(salesRep, withCompany.id);
    await context.send.execute(salesRep, onlyLead.id);

    expect(context.outbox.sentTo('roble@example.com')).toHaveLength(1);
    expect(context.outbox.sentTo('pedro@example.com')[0].text).toContain('Hola, Pedro:');
  });

  it('sin ningún correo al que escribir responde QUOTE_RECIPIENT_REQUIRED y la cotización sigue en borrador', async () => {
    const context = await enabledSetup();
    const contact = buildContact({ email: undefined });
    context.contacts.seed(contact);
    const draft = seedDraftFor(context, { contactId: contact.id });

    await expect(context.send.execute(salesRep, draft.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_RECIPIENT_REQUIRED,
    });

    expect(context.quotes.findStoredById(draft.id)?.status).toBe(QuoteStatus.DRAFT);
    expect(context.auditLogger.entries).toEqual([]);
  });

  it('si el proveedor no acepta el correo, la cotización sigue en borrador y se puede reintentar', async () => {
    const context = await enabledSetup();
    const contact = buildContact({ email: 'laura@example.com' });
    context.contacts.seed(contact);
    const draft = seedDraftFor(context, { contactId: contact.id });
    context.emailService.failing = true;

    await expect(context.send.execute(salesRep, draft.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_EMAIL_FAILED,
    });
    expect(context.quotes.findStoredById(draft.id)?.status).toBe(QuoteStatus.DRAFT);
    expect(context.auditLogger.entries).toEqual([]);
    expect(context.emailLogs.entries).toEqual([expect.objectContaining({ status: 'FAILED' })]);

    context.emailService.failing = false;
    await expect(context.send.execute(salesRep, draft.id)).resolves.toMatchObject({ status: 'SENT', emailed: true });
  });

  it('una cotización que no se puede enviar no manda ningún correo', async () => {
    const context = await enabledSetup();
    const contact = buildContact({ email: 'laura@example.com' });
    context.contacts.seed(contact);
    const alreadySent = seedQuote(context, QuoteStatus.SENT, { customer: { contactId: contact.id } });
    const expired = seedQuote(context, QuoteStatus.DRAFT, {
      customer: { contactId: contact.id },
      validUntil: YESTERDAY,
      number: 2,
    });

    await expect(context.send.execute(salesRep, alreadySent.id)).rejects.toMatchObject({
      code: ErrorCode.QUOTE_INVALID_TRANSITION,
    });
    await expect(context.send.execute(salesRep, expired.id)).rejects.toMatchObject({ code: ErrorCode.QUOTE_EXPIRED });
    expect(context.outbox.sentTo('laura@example.com')).toEqual([]);
  });

  it('el comercial solo envía las suyas, también por correo', async () => {
    const context = await enabledSetup();
    const contact = buildContact({ email: 'laura@example.com' });
    context.contacts.seed(contact);
    const others = seedDraftFor(context, { contactId: contact.id }, { createdById: otherSalesRep.userId });

    await expect(context.send.execute(salesRep, others.id)).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
    expect(context.outbox.sentTo('laura@example.com')).toEqual([]);
  });
});

describe('Cotización de un lead (F3-T09)', () => {
  const leadInput = { items: [{ description: 'Instalación', quantity: 1, unitPrice: '100000' }] };

  it('crea la cotización con el lead como cliente y la deja a nombre de quien la crea', async () => {
    const context = setup();
    const lead = buildLead({ assignedToId: salesRep.userId });
    context.leads.seed(lead);

    const quote = await context.createFromLead.execute(salesRep, lead.id, leadInput);

    expect(quote).toMatchObject({ leadId: lead.id, createdById: salesRep.userId, status: 'DRAFT', number: 1 });
    expect(context.auditLogger.entries.map((entry) => entry.action)).toContain(AuditAction.QUOTE_CREATED);
  });

  it('admite además un contacto, pero el lead de la ruta manda sobre uno que venga en el cuerpo', async () => {
    const context = setup();
    const lead = buildLead({ assignedToId: salesRep.userId });
    const otherLead = buildLead({ assignedToId: salesRep.userId });
    const contact = buildContact({ ownerId: salesRep.userId });
    context.leads.seed(lead, otherLead);
    context.contacts.seed(contact);

    const quote = await context.createFromLead.execute(salesRep, lead.id, {
      ...leadInput,
      contactId: contact.id,
      ...({ leadId: otherLead.id } as object),
    });

    expect(quote).toMatchObject({ leadId: lead.id, contactId: contact.id });
  });

  it('un lead inexistente, de otra empresa o borrado responde LEAD_NOT_FOUND', async () => {
    const context = setup();
    const foreign = buildLead({ tenantId: 'other-tenant-id' });
    context.leads.seed(foreign);

    for (const leadId of [foreign.id, randomUUID()]) {
      await expect(context.createFromLead.execute(owner, leadId, leadInput)).rejects.toMatchObject({
        code: ErrorCode.LEAD_NOT_FOUND,
      });
    }
  });

  it('un comercial solo cotiza a sus leads; gestión, a cualquiera', async () => {
    const context = setup();
    const othersLead = buildLead({ assignedToId: otherSalesRep.userId });
    const unassignedLead = buildLead();
    context.leads.seed(othersLead, unassignedLead);

    await expect(context.createFromLead.execute(salesRep, othersLead.id, leadInput)).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
    await expect(context.createFromLead.execute(salesRep, unassignedLead.id, leadInput)).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
    await expect(context.createFromLead.execute(salesLeader, othersLead.id, leadInput)).resolves.toMatchObject({
      leadId: othersLead.id,
    });
    expect(context.quotes.allStored()).toHaveLength(1);
  });

  it('se aplican las mismas reglas que al crear: precio, IVA y tope de descuento', async () => {
    const context = setup();
    const lead = buildLead({ assignedToId: salesRep.userId });
    context.leads.seed(lead);

    await expect(
      context.createFromLead.execute(salesRep, lead.id, { ...leadInput, discountRate: '50' }),
    ).rejects.toMatchObject({ code: ErrorCode.DISCOUNT_ABOVE_ROLE_LIMIT });
    await expect(
      context.createFromLead.execute(salesRep, lead.id, { items: [{ quantity: 1, unitPrice: '1' }] }),
    ).rejects.toMatchObject({ code: ErrorCode.MISSING_REQUIRED_DATA });
  });
});

describe('Aceptar y pasar el lead a ganado (F3-T09)', () => {
  function seedLeadScenario(context: Setup, leadOverrides: Parameters<typeof buildLead>[0] = {}) {
    const open = buildLeadStatusConfig({ name: 'Nuevo', order: 1, isDefault: true });
    const wonLate = buildLeadStatusConfig({ name: 'Cerrado ganado', order: 5, type: LeadStatusType.WON });
    const wonFirst = buildLeadStatusConfig({ name: 'Ganado', order: 4, type: LeadStatusType.WON });
    const lost = buildLeadStatusConfig({ name: 'Perdido', order: 6, type: LeadStatusType.LOST });
    context.leadStatuses.seed(open, wonLate, wonFirst, lost);
    const lead = buildLead({ statusId: open.id, assignedToId: salesRep.userId, ...leadOverrides });
    context.leads.seed(lead);
    const sent = seedQuote(context, QuoteStatus.SENT, { customer: { leadId: lead.id }, number: 3 });
    return { open, wonFirst, lost, lead, sent };
  }

  it('por defecto acepta sin tocar el lead', async () => {
    const context = setup();
    const { lead, sent } = seedLeadScenario(context);

    const result = await context.accept.execute(salesRep, sent.id);

    expect(result).toMatchObject({ status: 'ACCEPTED', leadMarkedAsWon: false });
    expect((await context.leads.findById(lead.id))?.statusId).toBe(lead.statusId);
    expect(context.leadHistory.listStored()).toEqual([]);
  });

  it('con markLeadAsWon pasa el lead abierto al estado ganado de menor orden y lo deja en su historial', async () => {
    const context = setup();
    const { lead, open, wonFirst, sent } = seedLeadScenario(context);

    const result = await context.accept.execute(salesRep, sent.id, { markLeadAsWon: true });

    expect(result).toMatchObject({ status: 'ACCEPTED', leadMarkedAsWon: true });
    expect((await context.leads.findById(lead.id))?.statusId).toBe(wonFirst.id);
    expect(context.leadHistory.listStored()).toEqual([
      expect.objectContaining({
        leadId: lead.id,
        oldStatusId: open.id,
        newStatusId: wonFirst.id,
        changedById: salesRep.userId,
        note: 'Cotización COT-000003 aceptada',
      }),
    ]);
    expect(context.auditLogger.entries.map((entry) => entry.action)).toEqual([
      AuditAction.QUOTE_ACCEPTED,
      AuditAction.LEAD_STATUS_CHANGED,
    ]);
    expect(context.transactionManager.completedTransactionCount).toBeGreaterThanOrEqual(1);
  });

  it('no cambia un lead que ya está ganado o perdido', async () => {
    const context = setup();
    const { lead, lost, sent } = seedLeadScenario(context);
    await context.leads.updateStatus(lead.id, lost.id);

    const result = await context.accept.execute(salesRep, sent.id, { markLeadAsWon: true });

    expect(result.leadMarkedAsWon).toBe(false);
    expect((await context.leads.findById(lead.id))?.statusId).toBe(lost.id);
  });

  it('sin estado ganado configurado acepta igual y el lead no cambia', async () => {
    const context = setup();
    const open = buildLeadStatusConfig({ name: 'Nuevo', order: 1, isDefault: true });
    context.leadStatuses.seed(open);
    const lead = buildLead({ statusId: open.id, assignedToId: salesRep.userId });
    context.leads.seed(lead);
    const sent = seedQuote(context, QuoteStatus.SENT, { customer: { leadId: lead.id } });

    const result = await context.accept.execute(salesRep, sent.id, { markLeadAsWon: true });

    expect(result).toMatchObject({ status: 'ACCEPTED', leadMarkedAsWon: false });
  });

  it('una cotización sin lead acepta y lo pedido no hace nada', async () => {
    const context = setup();
    const sent = seedQuote(context, QuoteStatus.SENT);

    await expect(context.accept.execute(salesRep, sent.id, { markLeadAsWon: true })).resolves.toMatchObject({
      status: 'ACCEPTED',
      leadMarkedAsWon: false,
    });
  });

  it('si quien acepta no puede modificar el lead, la cotización tampoco se acepta', async () => {
    const context = setup();
    const { sent, lead } = seedLeadScenario(context, { assignedToId: otherSalesRep.userId });
    // El comercial creó la cotización de un lead que luego pasó a otro comercial.
    await expect(context.accept.execute(salesRep, sent.id, { markLeadAsWon: true })).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    });
    // En memoria no hay reversión; la transacción real sí (ver el test de API). El lead no se movió.
    expect((await context.leads.findById(lead.id))?.statusId).toBe(lead.statusId);
    expect(context.transactionManager.failedTransactionCount).toBeGreaterThanOrEqual(1);
  });

  it('gestión acepta y mueve el lead de cualquier comercial', async () => {
    const context = setup();
    const { sent, wonFirst, lead } = seedLeadScenario(context, { assignedToId: otherSalesRep.userId });

    await expect(context.accept.execute(owner, sent.id, { markLeadAsWon: true })).resolves.toMatchObject({
      leadMarkedAsWon: true,
    });
    expect((await context.leads.findById(lead.id))?.statusId).toBe(wonFirst.id);
  });
});
