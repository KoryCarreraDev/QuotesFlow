import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import {
  EmailDeliveryError,
  EmailAttachment,
  EmailDeliveryReceipt,
  EmailFailureReason,
  EmailMessage,
  IEmailService,
} from '../../application/ports/services/IEmailService.js';

/** URL fija de la API de Resend: no sale de la configuración, así nadie puede desviar los envíos (API10). */
export const RESEND_API_BASE_URL = 'https://api.resend.com';
const SEND_EMAIL_PATH = '/emails';
// Un envío más lento deja colgada la petición del usuario; se registra como fallido y se puede reintentar.
const REQUEST_TIMEOUT_MS = 10_000;

const sendEmailResponseSchema = z.object({ id: z.string().min(1) });

export interface ResendEmailServiceOptions {
  apiKey: string;
  /** Remitente verificado en Resend, p. ej. `QuotesFlow <no-reply@quotesflow.co>`. */
  from: string;
  /** Solo para los tests, que apuntan a un servidor local; en la aplicación siempre `RESEND_API_BASE_URL`. */
  baseUrl?: string;
}

/** Adaptador de `IEmailService` sobre la API REST de Resend (F2-T01). */
export class ResendEmailService implements IEmailService {
  private readonly httpClient: AxiosInstance;

  constructor(private readonly options: ResendEmailServiceOptions) {
    this.httpClient = axios.create({
      baseURL: options.baseUrl ?? RESEND_API_BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      // Una redirección podría llevarse la clave a otro servidor.
      maxRedirects: 0,
    });
  }

  /** @throws {EmailDeliveryError} Si Resend rechaza el correo, no responde o responde algo inesperado. */
  async send(message: EmailMessage): Promise<EmailDeliveryReceipt> {
    let responseBody: unknown;
    try {
      const response = await this.httpClient.post(SEND_EMAIL_PATH, {
        from: this.options.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.attachments && { attachments: message.attachments.map(toResendAttachment) }),
      });
      responseBody = response.data;
    } catch (error) {
      throw toDeliveryError(error);
    }

    const parsedBody = sendEmailResponseSchema.safeParse(responseBody);
    if (!parsedBody.success) {
      throw new EmailDeliveryError(EmailFailureReason.UNEXPECTED_ERROR, 'Email provider returned an unexpected body');
    }
    return { providerMessageId: parsedBody.data.id };
  }
}

/** Resend recibe el contenido del adjunto en base64. */
function toResendAttachment(attachment: EmailAttachment) {
  return { filename: attachment.fileName, content: Buffer.from(attachment.content).toString('base64') };
}

// El error de axios lleva la configuración de la petición, con la cabecera Authorization: no se adjunta como
// `cause`, para que la clave nunca llegue a un log.
function toDeliveryError(error: unknown): EmailDeliveryError {
  if (axios.isAxiosError(error) && error.response) {
    return new EmailDeliveryError(
      EmailFailureReason.PROVIDER_REJECTED,
      `Email provider rejected the message with status ${error.response.status}`,
    );
  }
  if (axios.isAxiosError(error)) {
    return new EmailDeliveryError(EmailFailureReason.PROVIDER_UNREACHABLE, 'Email provider did not respond');
  }
  return new EmailDeliveryError(EmailFailureReason.UNEXPECTED_ERROR, 'Email could not be sent');
}
