import { describe, expect, it } from 'vitest';
import { EmailDeliveryStatus } from '@/application/ports/repositories/IEmailLogRepository.js';
import {
  EmailDeliveryError,
  EmailFailureReason,
  EmailMessage,
  IEmailService,
} from '@/application/ports/services/IEmailService.js';
import { EmailTemplate } from '@/application/ports/services/IEmailTemplateRenderer.js';
import { TransactionalEmailSender } from '@/application/services/TransactionalEmailSender.js';
import { CompiledEmailTemplateRenderer } from '@/infrastructure/email/CompiledEmailTemplateRenderer.js';
import { MemoryEmailOutbox, MemoryEmailService } from '@/infrastructure/email/LocalEmailServices.js';
import { DEFAULT_TEST_TENANT_ID } from '@tests/support/builders/entityBuilders.js';
import { InMemoryEmailLogRepository } from '@tests/support/doubles/InMemoryEmailLogRepository.js';
import { RecordingLogger } from '@tests/support/doubles/RecordingLogger.js';

// F2-T01: el envío de correos transaccionales nunca rompe la operación que lo pide y siempre deja rastro.

const RECIPIENT = { email: 'ana.gomez@example.com', tenantId: DEFAULT_TEST_TENANT_ID, userId: 'user-ana' };
const VERIFICATION_VARIABLES = {
  firstName: 'Ana',
  actionUrl: 'https://app.quotesflow.example/verify-email?token=secret-token',
  expiresInHours: '24',
};

class FailingEmailService implements IEmailService {
  constructor(private readonly failure: Error) {}

  async send(_message: EmailMessage): Promise<never> {
    throw this.failure;
  }
}

function setupSender(emailService: IEmailService) {
  const emailLogRepository = new InMemoryEmailLogRepository();
  const logger = new RecordingLogger();
  const sender = new TransactionalEmailSender(
    emailService,
    new CompiledEmailTemplateRenderer(),
    emailLogRepository,
    logger,
  );
  return { sender, emailLogRepository, logger };
}

describe('TransactionalEmailSender', () => {
  it('entrega el correo renderizado al destinatario y registra el envío con el id del proveedor', async () => {
    const outbox = new MemoryEmailOutbox();
    const { sender, emailLogRepository } = setupSender(new MemoryEmailService(outbox));

    const wasSent = await sender.send(RECIPIENT, EmailTemplate.EMAIL_VERIFICATION, VERIFICATION_VARIABLES);

    expect(wasSent).toBe(true);
    const [deliveredEmail] = outbox.sentTo(RECIPIENT.email);
    expect(deliveredEmail.subject).toBe('Confirma tu correo en QuotesFlow');
    expect(deliveredEmail.text).toContain(VERIFICATION_VARIABLES.actionUrl);
    expect(emailLogRepository.entries).toEqual([
      {
        tenantId: RECIPIENT.tenantId,
        userId: RECIPIENT.userId,
        template: EmailTemplate.EMAIL_VERIFICATION,
        recipient: RECIPIENT.email,
        status: EmailDeliveryStatus.SENT,
        providerMessageId: expect.stringMatching(/^memory-/),
      },
    ]);
  });

  it('el registro del envío nunca guarda el cuerpo ni el enlace con el token', async () => {
    const { sender, emailLogRepository } = setupSender(new MemoryEmailService(new MemoryEmailOutbox()));

    await sender.send(RECIPIENT, EmailTemplate.EMAIL_VERIFICATION, VERIFICATION_VARIABLES);

    expect(JSON.stringify(emailLogRepository.entries)).not.toContain('secret-token');
  });

  it('si el proveedor rechaza el correo, no lanza: devuelve false y registra el motivo', async () => {
    const rejection = new EmailDeliveryError(EmailFailureReason.PROVIDER_REJECTED, 'rejected with status 403');
    const { sender, emailLogRepository } = setupSender(new FailingEmailService(rejection));

    const wasSent = await sender.send(RECIPIENT, EmailTemplate.EMAIL_VERIFICATION, VERIFICATION_VARIABLES);

    expect(wasSent).toBe(false);
    expect(emailLogRepository.entries).toEqual([
      expect.objectContaining({
        status: EmailDeliveryStatus.FAILED,
        failureReason: EmailFailureReason.PROVIDER_REJECTED,
      }),
    ]);
  });

  it('un fallo inesperado del adaptador se registra como UNEXPECTED_ERROR', async () => {
    const { sender, emailLogRepository } = setupSender(new FailingEmailService(new Error('socket hang up')));

    await sender.send(RECIPIENT, EmailTemplate.EMAIL_VERIFICATION, VERIFICATION_VARIABLES);

    expect(emailLogRepository.entries[0].failureReason).toBe(EmailFailureReason.UNEXPECTED_ERROR);
  });

  it('el aviso técnico de un fallo no lleva el destinatario (dato personal)', async () => {
    const { sender, logger } = setupSender(new FailingEmailService(new Error('socket hang up')));

    await sender.send(RECIPIENT, EmailTemplate.EMAIL_VERIFICATION, VERIFICATION_VARIABLES);

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0].level).toBe('warn');
    expect(JSON.stringify(logger.entries[0].context)).not.toContain(RECIPIENT.email);
  });
});
