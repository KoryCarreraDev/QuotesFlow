import { TransactionalEmailSender } from '../../application/services/TransactionalEmailSender.js';
import { env } from '../../config/env.js';
import { CompiledEmailTemplateRenderer } from '../../infrastructure/email/CompiledEmailTemplateRenderer.js';
import { createEmailService } from '../../infrastructure/email/emailServiceFactory.js';
import { appLogger } from '../../infrastructure/logging/appLogger.js';
import { PrismaEmailLogRepository } from '../../infrastructure/persistence/repositories/PrismaEmailLogRepository.js';
import { ModuleDependencies } from './ModuleDependencies.js';

// Uno por proceso: el adaptador de Resend reutiliza su cliente HTTP y la bandeja en memoria es compartida.
const emailService = createEmailService(env, appLogger);
const templateRenderer = new CompiledEmailTemplateRenderer();

/** Correos transaccionales (F2-T01): plantillas, proveedor y registro de envíos. */
export class EmailModule {
  constructor(private readonly dependencies: ModuleDependencies) {}

  getTransactionalEmailSender(): TransactionalEmailSender {
    return new TransactionalEmailSender(
      emailService,
      templateRenderer,
      new PrismaEmailLogRepository(this.dependencies.prisma, this.dependencies.tenantContext),
      appLogger,
    );
  }
}
