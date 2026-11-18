import { randomUUID } from 'node:crypto';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { PaginatedResult } from '@/application/dtos/PaginatedResultDTO.js';
import {
  AcceptQuoteInput,
  AcceptQuoteResult,
  CreateQuoteInput,
  QuoteDTO,
  SendQuoteInput,
  SendQuoteResult,
  UpdateQuoteInput,
} from '@/application/dtos/QuoteDTOs.js';
import { formatCalendarDate, formatPesos } from '@/application/formatting/colombianFormat.js';
import { quoteReference, toQuoteDTO } from '@/application/mappers/QuoteMapper.js';
import { ILeadStatusConfigRepository } from '@/application/ports/repositories/ILeadStatusConfigRepository.js';
import { IMapper } from '@/application/ports/mappers/IMapper.js';
import { ICompanyContactRepository } from '@/application/ports/repositories/ICompanyContactRepository.js';
import { IContactRepository } from '@/application/ports/repositories/IContactRepository.js';
import { ILeadRepository } from '@/application/ports/repositories/ILeadRepository.js';
import { IQuoteRepository } from '@/application/ports/repositories/IQuoteRepository.js';
import { ITenantProfileRepository, TenantProfile } from '@/application/ports/repositories/ITenantProfileRepository.js';
import {
  AuditAction,
  AuditEntity,
  IAuditLogger,
  changedFieldNames,
} from '@/application/ports/services/IAuditLogger.js';
import { EmailTemplate } from '@/application/ports/services/IEmailTemplateRenderer.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { IUserRepository } from '@/application/ports/repositories/IUserRepository.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { Action, Actor, can } from '@/application/policies/authorizationPolicy.js';
import { TransactionalEmailSender } from '@/application/services/TransactionalEmailSender.js';
import { ChangeLeadStatusUseCase } from '@/application/use-case/leads/changeLeadStatusUseCase.js';
import { GenericListFilteredUseCase } from '@/application/use-case/filter/GenericListFilteredUseCase.js';
import { QuoteContentResolver } from '@/application/use-case/quotes/QuoteContentResolver.js';
import { GenerateQuotePdfUseCase } from '@/application/use-case/quotes/QuotePdfUseCase.js';
import { Quote, QuoteContent, QuoteCustomer, QuoteStatus } from '@/domain/entities/Quote.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { ServiceUnavailableError } from '@/domain/errors/ServiceUnavailableError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { LeadStatusType } from '@/domain/enums/LeadStatusType.js';
import { addDaysToCalendarDate, calendarDateIn } from '@/domain/value-objects/calendarDate.js';
import { Percentage } from '@/domain/value-objects/money.js';

// F3-T05: cotizaciones. Un comercial trabaja las suyas; gestión, todas las de la empresa.

/** Vigencia por defecto de una cotización nueva (D-23). */
const DEFAULT_VALIDITY_DAYS = 30;
const NO_DISCOUNT = '0';
const PDF_CONTENT_TYPE = 'application/pdf';

type ActorWithId = Actor & { userId: string };

function assertAllowed(actor: Actor, action: Action): void {
  if (!can(actor, action)) throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
}

function quoteNotFound(): NotFoundError {
  return new NotFoundError(ErrorCode.QUOTE_NOT_FOUND, 'Quote not found');
}

/** Cosas que casi todos los casos de uso necesitan: el perfil (zona horaria, IVA, topes) y el momento actual. */
async function loadClock(
  profiles: ITenantProfileRepository,
): Promise<{ profile: TenantProfile; now: Date; today: string }> {
  const profile = await profiles.findCurrent();
  // Con sesión válida la empresa existe y está activa: es un fallo interno.
  if (!profile) throw new Error('Tenant of the session not found');
  const now = new Date();
  return { profile, now, today: calendarDateIn(profile.timezone, now) };
}

// Las acciones con alcance `own` (un comercial, solo lo suyo) se comprueban contra la cotización concreta en
// `findAllowedQuote` y, en el listado, con el alcance de `GenericListFilteredUseCase`: una comprobación sin recurso
// denegaría a todo comercial. Solo `QUOTE_CREATE`, que no tiene alcance, usa `assertAllowed`.

/**
 * La cotización pedida, si existe en la empresa y el actor puede hacer `action` sobre ella (un comercial solo
 * sobre las que creó).
 *
 * @throws {NotFoundError} `QUOTE_NOT_FOUND` (también si es de otra empresa).
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 */
async function findAllowedQuote(
  repository: IQuoteRepository,
  actor: Actor,
  action: Action,
  quoteId: string,
): Promise<Quote> {
  const quote = await repository.findById(quoteId);
  if (!quote) throw quoteNotFound();
  if (!can(actor, action, { ownerUserId: quote.createdById })) {
    throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
  }
  return quote;
}

/** La vigencia no puede estar en el pasado: una cotización nueva o modificada que ya nace vencida no sirve. */
function assertValidityNotPast(validUntil: string, today: string): void {
  if (validUntil < today) {
    throw new ValidationError(ErrorCode.INVALID_VALIDITY_DATE, 'validUntil cannot be in the past');
  }
}

/** Posiciones de los ítems cuyo precio cambió el comercial (D-24). */
function overriddenPositions(quote: Quote): number[] {
  return quote.items.filter((item) => item.isPriceOverridden).map((item) => item.position);
}

/** D-24, Q-015: el cambio de precio queda en la auditoría; la alerta a los líderes llega con F4-T06. */
async function recordPriceOverrides(auditLogger: IAuditLogger, quote: Quote): Promise<void> {
  const positions = overriddenPositions(quote);
  if (positions.length === 0) return;
  await auditLogger.record({
    action: AuditAction.QUOTE_PRICE_OVERRIDDEN,
    entity: AuditEntity.QUOTE,
    entityId: quote.id,
    metadata: { itemPositions: positions },
  });
}

/** Busca, filtra, ordena y pagina cotizaciones. Un comercial solo ve las que creó. */
export class ListQuotesUseCase {
  constructor(
    private readonly repository: IQuoteRepository,
    private readonly tenantProfileRepository: ITenantProfileRepository,
    private readonly filterConfig: IFilterFieldConfig,
  ) {}

  async execute(actor: Actor, criteria: FilterCriteriaDTO): Promise<PaginatedResult<QuoteDTO>> {
    const { today } = await loadClock(this.tenantProfileRepository);
    const mapper: IMapper<Quote, QuoteDTO> = { toDTO: (quote) => toQuoteDTO(quote, today) };
    const listFiltered = new GenericListFilteredUseCase(this.repository, mapper, this.filterConfig, {
      action: Action.QUOTE_LIST,
      ownerField: 'createdById',
    });
    return listFiltered.execute(criteria, actor);
  }
}

/**
 * Una cotización con sus ítems.
 *
 * @throws {NotFoundError} `QUOTE_NOT_FOUND`.
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS` (un comercial pide la de otro).
 */
export class GetQuoteUseCase {
  constructor(
    private readonly repository: IQuoteRepository,
    private readonly tenantProfileRepository: ITenantProfileRepository,
  ) {}

  async execute(actor: Actor, quoteId: string): Promise<QuoteDTO> {
    const quote = await findAllowedQuote(this.repository, actor, Action.QUOTE_LIST, quoteId);
    const { today } = await loadClock(this.tenantProfileRepository);
    return toQuoteDTO(quote, today);
  }
}

/**
 * Crea un borrador con el siguiente número de la empresa. El servidor calcula el precio de cada ítem (producto o
 * fórmula); un precio distinto exige motivo y queda en la auditoría (D-24).
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`, `DISCOUNT_ABOVE_ROLE_LIMIT`.
 * @throws {ValidationError} `QUOTE_CUSTOMER_REQUIRED`, `INVALID_QUOTE_CUSTOMER`, `INVALID_VALIDITY_DATE`,
 * `QUOTE_ITEMS_REQUIRED`, `PRODUCT_NOT_AVAILABLE`, `ITEM_PRICE_REQUIRED`, `PRICE_OVERRIDE_REASON_REQUIRED`,
 * `TAX_RATE_REQUIRED`, `INVALID_FORMULA_VARIABLE`, `INVALID_QUANTITY`.
 */
export class CreateQuoteUseCase {
  constructor(
    private readonly repository: IQuoteRepository,
    private readonly contentResolver: QuoteContentResolver,
    private readonly tenantProfileRepository: ITenantProfileRepository,
    private readonly tenantContext: ITenantContext,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: ActorWithId, input: CreateQuoteInput): Promise<QuoteDTO> {
    assertAllowed(actor, Action.QUOTE_CREATE);
    const { profile, now, today } = await loadClock(this.tenantProfileRepository);

    const customer = {
      leadId: input.leadId,
      contactId: input.contactId,
      companyContactId: input.companyContactId,
    };
    await this.contentResolver.assertCustomerReachable(actor, customer);
    const validUntil = input.validUntil ?? addDaysToCalendarDate(today, DEFAULT_VALIDITY_DAYS);
    assertValidityNotPast(validUntil, today);
    const discountRate = Percentage.fromDecimalString(input.discountRate ?? NO_DISCOUNT);
    const items = await this.contentResolver.resolveItems(actor, profile, discountRate, input.items);
    const content: QuoteContent = { customer, validUntil, discountRate, notes: input.notes, items };

    const quote = await this.transactionManager.runInTransaction(async () => {
      const number = await this.repository.nextNumber();
      const draft = Quote.createDraft({
        id: randomUUID(),
        tenantId: this.tenantContext.getTenantId(),
        number,
        createdById: actor.userId,
        content,
        now,
      });
      await this.repository.create(draft);
      await this.auditLogger.record({
        action: AuditAction.QUOTE_CREATED,
        entity: AuditEntity.QUOTE,
        entityId: draft.id,
        metadata: { number, itemCount: draft.items.length },
      });
      await recordPriceOverrides(this.auditLogger, draft);
      return draft;
    });
    return toQuoteDTO(quote, today);
  }
}

/**
 * Crea una cotización para un lead (F3-T09): igual que crearla, con el lead como cliente. Un comercial solo la hace
 * para sus leads; gestión, para cualquiera de la empresa. Además del lead se pueden indicar un contacto o una empresa
 * cliente.
 *
 * @throws {NotFoundError} `LEAD_NOT_FOUND` (también si es de otra empresa o está borrado).
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`, `DISCOUNT_ABOVE_ROLE_LIMIT`.
 * @throws {ValidationError} los mismos que al crear.
 */
export class CreateQuoteFromLeadUseCase {
  constructor(
    private readonly leadRepository: ILeadRepository,
    private readonly createQuote: CreateQuoteUseCase,
  ) {}

  async execute(actor: ActorWithId, leadId: string, input: Omit<CreateQuoteInput, 'leadId'>): Promise<QuoteDTO> {
    const lead = await this.leadRepository.findById(leadId);
    if (!lead) throw new NotFoundError(ErrorCode.LEAD_NOT_FOUND, 'Lead not found');
    if (!can(actor, Action.QUOTE_CREATE_FROM_LEAD, { ownerUserId: lead.assignedToId })) {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }
    return this.createQuote.execute(actor, { ...input, leadId });
  }
}

/**
 * Modifica un borrador. `items`, si viene, reemplaza todos los ítems (y se vuelve a calcular su precio).
 *
 * @throws {NotFoundError} `QUOTE_NOT_FOUND`.
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`, `DISCOUNT_ABOVE_ROLE_LIMIT`.
 * @throws {ConflictError} `QUOTE_NOT_EDITABLE` si ya no es un borrador (D-22: se crea una versión nueva).
 * @throws {ValidationError} los mismos que al crear.
 */
export class UpdateQuoteUseCase {
  constructor(
    private readonly repository: IQuoteRepository,
    private readonly contentResolver: QuoteContentResolver,
    private readonly tenantProfileRepository: ITenantProfileRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, quoteId: string, input: UpdateQuoteInput): Promise<QuoteDTO> {
    const stored = await findAllowedQuote(this.repository, actor, Action.QUOTE_UPDATE, quoteId);
    stored.assertEditable();
    const { profile, now, today } = await loadClock(this.tenantProfileRepository);

    const customer = {
      leadId: input.leadId === undefined ? stored.customer.leadId : (input.leadId ?? undefined),
      contactId: input.contactId === undefined ? stored.customer.contactId : (input.contactId ?? undefined),
      companyContactId:
        input.companyContactId === undefined ? stored.customer.companyContactId : (input.companyContactId ?? undefined),
    };
    // Solo se vuelve a comprobar el cliente que cambia: uno que ya estaba y dejó de estar a su alcance no bloquea.
    await this.contentResolver.assertCustomerReachable(actor, {
      leadId: customer.leadId === stored.customer.leadId ? undefined : customer.leadId,
      contactId: customer.contactId === stored.customer.contactId ? undefined : customer.contactId,
      companyContactId:
        customer.companyContactId === stored.customer.companyContactId ? undefined : customer.companyContactId,
    });

    const validUntil = input.validUntil ?? stored.validUntil;
    if (input.validUntil !== undefined) assertValidityNotPast(validUntil, today);
    const discountRate =
      input.discountRate === undefined ? stored.discountRate : Percentage.fromDecimalString(input.discountRate);
    const items = input.items
      ? await this.contentResolver.resolveItems(actor, profile, discountRate, input.items)
      : stored.items;
    // El descuento global o el rol pudieron cambiar sin tocar los ítems: el tope se comprueba igual.
    if (!input.items) this.contentResolver.assertDiscountsWithinRoleLimit(actor, profile, discountRate, items);

    const updated = stored.withContent(
      {
        customer,
        validUntil,
        discountRate,
        notes: input.notes === undefined ? stored.notes : (input.notes ?? undefined),
        items,
      },
      now,
    );

    await this.transactionManager.runInTransaction(async () => {
      await this.repository.saveContent(updated);
      await this.auditLogger.record({
        action: AuditAction.QUOTE_UPDATED,
        entity: AuditEntity.QUOTE,
        entityId: quoteId,
        metadata: { changedFields: changedFieldNames(input) },
      });
      // Solo si esta modificación cambió los ítems: no se repite el aviso por un cambio de notas.
      if (input.items) await recordPriceOverrides(this.auditLogger, updated);
    });
    return toQuoteDTO(updated, today);
  }
}

/**
 * Borra (suave) un borrador. Lo enviado queda como historial.
 *
 * @throws {NotFoundError} `QUOTE_NOT_FOUND`.
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {ConflictError} `QUOTE_NOT_EDITABLE` si no es un borrador.
 */
export class DeleteQuoteUseCase {
  constructor(
    private readonly repository: IQuoteRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, quoteId: string): Promise<void> {
    const quote = await findAllowedQuote(this.repository, actor, Action.QUOTE_DELETE, quoteId);
    quote.assertDeletable();

    await this.transactionManager.runInTransaction(async () => {
      await this.repository.delete(quoteId);
      await this.auditLogger.record({
        action: AuditAction.QUOTE_DELETED,
        entity: AuditEntity.QUOTE,
        entityId: quoteId,
      });
    });
  }
}

/** Cambio de estado hecho con el compare-and-swap de `saveState`: si otra petición se adelantó, es un conflicto. */
async function saveTransition(repository: IQuoteRepository, next: Quote, expectedStatus: QuoteStatus): Promise<void> {
  if (!(await repository.saveState(next, expectedStatus))) {
    throw new ConflictError(ErrorCode.QUOTE_INVALID_TRANSITION, 'Quote state changed meanwhile; reload it');
  }
}

/** A quién se le escribe y cómo se le saluda. */
interface QuoteRecipient {
  email: string;
  name: string;
}

const FALLBACK_CUSTOMER_NAME = 'cliente';

/**
 * Envía el borrador al cliente (D-22: desde aquí ya no se edita) y lo deja `SENT`.
 *
 * Con el canal de correo de la empresa activado (D-57), antes de cambiar el estado manda al cliente un correo con el
 * PDF adjunto: a `recipientEmail` si viene, y si no al correo del contacto, de la empresa cliente o del lead, en ese
 * orden. Si el proveedor no acepta el correo, la cotización sigue en borrador y se puede reintentar. Con el canal
 * desactivado solo cambia el estado y el comercial comparte el PDF por su cuenta (`emailed: false`).
 *
 * @throws {NotFoundError} `QUOTE_NOT_FOUND`.
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {ConflictError} `QUOTE_INVALID_TRANSITION`, `QUOTE_EXPIRED` (vigencia pasada).
 * @throws {ValidationError} `QUOTE_ITEMS_REQUIRED`, `QUOTE_RECIPIENT_REQUIRED` (correo activo y sin a quién escribir).
 * @throws {ServiceUnavailableError} `QUOTE_EMAIL_FAILED`.
 */
export class SendQuoteUseCase {
  constructor(
    private readonly repository: IQuoteRepository,
    private readonly tenantProfileRepository: ITenantProfileRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
    private readonly emailSender: TransactionalEmailSender,
    private readonly pdfUseCase: GenerateQuotePdfUseCase,
    private readonly userRepository: IUserRepository,
    private readonly leadRepository: ILeadRepository,
    private readonly contactRepository: IContactRepository,
    private readonly companyContactRepository: ICompanyContactRepository,
  ) {}

  async execute(actor: ActorWithId, quoteId: string, input: SendQuoteInput = {}): Promise<SendQuoteResult> {
    const quote = await findAllowedQuote(this.repository, actor, Action.QUOTE_SEND, quoteId);
    const { profile, now, today } = await loadClock(this.tenantProfileRepository);
    const sent = quote.markSent(now, today);

    const emailed = profile.emailDeliveryEnabled
      ? await this.emailToCustomer(actor, sent, profile, input.recipientEmail)
      : false;

    await this.transactionManager.runInTransaction(async () => {
      await saveTransition(this.repository, sent, quote.status);
      await this.auditLogger.record({
        action: AuditAction.QUOTE_SENT,
        entity: AuditEntity.QUOTE,
        entityId: quoteId,
        metadata: { emailed },
      });
    });
    return { ...toQuoteDTO(sent, today), emailed };
  }

  /** Manda el correo con el PDF de la cotización ya marcada como enviada. Siempre devuelve `true` o lanza. */
  private async emailToCustomer(
    actor: ActorWithId,
    sent: Quote,
    profile: TenantProfile,
    recipientEmail: string | undefined,
  ): Promise<true> {
    const recipient = await this.resolveRecipient(sent.customer, recipientEmail);
    if (!recipient) {
      throw new ValidationError(
        ErrorCode.QUOTE_RECIPIENT_REQUIRED,
        'The customer has no email: send recipientEmail or fill in the customer email',
      );
    }
    const pdf = await this.pdfUseCase.renderQuote(actor, sent);
    const sender = await this.userRepository.findById(actor.userId);
    const totals = sent.totals();
    const delivered = await this.emailSender.send(
      { email: recipient.email, tenantId: sent.tenantId, userId: actor.userId },
      EmailTemplate.QUOTE_SENT,
      {
        customerName: recipient.name,
        companyName: profile.name,
        senderName: sender ? `${sender.firstName} ${sender.lastName}` : profile.name,
        quoteReference: quoteReference(sent.number, sent.version),
        total: formatPesos(totals.total.toDecimalString()),
        validUntil: formatCalendarDate(sent.validUntil),
      },
      [{ fileName: pdf.fileName, content: pdf.content, contentType: PDF_CONTENT_TYPE }],
    );
    if (!delivered) {
      throw new ServiceUnavailableError(ErrorCode.QUOTE_EMAIL_FAILED, 'The email could not be delivered; try again');
    }
    return true;
  }

  /** Destinatario: el correo indicado o, si no, el del contacto, la empresa cliente o el lead. */
  private async resolveRecipient(
    customer: QuoteCustomer,
    recipientEmail: string | undefined,
  ): Promise<QuoteRecipient | undefined> {
    const [contact, company, lead] = await Promise.all([
      customer.contactId ? this.contactRepository.findById(customer.contactId) : null,
      customer.companyContactId ? this.companyContactRepository.findById(customer.companyContactId) : null,
      customer.leadId ? this.leadRepository.findById(customer.leadId) : null,
    ]);
    const candidates: Array<{ email?: string; name?: string }> = [
      { email: contact?.email, name: contact ? `${contact.firstName} ${contact.lastName}` : undefined },
      { email: company?.email, name: company?.name },
      { email: lead?.email, name: lead?.contactName ?? lead?.companyName },
    ];
    const knownName = candidates.find((candidate) => candidate.name)?.name ?? FALLBACK_CUSTOMER_NAME;
    if (recipientEmail) return { email: recipientEmail, name: knownName };
    const withEmail = candidates.find((candidate) => candidate.email);
    return withEmail?.email ? { email: withEmail.email, name: withEmail.name ?? knownName } : undefined;
  }
}

/**
 * El cliente rechazó. Vale también para una enviada ya vencida.
 *
 * @throws {NotFoundError} `QUOTE_NOT_FOUND`.
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {ConflictError} `QUOTE_INVALID_TRANSITION`.
 */
export class RejectQuoteUseCase {
  constructor(
    private readonly repository: IQuoteRepository,
    private readonly tenantProfileRepository: ITenantProfileRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, quoteId: string): Promise<QuoteDTO> {
    const quote = await findAllowedQuote(this.repository, actor, Action.QUOTE_DECIDE, quoteId);
    const { now, today } = await loadClock(this.tenantProfileRepository);
    const rejected = quote.reject(now);

    await this.transactionManager.runInTransaction(async () => {
      await saveTransition(this.repository, rejected, quote.status);
      await this.auditLogger.record({
        action: AuditAction.QUOTE_REJECTED,
        entity: AuditEntity.QUOTE,
        entityId: quoteId,
      });
    });
    return toQuoteDTO(rejected, today);
  }
}

/**
 * El cliente aceptó. Solo una cotización enviada y vigente; es definitiva.
 *
 * Con `markLeadAsWon` y una cotización de un lead, el lead pasa al estado ganado de la empresa (el de tipo `WON` con
 * menor orden) en la misma transacción, con una nota en su historial. Solo se mueve un lead abierto: uno ya ganado o
 * perdido no cambia, y sin estado ganado configurado tampoco (`leadMarkedAsWon: false`). Si el comercial no puede
 * modificar ese lead, no se acepta nada. Por defecto no se toca el lead.
 *
 * @throws {NotFoundError} `QUOTE_NOT_FOUND`.
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS` (también si pide mover un lead que no puede modificar).
 * @throws {ConflictError} `QUOTE_INVALID_TRANSITION`, `QUOTE_EXPIRED`.
 */
export class AcceptQuoteUseCase {
  constructor(
    private readonly repository: IQuoteRepository,
    private readonly tenantProfileRepository: ITenantProfileRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
    private readonly leadRepository: ILeadRepository,
    private readonly leadStatusRepository: ILeadStatusConfigRepository,
    private readonly changeLeadStatus: ChangeLeadStatusUseCase,
    private readonly tenantContext: ITenantContext,
  ) {}

  async execute(actor: Actor, quoteId: string, input: AcceptQuoteInput = {}): Promise<AcceptQuoteResult> {
    const quote = await findAllowedQuote(this.repository, actor, Action.QUOTE_DECIDE, quoteId);
    const { now, today } = await loadClock(this.tenantProfileRepository);
    const accepted = quote.accept(now, today);

    const leadMarkedAsWon = await this.transactionManager.runInTransaction(async () => {
      await saveTransition(this.repository, accepted, quote.status);
      await this.auditLogger.record({
        action: AuditAction.QUOTE_ACCEPTED,
        entity: AuditEntity.QUOTE,
        entityId: quoteId,
      });
      return input.markLeadAsWon ? this.markLeadAsWon(actor, accepted) : false;
    });
    return { ...toQuoteDTO(accepted, today), leadMarkedAsWon };
  }

  /** Mueve el lead de la cotización al estado ganado. Devuelve si lo movió. */
  private async markLeadAsWon(actor: Actor, quote: Quote): Promise<boolean> {
    const { leadId } = quote.customer;
    const lead = leadId ? await this.leadRepository.findById(leadId) : null;
    if (!lead) return false;

    const statuses = await this.leadStatusRepository.findAllByTenant(this.tenantContext.getTenantId());
    const currentStatus = statuses.find((status) => status.id === lead.statusId);
    if (currentStatus && currentStatus.type !== LeadStatusType.OPEN) return false;
    const wonStatus = statuses
      .filter((status) => status.type === LeadStatusType.WON)
      .sort((first, second) => (first.order ?? 0) - (second.order ?? 0))[0];
    if (!wonStatus) return false;

    await this.changeLeadStatus.execute(
      lead.id,
      { statusId: wonStatus.id, note: `Cotización ${quoteReference(quote.number, quote.version)} aceptada` },
      actor,
    );
    return true;
  }
}

/**
 * Crea la versión siguiente (borrador, mismo número) de una cotización enviada o rechazada, y deja la anterior
 * como reemplazada (D-22, Q-018). Una vencida se revisa igual, porque sigue guardada como enviada.
 *
 * @throws {NotFoundError} `QUOTE_NOT_FOUND`.
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {ConflictError} `QUOTE_INVALID_TRANSITION` (borrador, aceptada o ya reemplazada).
 */
export class ReviseQuoteUseCase {
  constructor(
    private readonly repository: IQuoteRepository,
    private readonly tenantProfileRepository: ITenantProfileRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(actor: Actor, quoteId: string): Promise<QuoteDTO> {
    const quote = await findAllowedQuote(this.repository, actor, Action.QUOTE_UPDATE, quoteId);
    const { now, today } = await loadClock(this.tenantProfileRepository);
    const { superseded, nextVersion } = quote.revise(randomUUID(), now);

    await this.transactionManager.runInTransaction(async () => {
      await saveTransition(this.repository, superseded, quote.status);
      await this.repository.create(nextVersion);
      await this.auditLogger.record({
        action: AuditAction.QUOTE_REVISED,
        entity: AuditEntity.QUOTE,
        entityId: nextVersion.id,
        metadata: { previousVersionId: quoteId, version: nextVersion.version },
      });
    });
    return toQuoteDTO(nextVersion, today);
  }
}
