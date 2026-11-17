import { describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { EmailDeliveryStatus } from '@/application/ports/repositories/IEmailLogRepository.js';
import { EmailFailureReason } from '@/application/ports/services/IEmailService.js';
import { EmailTemplate } from '@/application/ports/services/IEmailTemplateRenderer.js';
import { PrismaEmailLogRepository } from '@/infrastructure/persistence/repositories/PrismaEmailLogRepository.js';
import { persistTenant, persistUser } from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

// F2-T01: historial de envíos de correo. El tenant llega en la entrada (registro y recuperación no tienen sesión).

describe('PrismaEmailLogRepository', () => {
  it('guarda un envío correcto con su tenant, usuario, plantilla, destinatario e id del proveedor', async () => {
    const tenant = await persistTenant();
    const user = await persistUser(tenant.id);
    const otherTenant = await persistTenant({ name: 'Otra Empresa SAS' });
    const repository = new PrismaEmailLogRepository(prisma, new FixedTenantContext(otherTenant.id));

    await repository.record({
      tenantId: tenant.id,
      userId: user.id,
      template: EmailTemplate.EMAIL_VERIFICATION,
      recipient: user.email,
      status: EmailDeliveryStatus.SENT,
      providerMessageId: 'resend-message-id',
    });

    await expect(prisma.emailLog.findMany()).resolves.toEqual([
      expect.objectContaining({
        tenantId: tenant.id,
        userId: user.id,
        template: 'EMAIL_VERIFICATION',
        recipient: user.email,
        status: 'SENT',
        providerMessageId: 'resend-message-id',
        failureReason: null,
      }),
    ]);
  });

  it('guarda un envío fallido sin usuario, con el motivo', async () => {
    const tenant = await persistTenant();
    const repository = new PrismaEmailLogRepository(prisma, new FixedTenantContext(tenant.id));

    await repository.record({
      tenantId: tenant.id,
      template: EmailTemplate.USER_INVITATION,
      recipient: 'invitado@example.com',
      status: EmailDeliveryStatus.FAILED,
      failureReason: EmailFailureReason.PROVIDER_UNREACHABLE,
    });

    await expect(prisma.emailLog.findFirstOrThrow()).resolves.toMatchObject({
      userId: null,
      status: 'FAILED',
      failureReason: 'PROVIDER_UNREACHABLE',
    });
  });
});
