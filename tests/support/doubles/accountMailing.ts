import { AccountLinks } from '@/application/services/AccountLinks.js';
import { AccountTokenIssuer } from '@/application/services/AccountTokenIssuer.js';
import { TransactionalEmailSender } from '@/application/services/TransactionalEmailSender.js';
import { CompiledEmailTemplateRenderer } from '@/infrastructure/email/CompiledEmailTemplateRenderer.js';
import { MemoryEmailOutbox, MemoryEmailService } from '@/infrastructure/email/LocalEmailServices.js';
import { InMemoryAccountTokenRepository } from './InMemoryAccountTokenRepository.js';
import { InMemoryEmailLogRepository } from './InMemoryEmailLogRepository.js';
import { RecordingLogger } from './RecordingLogger.js';

export const TEST_APP_BASE_URL = 'https://app.quotesflow.test';
const TOKEN_IN_LINK_PATTERN = /#token=([^\s"&]+)/;

/**
 * Correo y tokens de cuenta en memoria para los tests unitarios de F2-T04 y F2-T05: el correo que recibiría el
 * usuario queda en `outbox`, y `tokenSentTo` saca el token de su enlace.
 */
export function createAccountMailing() {
  const outbox = new MemoryEmailOutbox();
  const accountTokenRepository = new InMemoryAccountTokenRepository();
  const emailLogRepository = new InMemoryEmailLogRepository();
  const emailSender = new TransactionalEmailSender(
    new MemoryEmailService(outbox),
    new CompiledEmailTemplateRenderer(),
    emailLogRepository,
    new RecordingLogger(),
  );
  return {
    outbox,
    accountTokenRepository,
    emailLogRepository,
    accountTokenIssuer: new AccountTokenIssuer(accountTokenRepository),
    emailSender,
    accountLinks: new AccountLinks(TEST_APP_BASE_URL),
    /** Token del último enlace enviado a la dirección, o `undefined` si no recibió ninguno. */
    tokenSentTo(recipient: string): string | undefined {
      const lastEmail = outbox.sentTo(recipient).at(-1);
      const match = lastEmail ? TOKEN_IN_LINK_PATTERN.exec(lastEmail.text) : null;
      return match ? decodeURIComponent(match[1]) : undefined;
    },
  };
}
