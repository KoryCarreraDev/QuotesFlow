import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditAction, AuditEntity } from '@/application/ports/services/IAuditLogger.js';
import { IPdfGenerator, QuotePdfData } from '@/application/ports/services/IPdfGenerator.js';
import { GenerateQuotePdfUseCase } from '@/application/use-case/quotes/QuotePdfUseCase.js';
import { Quote, QuoteItem, QuoteStatus } from '@/domain/entities/Quote.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { Money, Percentage } from '@/domain/value-objects/money.js';
import {
  DEFAULT_TEST_TENANT_ID,
  buildCompanyContact,
  buildContact,
  buildLead,
} from '@tests/support/builders/entityBuilders.js';
import { buildPngHeader } from '@tests/support/builders/imageFixtures.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryCompanyContactRepository } from '@tests/support/doubles/InMemoryCompanyContactRepository.js';
import { InMemoryContactRepository } from '@tests/support/doubles/InMemoryContactRepository.js';
import { InMemoryFileStorage } from '@tests/support/doubles/InMemoryFileStorage.js';
import { InMemoryLeadRepository } from '@tests/support/doubles/InMemoryLeadRepository.js';
import { InMemoryQuoteRepository } from '@tests/support/doubles/InMemoryQuoteRepository.js';
import { InMemoryTenantProfileRepository } from '@tests/support/doubles/InMemoryTenantProfileRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingLogger } from '@tests/support/doubles/RecordingLogger.js';

// F3-T06: el caso de uso arma los datos del PDF; el dibujo se prueba en PdfLibQuoteGenerator.test.ts.

// 22:30 del 17 en Bogotá (UTC-5): ya es el día 18 en UTC.
const NOW = new Date('2026-11-18T03:30:00.000Z');
const CREATED_AT = new Date('2026-11-18T03:00:00.000Z');
const owner = { role: Role.OWNER, userId: 'owner-id' };
const salesRep = { role: Role.SALES_REP, userId: 'rep-id' };
const otherSalesRep = { role: Role.SALES_REP, userId: 'other-rep-id' };
const LOGO_SIDE = 64;
const UNIT_PRICE = '100000';
const QUANTITY = 3;
const DEFAULT_QUOTE_NUMBER = 12;

class CapturingPdfGenerator implements IPdfGenerator {
  received: QuotePdfData | undefined;

  async generateQuotePdf(data: QuotePdfData): Promise<Uint8Array> {
    this.received = data;
    return Buffer.from('%PDF-fake');
  }
}

function setup() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const quotes = new InMemoryQuoteRepository(tenantContext);
  const profiles = new InMemoryTenantProfileRepository();
  const leads = new InMemoryLeadRepository(tenantContext);
  const contacts = new InMemoryContactRepository(tenantContext);
  const companyContacts = new InMemoryCompanyContactRepository(tenantContext);
  const storage = new InMemoryFileStorage();
  const generator = new CapturingPdfGenerator();
  const logger = new RecordingLogger();
  const auditLogger = new RecordingAuditLogger();
  return {
    auditLogger,
    quotes,
    profiles,
    leads,
    contacts,
    companyContacts,
    storage,
    generator,
    logger,
    generate: new GenerateQuotePdfUseCase(
      quotes,
      profiles,
      leads,
      contacts,
      companyContacts,
      storage,
      generator,
      logger,
      auditLogger,
    ),
  };
}

type Setup = ReturnType<typeof setup>;

function seedQuote(
  context: Setup,
  overrides: Partial<{
    status: QuoteStatus;
    createdById: string;
    version: number;
    number: number;
    validUntil: string;
    tenantId: string;
    customer: { leadId?: string; contactId?: string; companyContactId?: string };
    variables: Record<string, string>;
  }> = {},
): Quote {
  const quote = Quote.restore({
    id: randomUUID(),
    tenantId: overrides.tenantId ?? DEFAULT_TEST_TENANT_ID,
    number: overrides.number ?? DEFAULT_QUOTE_NUMBER,
    version: overrides.version ?? 1,
    status: overrides.status ?? QuoteStatus.SENT,
    customer: overrides.customer ?? { contactId: 'contact-id' },
    validUntil: overrides.validUntil ?? '2026-12-18',
    discountRate: Percentage.fromDecimalString('10'),
    notes: 'Entrega en obra',
    items: [
      new QuoteItem(1, {
        description: 'Vidrio a medida',
        quantity: QUANTITY,
        variables: overrides.variables,
        unitPrice: Money.fromDecimalString(UNIT_PRICE),
        discountRate: Percentage.fromDecimalString('0'),
        taxRate: Percentage.fromDecimalString('19'),
      }),
    ],
    createdById: overrides.createdById ?? salesRep.userId,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
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

describe('Generar el PDF de una cotización', () => {
  it('arma los datos con importes exactos, la referencia y la fecha de emisión en la zona de la empresa', async () => {
    const context = setup();
    const quote = seedQuote(context, { number: 7 });

    const file = await context.generate.execute(salesRep, quote.id);

    expect(file.fileName).toBe('COT-000007.pdf');
    expect(Buffer.from(file.content).toString()).toBe('%PDF-fake');
    expect(context.generator.received).toMatchObject({
      companyName: 'Aluminios Andinos SAS',
      reference: 'COT-000007',
      statusLabel: 'ENVIADA',
      // 03:00 UTC del 18 es todavía el 17 en Bogotá.
      issuedOn: '2026-11-17',
      validUntil: '2026-12-18',
      discountRate: '10.00',
      subtotal: '300000.00',
      discountTotal: '30000.00',
      taxTotal: '51300.00',
      total: '321300.00',
      notes: 'Entrega en obra',
    });
    expect(context.generator.received?.items).toEqual([
      {
        position: 1,
        description: 'Vidrio a medida',
        quantity: QUANTITY,
        unitPrice: '100000.00',
        discountRate: '0.00',
        taxRate: '19.00',
        total: '321300.00',
      },
    ]);
    expect(context.generator.received?.conditions.length).toBeGreaterThan(0);
  });

  it('una versión siguiente lleva su versión en el nombre del archivo y en la referencia', async () => {
    const context = setup();
    const quote = seedQuote(context, { number: DEFAULT_QUOTE_NUMBER, version: 2, status: QuoteStatus.DRAFT });

    const file = await context.generate.execute(salesRep, quote.id);

    expect(file.fileName).toBe('COT-000012-v2.pdf');
    expect(context.generator.received).toMatchObject({ reference: 'COT-000012 v2', statusLabel: 'BORRADOR' });
  });

  it.each([
    [QuoteStatus.ACCEPTED, '2026-12-18', 'ACEPTADA'],
    [QuoteStatus.REJECTED, '2026-12-18', 'RECHAZADA'],
    [QuoteStatus.SUPERSEDED, '2026-12-18', 'REEMPLAZADA'],
    [QuoteStatus.SENT, '2026-11-16', 'VENCIDA'],
  ])('estado %s con vigencia %s se rotula %s', async (status, validUntil, label) => {
    const context = setup();
    const quote = seedQuote(context, { status, validUntil });

    await context.generate.execute(owner, quote.id);

    expect(context.generator.received?.statusLabel).toBe(label);
  });

  it('los ítems de fórmula muestran las medidas con que se calcularon', async () => {
    const context = setup();
    const quote = seedQuote(context, { variables: { ancho: '1.20', alto: '1.50' } });

    await context.generate.execute(owner, quote.id);

    expect(context.generator.received?.items[0].description).toBe('Vidrio a medida (ancho: 1.20, alto: 1.50)');
  });

  describe('logo', () => {
    it('lo incluye si la empresa tiene uno válido', async () => {
      const context = setup();
      const logo = buildPngHeader(LOGO_SIDE, LOGO_SIDE);
      await context.storage.save('logos/t/logo.png', logo, 'image/png');
      await context.profiles.updateLogoKey('logos/t/logo.png');
      const quote = seedQuote(context);

      await context.generate.execute(owner, quote.id);

      expect(context.generator.received?.logo?.format).toBe('png');
      expect(Buffer.from(context.generator.received?.logo?.content ?? []).equals(logo)).toBe(true);
    });

    it('si el archivo falta, no es una imagen válida o el almacenamiento falla, el PDF sale sin logo', async () => {
      const context = setup();
      const quote = seedQuote(context);
      await context.profiles.updateLogoKey('logos/t/missing.png');
      await context.generate.execute(owner, quote.id);
      const withoutFile = context.generator.received?.logo;

      await context.storage.save('logos/t/bad.png', Buffer.from('<svg/>'), 'image/png');
      await context.profiles.updateLogoKey('logos/t/bad.png');
      await context.generate.execute(owner, quote.id);
      const withBadImage = context.generator.received?.logo;

      vi.spyOn(context.storage, 'read').mockRejectedValue(new Error('disk offline'));
      await context.generate.execute(owner, quote.id);

      expect([withoutFile, withBadImage, context.generator.received?.logo]).toEqual([undefined, undefined, undefined]);
      expect(context.logger.entries.filter((entry) => entry.level === 'warn')).toHaveLength(1);
    });
  });

  describe('cliente', () => {
    it('muestra empresa, persona y lead en ese orden, sin líneas vacías', async () => {
      const context = setup();
      const lead = buildLead({
        companyName: 'Lead SAS',
        contactName: 'Pedro',
        email: undefined,
        phone: '3000000000',
        assignedToId: salesRep.userId,
      });
      const contact = buildContact({
        firstName: 'Laura',
        lastName: 'Gómez',
        email: 'laura@example.com',
        phone: undefined,
        ownerId: salesRep.userId,
      });
      const company = buildCompanyContact({
        name: 'Constructora El Roble',
        taxNumber: '900123456',
        email: undefined,
        phone: undefined,
        address: 'Calle 10 # 5-20',
        city: 'Medellín',
        ownerId: salesRep.userId,
      });
      context.leads.seed(lead);
      context.contacts.seed(contact);
      context.companyContacts.seed(company);
      const quote = seedQuote(context, {
        customer: { leadId: lead.id, contactId: contact.id, companyContactId: company.id },
      });

      await context.generate.execute(salesRep, quote.id);

      expect(context.generator.received?.customerLines).toEqual([
        'Constructora El Roble',
        'NIT 900123456',
        'Calle 10 # 5-20, Medellín',
        'Laura Gómez',
        'laura@example.com',
        'Lead SAS',
        'Pedro',
        '3000000000',
      ]);
    });

    it('un comercial no ve los datos de un cliente que ya no es suyo; gestión sí', async () => {
      const context = setup();
      const contact = buildContact({ firstName: 'Laura', lastName: 'Gómez', ownerId: otherSalesRep.userId });
      context.contacts.seed(contact);
      const quote = seedQuote(context, { customer: { contactId: contact.id } });

      await context.generate.execute(salesRep, quote.id);
      const asRep = context.generator.received?.customerLines;
      await context.generate.execute(owner, quote.id);

      expect(asRep).toEqual([]);
      expect(context.generator.received?.customerLines[0]).toBe('Laura Gómez');
    });
  });

  describe('auditoría (H13, F3-A14)', () => {
    it('la descarga queda auditada con la versión, después de generar el PDF', async () => {
      const context = setup();
      const quote = seedQuote(context, { version: 2 });

      await context.generate.execute(salesRep, quote.id);

      expect(context.auditLogger.entries).toEqual([
        expect.objectContaining({
          action: AuditAction.QUOTE_PDF_DOWNLOADED,
          entity: AuditEntity.QUOTE,
          entityId: quote.id,
          metadata: { version: 2 },
        }),
      ]);
    });

    it('una descarga que falla o se rechaza no deja rastro', async () => {
      const context = setup();
      const others = seedQuote(context, { createdById: otherSalesRep.userId });
      vi.spyOn(context.generator, 'generateQuotePdf').mockRejectedValueOnce(new Error('pdf failure'));
      const own = seedQuote(context, { number: 2 });

      await expect(context.generate.execute(salesRep, others.id)).rejects.toMatchObject({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
      });
      await expect(context.generate.execute(salesRep, randomUUID())).rejects.toMatchObject({
        code: ErrorCode.QUOTE_NOT_FOUND,
      });
      await expect(context.generate.execute(salesRep, own.id)).rejects.toThrow('pdf failure');

      expect(context.auditLogger.entries).toEqual([]);
    });
  });

  describe('permisos', () => {
    it('una cotización inexistente o de otra empresa responde no encontrada', async () => {
      const context = setup();
      const foreign = seedQuote(context, { tenantId: 'other-tenant-id' });

      await expect(context.generate.execute(owner, foreign.id)).rejects.toMatchObject({
        code: ErrorCode.QUOTE_NOT_FOUND,
      });
      await expect(context.generate.execute(owner, randomUUID())).rejects.toMatchObject({
        code: ErrorCode.QUOTE_NOT_FOUND,
      });
      expect(context.generator.received).toBeUndefined();
    });

    it('un comercial no descarga la cotización de otro; gestión sí', async () => {
      const context = setup();
      const others = seedQuote(context, { createdById: otherSalesRep.userId });

      await expect(context.generate.execute(salesRep, others.id)).rejects.toMatchObject({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
      });
      expect(context.generator.received).toBeUndefined();
      await expect(context.generate.execute(owner, others.id)).resolves.toBeDefined();
    });
  });
});
