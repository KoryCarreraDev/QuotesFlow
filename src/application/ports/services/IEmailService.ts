/** Un correo a un único destinatario. */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Lo que devuelve el proveedor al aceptar el correo. */
export interface EmailDeliveryReceipt {
  /** Id del proveedor (Resend), para cruzar con sus registros y, en F4, con sus webhooks. */
  providerMessageId?: string;
}

/** Por qué no se pudo entregar un correo al proveedor. Se guarda en `EmailLog.failureReason`. */
export enum EmailFailureReason {
  /** El proveedor respondió con un error (clave inválida, dominio sin verificar, destinatario rechazado). */
  PROVIDER_REJECTED = 'PROVIDER_REJECTED',
  /** No hubo respuesta a tiempo o la red falló. */
  PROVIDER_UNREACHABLE = 'PROVIDER_UNREACHABLE',
  /** Cualquier otro fallo inesperado. */
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR',
}

/** El proveedor no aceptó el correo. El mensaje nunca lleva la clave de la API ni el cuerpo del correo. */
export class EmailDeliveryError extends Error {
  constructor(
    readonly reason: EmailFailureReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EmailDeliveryError';
  }
}

/**
 * Envía correos a través del proveedor (Resend en producción, F2-T01).
 *
 * @throws {EmailDeliveryError} Si el proveedor no acepta el correo.
 */
export interface IEmailService {
  send(message: EmailMessage): Promise<EmailDeliveryReceipt>;
}
