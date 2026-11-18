import { EmailDeliveryStatus, IEmailLogRepository } from '../ports/repositories/IEmailLogRepository.js';
import {
  EmailAttachment,
  EmailDeliveryError,
  EmailFailureReason,
  IEmailService,
} from '../ports/services/IEmailService.js';
import {
  EmailTemplate,
  EmailTemplateVariables,
  IEmailTemplateRenderer,
} from '../ports/services/IEmailTemplateRenderer.js';
import { ILogger } from '../ports/services/ILogger.js';

/** A quién va un correo transaccional. */
export interface EmailRecipient {
  email: string;
  tenantId: string;
  userId?: string;
}

/**
 * Envía un correo transaccional (F2-T01): renderiza la plantilla, la entrega al proveedor y deja el envío en
 * `EmailLog`, haya ido bien o mal.
 *
 * Nunca lanza por un fallo del proveedor: un correo que no sale no debe deshacer un registro o una invitación
 * ya guardados; el usuario puede pedir que se reenvíe. Devuelve si el proveedor lo aceptó.
 */
export class TransactionalEmailSender {
  constructor(
    private readonly emailService: IEmailService,
    private readonly templateRenderer: IEmailTemplateRenderer,
    private readonly emailLogRepository: IEmailLogRepository,
    private readonly logger: ILogger,
  ) {}

  async send<T extends EmailTemplate>(
    recipient: EmailRecipient,
    template: T,
    variables: EmailTemplateVariables[T],
    attachments?: EmailAttachment[],
  ): Promise<boolean> {
    const renderedEmail = this.templateRenderer.render(template, variables);
    const logEntry = { tenantId: recipient.tenantId, userId: recipient.userId, template, recipient: recipient.email };

    try {
      const receipt = await this.emailService.send({ to: recipient.email, ...renderedEmail, attachments });
      await this.emailLogRepository.record({
        ...logEntry,
        status: EmailDeliveryStatus.SENT,
        providerMessageId: receipt.providerMessageId,
      });
      return true;
    } catch (error) {
      const failureReason = error instanceof EmailDeliveryError ? error.reason : EmailFailureReason.UNEXPECTED_ERROR;
      // El log técnico no lleva el destinatario: es un dato personal y ya queda en EmailLog.
      this.logger.warn('Transactional email was not delivered', { template, failureReason, error });
      await this.emailLogRepository.record({ ...logEntry, status: EmailDeliveryStatus.FAILED, failureReason });
      return false;
    }
  }
}
