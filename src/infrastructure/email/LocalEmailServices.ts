import { randomUUID } from 'node:crypto';
import { EmailDeliveryReceipt, EmailMessage, IEmailService } from '../../application/ports/services/IEmailService.js';
import { ILogger } from '../../application/ports/services/ILogger.js';

// Adaptadores de `IEmailService` que no envían nada. `env.ts` impide usarlos en producción: allí un correo
// de verificación que no sale deja la cuenta inservible.

/**
 * Desarrollo local (`EMAIL_PROVIDER=log`): escribe el correo en el log técnico, con su texto, para poder
 * abrir los enlaces de verificación sin una cuenta de Resend.
 */
export class LogEmailService implements IEmailService {
  constructor(private readonly logger: ILogger) {}

  async send(message: EmailMessage): Promise<EmailDeliveryReceipt> {
    this.logger.info('Email not sent: EMAIL_PROVIDER=log', {
      recipient: message.to,
      subject: message.subject,
      body: message.text,
      // Solo el nombre y el tamaño: el contenido de un adjunto no se escribe en un log.
      attachments: message.attachments?.map(({ fileName, content }) => ({ fileName, bytes: content.length })),
    });
    return { providerMessageId: `log-${randomUUID()}` };
  }
}

/** Bandeja de salida en memoria del proceso; los tests de API leen de ella el correo que recibiría el usuario. */
export class MemoryEmailOutbox {
  private readonly messages: EmailMessage[] = [];

  add(message: EmailMessage): void {
    this.messages.push(message);
  }

  /** Correos enviados a la dirección, del más antiguo al más reciente. */
  sentTo(recipient: string): EmailMessage[] {
    return this.messages.filter((message) => message.to === recipient);
  }

  clear(): void {
    this.messages.length = 0;
  }
}

/** Única bandeja del proceso, compartida por todas las peticiones (`EMAIL_PROVIDER=memory`). */
export const memoryEmailOutbox = new MemoryEmailOutbox();

/** Tests (`EMAIL_PROVIDER=memory`): guarda el correo en `memoryEmailOutbox`. */
export class MemoryEmailService implements IEmailService {
  constructor(private readonly outbox: MemoryEmailOutbox = memoryEmailOutbox) {}

  async send(message: EmailMessage): Promise<EmailDeliveryReceipt> {
    this.outbox.add(message);
    return { providerMessageId: `memory-${randomUUID()}` };
  }
}
