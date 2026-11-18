import { quoteReference } from '@/application/mappers/QuoteMapper.js';
import { ICompanyContactRepository } from '@/application/ports/repositories/ICompanyContactRepository.js';
import { IContactRepository } from '@/application/ports/repositories/IContactRepository.js';
import { ILeadRepository } from '@/application/ports/repositories/ILeadRepository.js';
import { IQuoteRepository } from '@/application/ports/repositories/IQuoteRepository.js';
import { ITenantProfileRepository } from '@/application/ports/repositories/ITenantProfileRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { IFileStorage } from '@/application/ports/services/IFileStorage.js';
import { ILogger } from '@/application/ports/services/ILogger.js';
import { IPdfGenerator, PdfLogo, QuotePdfData } from '@/application/ports/services/IPdfGenerator.js';
import { Action, Actor, can } from '@/application/policies/authorizationPolicy.js';
import { Quote, QuoteCustomer, QuoteDisplayStatus } from '@/domain/entities/Quote.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { calendarDateIn } from '@/domain/value-objects/calendarDate.js';
import { inspectLogoImage } from '@/domain/value-objects/logoImage.js';

// F3-T06: PDF de una cotización. Lo descarga quien puede ver la cotización (un comercial, solo las suyas).

/** El PDF ya generado y el nombre con el que se descarga. */
export interface QuotePdfFile {
  fileName: string;
  content: Uint8Array;
}

const STATUS_LABELS: Record<QuoteDisplayStatus, string> = {
  DRAFT: 'BORRADOR',
  SENT: 'ENVIADA',
  ACCEPTED: 'ACEPTADA',
  REJECTED: 'RECHAZADA',
  SUPERSEDED: 'REEMPLAZADA',
  EXPIRED: 'VENCIDA',
};

// Condiciones comerciales fijas. Las plantillas por empresa (C-13) quedan fuera del MVP.
const QUOTE_CONDITIONS = [
  'Valores expresados en pesos colombianos (COP).',
  'Los precios unitarios son antes de IVA; el IVA se detalla en cada ítem.',
  'Cotización válida hasta la fecha de vigencia indicada. Pasada esa fecha, los precios pueden cambiar.',
];

/** `"ancho: 1.20, alto: 1.50"` para un ítem calculado con fórmula. */
function variablesSuffix(variables: Readonly<Record<string, string>> | undefined): string {
  const entries = Object.entries(variables ?? {});
  return entries.length === 0 ? '' : ` (${entries.map(([name, value]) => `${name}: ${value}`).join(', ')})`;
}

function nonEmpty(lines: Array<string | undefined>): string[] {
  return lines.filter((line): line is string => line !== undefined && line.trim() !== '');
}

/**
 * Genera el PDF de una cotización con los datos de la empresa, su logo, el cliente, los ítems y los totales. Los
 * datos de contacto del cliente solo aparecen si quien descarga puede ver a ese cliente (un comercial ya no ve al que
 * le reasignaron a otro): la cotización sigue saliendo, sin ese bloque.
 *
 * @throws {NotFoundError} `QUOTE_NOT_FOUND` (también si es de otra empresa).
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS` (un comercial pide la de otro).
 */
export class GenerateQuotePdfUseCase {
  constructor(
    private readonly quotes: IQuoteRepository,
    private readonly profiles: ITenantProfileRepository,
    private readonly leads: ILeadRepository,
    private readonly contacts: IContactRepository,
    private readonly companyContacts: ICompanyContactRepository,
    private readonly storage: IFileStorage,
    private readonly pdfGenerator: IPdfGenerator,
    private readonly logger: ILogger,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, quoteId: string): Promise<QuotePdfFile> {
    const quote = await this.quotes.findById(quoteId);
    if (!quote) throw new NotFoundError(ErrorCode.QUOTE_NOT_FOUND, 'Quote not found');
    if (!can(actor, Action.QUOTE_LIST, { ownerUserId: quote.createdById })) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    const file = await this.renderQuote(actor, quote);
    // Solo se audita una descarga que salió bien. Es una lectura: no hay escritura de negocio que meter en una
    // transacción. El envío por correo usa `renderQuote` y deja su propio rastro (`QUOTE_SENT`).
    await this.auditLogger.record({
      action: AuditAction.QUOTE_PDF_DOWNLOADED,
      entity: AuditEntity.QUOTE,
      entityId: quote.id,
      metadata: { version: quote.version },
    });
    return file;
  }

  /**
   * El PDF de una cotización ya cargada, con el estado que tenga esa instancia (el envío por correo lo genera de la
   * cotización ya marcada como enviada, antes de guardarla). El permiso lo comprueba quien llama.
   */
  async renderQuote(actor: Actor, quote: Quote): Promise<QuotePdfFile> {
    const profile = await this.profiles.findCurrent();
    if (!profile) throw new Error('Tenant of the session not found');
    const [logo, customerLines] = await Promise.all([
      this.loadLogo(profile.logoKey),
      this.describeCustomer(actor, quote.customer),
    ]);
    const now = new Date();
    const today = calendarDateIn(profile.timezone, now);

    const data = this.buildData(quote, {
      companyName: profile.name,
      logo,
      customerLines,
      issuedOn: calendarDateIn(profile.timezone, quote.createdAt ?? now),
      today,
    });
    const content = await this.pdfGenerator.generateQuotePdf(data);
    const reference = quoteReference(quote.number, quote.version);
    return { fileName: `${reference.replaceAll(' ', '-')}.pdf`, content };
  }

  private buildData(
    quote: Quote,
    context: { companyName: string; logo?: PdfLogo; customerLines: string[]; issuedOn: string; today: string },
  ): QuotePdfData {
    const totals = quote.totals();
    return {
      companyName: context.companyName,
      logo: context.logo,
      reference: quoteReference(quote.number, quote.version),
      statusLabel: STATUS_LABELS[quote.displayStatusOn(context.today)],
      issuedOn: context.issuedOn,
      validUntil: quote.validUntil,
      customerLines: context.customerLines,
      items: quote.items.map((item) => {
        const amounts = item.amounts(quote.discountRate);
        return {
          position: item.position,
          description: `${item.description}${variablesSuffix(item.variables)}`,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toDecimalString(),
          discountRate: item.discountRate.toDecimalString(),
          taxRate: item.taxRate.toDecimalString(),
          total: amounts.total.toDecimalString(),
        };
      }),
      discountRate: quote.discountRate.toDecimalString(),
      subtotal: totals.subtotal.toDecimalString(),
      discountTotal: totals.discountTotal.toDecimalString(),
      taxTotal: totals.taxTotal.toDecimalString(),
      total: totals.total.toDecimalString(),
      notes: quote.notes,
      conditions: QUOTE_CONDITIONS,
    };
  }

  /** El logo de la empresa; un logo que falte o no se pueda leer no impide generar el PDF. */
  private async loadLogo(logoKey: string | undefined): Promise<PdfLogo | undefined> {
    if (!logoKey) return undefined;
    try {
      const file = await this.storage.read(logoKey);
      const image = file ? inspectLogoImage(file.content) : undefined;
      return file && image ? { content: file.content, format: image.format } : undefined;
    } catch (error) {
      this.logger.warn('Could not read the company logo for a quote PDF', {
        error: error instanceof Error ? error.message : 'unknown',
      });
      return undefined;
    }
  }

  /** Líneas del bloque "Cliente": lo que la cotización lleva (lead, persona, empresa) y el actor puede ver. */
  private async describeCustomer(actor: Actor, customer: QuoteCustomer): Promise<string[]> {
    const [lead, contact, company] = await Promise.all([
      customer.leadId ? this.leads.findById(customer.leadId) : null,
      customer.contactId ? this.contacts.findById(customer.contactId) : null,
      customer.companyContactId ? this.companyContacts.findById(customer.companyContactId) : null,
    ]);
    const leadLines =
      lead && can(actor, Action.LEAD_LIST, { ownerUserId: lead.assignedToId })
        ? [lead.companyName, lead.contactName, lead.email, lead.phone]
        : [];
    const contactLines =
      contact && can(actor, Action.CONTACT_LIST, { ownerUserId: contact.ownerId })
        ? [`${contact.firstName} ${contact.lastName}`, contact.email, contact.phone]
        : [];
    const companyLines =
      company && can(actor, Action.COMPANY_CONTACT_LIST, { ownerUserId: company.ownerId })
        ? [
            company.name,
            company.taxNumber ? `NIT ${company.taxNumber}` : undefined,
            company.email,
            company.phone,
            [company.address, company.city].filter(Boolean).join(', '),
          ]
        : [];
    // Primero la empresa cliente, luego la persona y, al final, el lead (que suele repetir sus datos).
    return nonEmpty([...companyLines, ...contactLines, ...leadLines]);
  }
}
