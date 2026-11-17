import { IEmailService } from '../../application/ports/services/IEmailService.js';
import { ILogger } from '../../application/ports/services/ILogger.js';
import type { Environment } from '../../config/env.js';
import { LogEmailService, MemoryEmailService } from './LocalEmailServices.js';
import { ResendEmailService } from './ResendEmailService.js';

type EmailEnvironment = Pick<Environment, 'EMAIL_PROVIDER' | 'RESEND_API_KEY' | 'EMAIL_FROM'>;

/**
 * Adaptador de correo según `EMAIL_PROVIDER` (F2-T01). `env.ts` ya garantizó que con `resend` hay clave y
 * remitente, y que en producción no se usa otro proveedor.
 *
 * @throws {Error} Si falta la clave de Resend: solo pasaría si se salta la validación de `env.ts`.
 */
export function createEmailService(environment: EmailEnvironment, logger: ILogger): IEmailService {
  if (environment.EMAIL_PROVIDER === 'memory') return new MemoryEmailService();
  if (environment.EMAIL_PROVIDER === 'log') return new LogEmailService(logger);
  if (!environment.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required with EMAIL_PROVIDER=resend');
  return new ResendEmailService({ apiKey: environment.RESEND_API_KEY, from: environment.EMAIL_FROM });
}
