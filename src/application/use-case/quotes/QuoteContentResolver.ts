import { QuoteItemInput } from '@/application/dtos/QuoteDTOs.js';
import { ICompanyContactRepository } from '@/application/ports/repositories/ICompanyContactRepository.js';
import { IContactRepository } from '@/application/ports/repositories/IContactRepository.js';
import { IFormulaRepository } from '@/application/ports/repositories/IFormulaRepository.js';
import { ILeadRepository } from '@/application/ports/repositories/ILeadRepository.js';
import { IProductRepository } from '@/application/ports/repositories/IProductRepository.js';
import { TenantProfile } from '@/application/ports/repositories/ITenantProfileRepository.js';
import { IFormulaEvaluator } from '@/application/ports/services/IFormulaEvaluator.js';
import { Action, Actor, can } from '@/application/policies/authorizationPolicy.js';
import { QuoteCustomer, QuoteItem, QuoteItemData } from '@/domain/entities/Quote.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { Money, Percentage } from '@/domain/value-objects/money.js';

const NO_DISCOUNT = '0';

/**
 * Convierte lo que envía el cliente de la API en el contenido de una cotización (F3-T05): comprueba que el
 * cliente de la venta es de la empresa y está al alcance del rol, calcula el precio de cada ítem en el servidor
 * (producto o fórmula, nunca el que diga el cliente salvo un cambio con motivo, D-24), aplica el IVA (Q-020) y
 * comprueba el tope de descuento del rol (D-25).
 */
export class QuoteContentResolver {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly formulaRepository: IFormulaRepository,
    private readonly formulaEvaluator: IFormulaEvaluator,
    private readonly leadRepository: ILeadRepository,
    private readonly contactRepository: IContactRepository,
    private readonly companyContactRepository: ICompanyContactRepository,
  ) {}

  /**
   * Un lead, un contacto o una empresa cliente de la empresa, al alcance del actor. Un comercial solo cotiza a lo
   * que es suyo (D-18); lo que no existe o es de otra empresa responde igual, para no revelar que existe.
   *
   * @throws {ValidationError} `INVALID_QUOTE_CUSTOMER` si no existe o no está al alcance.
   */
  async assertCustomerReachable(actor: Actor, customer: QuoteCustomer): Promise<void> {
    const reachable = await Promise.all([
      this.isLeadReachable(actor, customer.leadId),
      this.isContactReachable(actor, customer.contactId),
      this.isCompanyContactReachable(actor, customer.companyContactId),
    ]);
    if (reachable.includes(false)) {
      throw new ValidationError(ErrorCode.INVALID_QUOTE_CUSTOMER, 'Lead, contact or company is not available');
    }
  }

  private async isLeadReachable(actor: Actor, leadId?: string): Promise<boolean> {
    if (!leadId) return true;
    const lead = await this.leadRepository.findById(leadId);
    return lead !== null && can(actor, Action.LEAD_LIST, { ownerUserId: lead.assignedToId });
  }

  private async isContactReachable(actor: Actor, contactId?: string): Promise<boolean> {
    if (!contactId) return true;
    const contact = await this.contactRepository.findById(contactId);
    return contact !== null && can(actor, Action.CONTACT_LIST, { ownerUserId: contact.ownerId });
  }

  private async isCompanyContactReachable(actor: Actor, companyContactId?: string): Promise<boolean> {
    if (!companyContactId) return true;
    const company = await this.companyContactRepository.findById(companyContactId);
    return company !== null && can(actor, Action.COMPANY_CONTACT_LIST, { ownerUserId: company.ownerId });
  }

  /** Ítems resueltos, con su orden desde 1. */
  async resolveItems(
    actor: Actor,
    profile: TenantProfile,
    globalDiscountRate: Percentage,
    itemInputs: readonly QuoteItemInput[],
  ): Promise<QuoteItem[]> {
    const items: QuoteItem[] = [];
    for (const [index, itemInput] of itemInputs.entries()) {
      items.push(new QuoteItem(index + 1, await this.resolveItemData(profile, itemInput)));
    }
    this.assertDiscountsWithinRoleLimit(actor, profile, globalDiscountRate, items);
    return items;
  }

  /**
   * D-25 (Q-019): el descuento total de cada ítem (el suyo y el global seguidos) no puede superar el tope del rol.
   * Dueño y socio no tienen tope.
   *
   * @throws {ForbiddenError} `DISCOUNT_ABOVE_ROLE_LIMIT`.
   */
  assertDiscountsWithinRoleLimit(
    actor: Actor,
    profile: TenantProfile,
    globalDiscountRate: Percentage,
    items: readonly QuoteItem[],
  ): void {
    const limit = this.discountLimitFor(actor.role, profile);
    if (limit === undefined) return;
    const exceedsLimit = items.some((item) => item.discountRate.combinedWith(globalDiscountRate).isGreaterThan(limit));
    if (exceedsLimit) {
      throw new ForbiddenError(ErrorCode.DISCOUNT_ABOVE_ROLE_LIMIT, 'Discount is above the limit of your role');
    }
  }

  private discountLimitFor(role: Role, profile: TenantProfile): Percentage | undefined {
    if (role === Role.OWNER || role === Role.PARTNER) return undefined;
    if (role === Role.SALES_LEADER) return Percentage.fromDecimalString(profile.maximumDiscountRateSalesLeader);
    if (role === Role.SALES_REP) return Percentage.fromDecimalString(profile.maximumDiscountRateSalesRep);
    // Un rol que no conocemos no da descuentos.
    return Percentage.fromDecimalString(NO_DISCOUNT);
  }

  private async resolveItemData(profile: TenantProfile, input: QuoteItemInput): Promise<QuoteItemData> {
    const priceSource = input.productId ? await this.priceFromProduct(input.productId, input) : undefined;
    const requestedUnitPrice = input.unitPrice === undefined ? undefined : Money.fromDecimalString(input.unitPrice);
    const unitPrice = requestedUnitPrice ?? priceSource?.calculatedUnitPrice;
    if (unitPrice === undefined) {
      throw new ValidationError(ErrorCode.ITEM_PRICE_REQUIRED, 'An item without a product needs a unit price');
    }
    const description = input.description ?? priceSource?.productName;
    if (description === undefined) {
      throw new ValidationError(ErrorCode.MISSING_REQUIRED_DATA, 'An item without a product needs a description');
    }
    const taxText = input.taxRate ?? profile.defaultTaxRate;
    if (taxText === undefined) {
      throw new ValidationError(ErrorCode.TAX_RATE_REQUIRED, 'Tax rate is required: the company has no default');
    }

    return {
      productId: input.productId,
      description,
      quantity: input.quantity,
      variables: priceSource?.variables,
      calculatedUnitPrice: priceSource?.calculatedUnitPrice,
      unitPrice,
      priceOverrideReason: input.priceOverrideReason,
      discountRate: Percentage.fromDecimalString(input.discountRate ?? NO_DISCOUNT),
      taxRate: Percentage.fromDecimalString(taxText),
    };
  }

  /**
   * Precio del producto al cotizar: el de su fórmula con las variables del ítem, o su precio fijo.
   *
   * @throws {ValidationError} `PRODUCT_NOT_AVAILABLE` si no existe, es de otra empresa o está inactivo;
   * `INVALID_FORMULA_VARIABLE` si falta el valor de una variable.
   */
  private async priceFromProduct(productId: string, input: QuoteItemInput) {
    const product = await this.productRepository.findById(productId);
    if (!product || !product.isActive) {
      throw new ValidationError(ErrorCode.PRODUCT_NOT_AVAILABLE, 'Product is not available for quotes');
    }
    if (product.formulaId === undefined) {
      return { productName: product.name, calculatedUnitPrice: product.basePrice, variables: undefined };
    }

    const formula = await this.formulaRepository.findById(product.formulaId);
    // Puede pasar por datos (fórmula borrada tras asignarla): no es una invariante interna, es 400 y no 500 (F3-A20).
    if (!formula) throw new ValidationError(ErrorCode.PRODUCT_NOT_AVAILABLE, 'Formula of the product is not available');
    const providedVariables = new Map(Object.entries(input.variables ?? {}));
    // Solo las variables que declara la fórmula; lo demás que envíe el cliente no se guarda.
    const variables = Object.fromEntries(
      formula.variableNames.flatMap((name) => {
        const value = providedVariables.get(name);
        return value === undefined ? [] : [[name, value]];
      }),
    );
    const result = this.formulaEvaluator.evaluate(formula.expression, variables);
    return {
      productName: product.name,
      calculatedUnitPrice: Money.fromDecimalStringRounded(result),
      variables,
    };
  }
}
