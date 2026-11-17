import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EmailFailureReason } from '@/application/ports/services/IEmailService.js';
import { EmailTemplate, EmailTemplateVariables } from '@/application/ports/services/IEmailTemplateRenderer.js';
import { CompiledEmailTemplateRenderer } from '@/infrastructure/email/CompiledEmailTemplateRenderer.js';
import { createEmailService } from '@/infrastructure/email/emailServiceFactory.js';
import { LogEmailService, MemoryEmailOutbox, MemoryEmailService } from '@/infrastructure/email/LocalEmailServices.js';
import { RESEND_API_BASE_URL, ResendEmailService } from '@/infrastructure/email/ResendEmailService.js';
import { RecordingLogger } from '@tests/support/doubles/RecordingLogger.js';

// F2-T01: plantillas (D-28), adaptador de Resend y adaptadores locales.

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const EXAMPLE_API_KEY = 're_example_key_only_for_tests';
const SENDER = 'QuotesFlow <no-reply@quotesflow.example>';
const UNREACHABLE_BASE_URL = 'http://127.0.0.1:1';
const LEFTOVER_PLACEHOLDER_PATTERN = /\{\{\s*\w+\s*\}\}/;

const sampleVariables: { [T in EmailTemplate]: EmailTemplateVariables[T] } = {
  [EmailTemplate.EMAIL_VERIFICATION]: {
    firstName: 'Ana',
    actionUrl: 'https://app.example/verify?token=t1',
    expiresInHours: '24',
  },
  [EmailTemplate.PASSWORD_RESET]: {
    firstName: 'Ana',
    actionUrl: 'https://app.example/reset?token=t2',
    expiresInMinutes: '30',
  },
  [EmailTemplate.PASSWORD_CHANGED]: { firstName: 'Ana', resetUrl: 'https://app.example/forgot-password' },
  [EmailTemplate.USER_INVITATION]: {
    inviterName: 'Carlos Pérez',
    companyName: 'Aluminios Andinos SAS',
    roleName: 'comercial',
    actionUrl: 'https://app.example/invitation?token=t3',
    expiresInDays: '7',
  },
  [EmailTemplate.ACCOUNT_ALREADY_REGISTERED]: {
    firstName: 'Ana',
    loginUrl: 'https://app.example/login',
    resetUrl: 'https://app.example/forgot-password',
  },
};

const message = { to: 'ana@example.com', subject: 'Asunto', html: '<p>Hola</p>', text: 'Hola' };

describe('CompiledEmailTemplateRenderer', () => {
  const renderer = new CompiledEmailTemplateRenderer();

  it.each(Object.values(EmailTemplate))('%s se renderiza sin marcadores pendientes, en HTML y en texto', (template) => {
    const renderedEmail = renderer.render(template, sampleVariables[template]);

    expect(renderedEmail.subject).not.toMatch(LEFTOVER_PLACEHOLDER_PATTERN);
    expect(renderedEmail.html).not.toMatch(LEFTOVER_PLACEHOLDER_PATTERN);
    expect(renderedEmail.text).not.toMatch(LEFTOVER_PLACEHOLDER_PATTERN);
    expect(renderedEmail.html).toContain('lang="es"');
  });

  it('el enlace de acción llega al HTML y al texto plano', () => {
    const renderedEmail = renderer.render(
      EmailTemplate.EMAIL_VERIFICATION,
      sampleVariables[EmailTemplate.EMAIL_VERIFICATION],
    );

    expect(renderedEmail.html).toContain('href="https://app.example/verify?token=t1"');
    expect(renderedEmail.text).toContain('https://app.example/verify?token=t1');
  });

  it('escapa en el HTML los datos que pueden venir del usuario', () => {
    const renderedEmail = renderer.render(EmailTemplate.USER_INVITATION, {
      ...sampleVariables[EmailTemplate.USER_INVITATION],
      companyName: '<script>alert("x")</script>',
    });

    expect(renderedEmail.html).not.toContain('<script>');
    expect(renderedEmail.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('quita los saltos de línea del asunto: un nombre no puede añadir cabeceras', () => {
    const renderedEmail = renderer.render(EmailTemplate.USER_INVITATION, {
      ...sampleVariables[EmailTemplate.USER_INVITATION],
      inviterName: 'Carlos\r\nBcc: victima@example.com',
    });

    expect(renderedEmail.subject).not.toMatch(/[\r\n]/);
  });

  it('falla si falta un dato de la plantilla, en lugar de enviar el marcador', () => {
    const incompleteVariables = { firstName: 'Ana' } as EmailTemplateVariables[EmailTemplate.EMAIL_VERIFICATION];

    expect(() => renderer.render(EmailTemplate.EMAIL_VERIFICATION, incompleteVariables)).toThrow(
      'Email template variable is missing',
    );
  });
});

describe('ResendEmailService', () => {
  interface ReceivedRequest {
    authorization?: string;
    body: Record<string, unknown>;
  }
  const receivedRequests: ReceivedRequest[] = [];
  let respondWith: { status: number; body: unknown } = { status: HTTP_OK, body: { id: 'resend-message-id' } };
  let fakeResendServer: Server;
  let fakeResendBaseUrl: string;

  beforeAll(async () => {
    const fakeResend = express();
    fakeResend.use(express.json());
    fakeResend.post('/emails', (request, response) => {
      receivedRequests.push({ authorization: request.get('authorization'), body: request.body });
      response.status(respondWith.status).json(respondWith.body);
    });
    await new Promise<void>((resolve) => {
      fakeResendServer = fakeResend.listen(0, '127.0.0.1', () => resolve());
    });
    fakeResendBaseUrl = `http://127.0.0.1:${(fakeResendServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => fakeResendServer.close(resolve));
  });

  beforeEach(() => {
    receivedRequests.length = 0;
    respondWith = { status: HTTP_OK, body: { id: 'resend-message-id' } };
  });

  function serviceAgainstFakeResend() {
    return new ResendEmailService({ apiKey: EXAMPLE_API_KEY, from: SENDER, baseUrl: fakeResendBaseUrl });
  }

  it('envía remitente, destinatario, asunto, HTML y texto con la clave como Bearer, y devuelve el id', async () => {
    const receipt = await serviceAgainstFakeResend().send(message);

    expect(receipt).toEqual({ providerMessageId: 'resend-message-id' });
    expect(receivedRequests).toEqual([
      {
        authorization: `Bearer ${EXAMPLE_API_KEY}`,
        body: { from: SENDER, to: ['ana@example.com'], subject: 'Asunto', html: '<p>Hola</p>', text: 'Hola' },
      },
    ]);
  });

  it('un rechazo de Resend es PROVIDER_REJECTED y el error no lleva la clave', async () => {
    respondWith = { status: HTTP_FORBIDDEN, body: { message: 'domain not verified' } };

    const failure = await serviceAgainstFakeResend()
      .send(message)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ reason: EmailFailureReason.PROVIDER_REJECTED });
    expect(JSON.stringify(failure)).not.toContain(EXAMPLE_API_KEY);
    expect((failure as Error).message).not.toContain(EXAMPLE_API_KEY);
    expect((failure as Error).cause).toBeUndefined();
  });

  it('una respuesta sin id es UNEXPECTED_ERROR (respuesta validada, API10)', async () => {
    respondWith = { status: HTTP_OK, body: { unexpected: true } };

    await expect(serviceAgainstFakeResend().send(message)).rejects.toMatchObject({
      reason: EmailFailureReason.UNEXPECTED_ERROR,
    });
  });

  it('si Resend no responde es PROVIDER_UNREACHABLE', async () => {
    const service = new ResendEmailService({ apiKey: EXAMPLE_API_KEY, from: SENDER, baseUrl: UNREACHABLE_BASE_URL });

    await expect(service.send(message)).rejects.toMatchObject({ reason: EmailFailureReason.PROVIDER_UNREACHABLE });
  });

  it('por defecto apunta a la URL fija de Resend', () => {
    expect(RESEND_API_BASE_URL).toBe('https://api.resend.com');
  });
});

describe('adaptadores locales de correo', () => {
  it('MemoryEmailService guarda el correo en su bandeja', async () => {
    const outbox = new MemoryEmailOutbox();

    await new MemoryEmailService(outbox).send(message);

    expect(outbox.sentTo('ana@example.com')).toEqual([message]);
  });

  it('MemoryEmailOutbox.clear vacía la bandeja', async () => {
    const outbox = new MemoryEmailOutbox();
    await new MemoryEmailService(outbox).send(message);

    outbox.clear();

    expect(outbox.sentTo('ana@example.com')).toEqual([]);
  });

  it('LogEmailService escribe el texto del correo en el log, para abrir sus enlaces en desarrollo', async () => {
    const logger = new RecordingLogger();

    await new LogEmailService(logger).send(message);

    expect(logger.entries).toEqual([
      expect.objectContaining({ level: 'info', context: expect.objectContaining({ body: 'Hola' }) }),
    ]);
  });
});

describe('createEmailService', () => {
  const logger = new RecordingLogger();

  it.each([
    ['memory', MemoryEmailService],
    ['log', LogEmailService],
    ['resend', ResendEmailService],
  ] as const)('con EMAIL_PROVIDER=%s crea su adaptador', (provider, adapterType) => {
    const emailService = createEmailService(
      { EMAIL_PROVIDER: provider, RESEND_API_KEY: EXAMPLE_API_KEY, EMAIL_FROM: SENDER },
      logger,
    );

    expect(emailService).toBeInstanceOf(adapterType);
  });

  it('con Resend y sin clave no crea el adaptador', () => {
    expect(() => createEmailService({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: SENDER }, logger)).toThrow(
      'RESEND_API_KEY is required',
    );
  });
});
