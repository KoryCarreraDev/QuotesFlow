// F3-T05: cotizaciones. Importes y porcentajes viajan como texto decimal (F3-T01), nunca como number.

/** Ítem que envía el cliente de la API. Con `productId`, el precio sale del producto o de su fórmula. */
export interface QuoteItemInput {
  productId?: string;
  /** Sin `productId` es obligatoria; con él, por defecto el nombre del producto. */
  description?: string;
  quantity: number;
  /** Variables de la fórmula del producto (`{ "ancho": "1.20" }`). */
  variables?: Record<string, string>;
  /** Precio unitario antes de IVA. Sin `productId` es obligatorio; con él, cambia el calculado (D-24). */
  unitPrice?: string;
  /** Obligatorio si `unitPrice` difiere del precio calculado del producto. */
  priceOverrideReason?: string;
  discountRate?: string;
  /** Por defecto, el IVA configurado por la empresa; si no hay, es obligatorio (Q-020). */
  taxRate?: string;
}

/** Contenido de una cotización nueva. */
export interface CreateQuoteInput {
  leadId?: string;
  contactId?: string;
  companyContactId?: string;
  /** Último día de vigencia (`AAAA-MM-DD`). Por defecto, 30 días desde hoy en la zona horaria de la empresa. */
  validUntil?: string;
  /** Descuento global en porcentaje, después del descuento de cada ítem. */
  discountRate?: string;
  notes?: string;
  items: QuoteItemInput[];
}

/** Modificación parcial de un borrador. `null` quita el cliente o las notas; `items` reemplaza todos los ítems. */
export interface UpdateQuoteInput {
  leadId?: string | null;
  contactId?: string | null;
  companyContactId?: string | null;
  validUntil?: string;
  discountRate?: string;
  notes?: string | null;
  items?: QuoteItemInput[];
}

export interface QuoteItemDTO {
  position: number;
  productId?: string;
  description: string;
  quantity: number;
  variables?: Record<string, string>;
  /** Precio que dio el producto o su fórmula; sin producto no hay. */
  calculatedUnitPrice?: string;
  unitPrice: string;
  /** D-24: el comercial cambió el precio calculado. */
  isPriceOverridden: boolean;
  priceOverrideReason?: string;
  discountRate: string;
  taxRate: string;
  /** Base del IVA, con descuentos. */
  netAmount: string;
  taxAmount: string;
  total: string;
}

export interface QuoteDTO {
  id: string;
  /** Consecutivo por empresa; las versiones lo comparten. */
  number: number;
  /** `COT-000123`, y `COT-000123 v2` desde la segunda versión (Q-018). */
  reference: string;
  version: number;
  /** Estado guardado. */
  status: string;
  /** Estado que ve el usuario: igual que `status`, salvo `EXPIRED` para una enviada con la vigencia pasada. */
  displayStatus: string;
  leadId?: string;
  contactId?: string;
  companyContactId?: string;
  validUntil: string;
  discountRate: string;
  notes?: string;
  items: QuoteItemDTO[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  createdById: string;
  previousVersionId?: string;
  sentAt?: Date;
  decidedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Datos opcionales al enviar una cotización (F3-T08). */
export interface SendQuoteInput {
  /** Correo al que se manda con el canal de correo activado; por defecto, el del cliente de la cotización. */
  recipientEmail?: string;
}

/** La cotización enviada y si además salió un correo al cliente (solo con el canal de correo de la empresa activo). */
export interface SendQuoteResult extends QuoteDTO {
  emailed: boolean;
}

/** Datos opcionales al aceptar una cotización (F3-T09). */
export interface AcceptQuoteInput {
  /** Con una cotización de un lead abierto, pasa el lead al estado ganado de la empresa. Por defecto no. */
  markLeadAsWon?: boolean;
}

/** La cotización aceptada y si el lead pasó a ganado. */
export interface AcceptQuoteResult extends QuoteDTO {
  leadMarkedAsWon: boolean;
}
