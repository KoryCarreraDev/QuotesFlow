/** Correos transaccionales de la plataforma. El valor se guarda en `EmailLog.template`. */
export enum EmailTemplate {
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  USER_INVITATION = 'USER_INVITATION',
  ACCOUNT_ALREADY_REGISTERED = 'ACCOUNT_ALREADY_REGISTERED',
  /** Cotización que una empresa envía a su cliente, con el PDF adjunto (F3-T08). */
  QUOTE_SENT = 'QUOTE_SENT',
}

/** Datos que necesita cada plantilla. Todos son texto: el renderizador los escapa en el HTML. */
export interface EmailTemplateVariables {
  [EmailTemplate.EMAIL_VERIFICATION]: { firstName: string; actionUrl: string; expiresInHours: string };
  [EmailTemplate.PASSWORD_RESET]: { firstName: string; actionUrl: string; expiresInMinutes: string };
  [EmailTemplate.PASSWORD_CHANGED]: { firstName: string; resetUrl: string };
  [EmailTemplate.USER_INVITATION]: {
    inviterName: string;
    companyName: string;
    roleName: string;
    actionUrl: string;
    expiresInDays: string;
  };
  [EmailTemplate.ACCOUNT_ALREADY_REGISTERED]: { firstName: string; loginUrl: string; resetUrl: string };
  [EmailTemplate.QUOTE_SENT]: {
    customerName: string;
    companyName: string;
    senderName: string;
    quoteReference: string;
    /** Total ya formateado en pesos colombianos. */
    total: string;
    /** Fecha de vigencia ya formateada (`dd/mm/aaaa`). */
    validUntil: string;
  };
}

/** Correo listo para enviar, en español (R11: lo lee el cliente final). */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Convierte una plantilla y sus datos en el correo final (asunto, HTML y texto plano).
 * Toda implementación escapa los datos en el HTML: pueden venir del usuario (nombres, empresa).
 */
export interface IEmailTemplateRenderer {
  render<T extends EmailTemplate>(template: T, variables: EmailTemplateVariables[T]): RenderedEmail;
}
