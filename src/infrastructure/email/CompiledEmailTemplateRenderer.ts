import {
  EmailTemplate,
  EmailTemplateVariables,
  IEmailTemplateRenderer,
  RenderedEmail,
} from '../../application/ports/services/IEmailTemplateRenderer.js';
import { compiledEmailTemplates } from './compiledEmailTemplates.js';

// MJML reformatea el texto y puede dejar `{{ nombre }}` con espacios: se aceptan las dos formas.
const PLACEHOLDER_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;
const HTML_SPECIAL_CHARACTERS = /[&<>"']/g;
const LINE_BREAK_PATTERN = /[\r\n]+/g;
const PREVIEW_VARIABLE = 'preview';

const HTML_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

/** Escapa un dato para el HTML: un nombre como `<script>` llega como texto, nunca como marcado. */
function escapeHtml(value: string): string {
  return value.replace(HTML_SPECIAL_CHARACTERS, (character) => HTML_ESCAPES.get(character) ?? character);
}

function keepAsIs(value: string): string {
  return value;
}

/** Asunto, vista previa y texto plano de cada plantilla. El HTML sale de las plantillas MJML (D-28). */
interface TemplateCopy {
  subject: string;
  preview: string;
  text: string;
}

const COPY_BY_TEMPLATE: ReadonlyMap<EmailTemplate, TemplateCopy> = new Map([
  [
    EmailTemplate.EMAIL_VERIFICATION,
    {
      subject: 'Confirma tu correo en QuotesFlow',
      preview: 'Confirma tu correo para empezar a usar QuotesFlow.',
      text: [
        'Hola, {{firstName}}:',
        '',
        'Para empezar a usar QuotesFlow, confirma que este es tu correo abriendo este enlace:',
        '{{actionUrl}}',
        '',
        'El enlace vence en {{expiresInHours}} horas y solo sirve una vez.',
        '',
        'Si no fuiste tú, ignora este correo.',
      ].join('\n'),
    },
  ],
  [
    EmailTemplate.PASSWORD_RESET,
    {
      subject: 'Cambia tu contraseña de QuotesFlow',
      preview: 'Elige una contraseña nueva para tu cuenta.',
      text: [
        'Hola, {{firstName}}:',
        '',
        'Recibimos una solicitud para cambiar la contraseña de tu cuenta. Elige una nueva aquí:',
        '{{actionUrl}}',
        '',
        'El enlace vence en {{expiresInMinutes}} minutos y solo sirve una vez.',
        'Si no lo pediste tú, ignora este correo: tu contraseña sigue igual.',
      ].join('\n'),
    },
  ],
  [
    EmailTemplate.PASSWORD_CHANGED,
    {
      subject: 'Tu contraseña de QuotesFlow cambió',
      preview: 'La contraseña de tu cuenta acaba de cambiar.',
      text: [
        'Hola, {{firstName}}:',
        '',
        'La contraseña de tu cuenta de QuotesFlow acaba de cambiar y cerramos todas tus sesiones abiertas.',
        '',
        'Si no fuiste tú, recupera el acceso ahora mismo y avisa al administrador de tu empresa:',
        '{{resetUrl}}',
      ].join('\n'),
    },
  ],
  [
    EmailTemplate.USER_INVITATION,
    {
      subject: '{{inviterName}} te invitó a {{companyName}} en QuotesFlow',
      preview: 'Acepta la invitación para unirte a tu equipo.',
      text: [
        'Hola:',
        '',
        '{{inviterName}} te invitó a unirte a {{companyName}} en QuotesFlow como {{roleName}}.',
        'Acepta la invitación aquí:',
        '{{actionUrl}}',
        '',
        'La invitación vence en {{expiresInDays}} días y solo sirve una vez.',
      ].join('\n'),
    },
  ],
  [
    EmailTemplate.ACCOUNT_ALREADY_REGISTERED,
    {
      subject: 'Ya tienes una cuenta en QuotesFlow',
      preview: 'Alguien intentó registrarse con tu correo.',
      text: [
        'Hola, {{firstName}}:',
        '',
        'Alguien intentó registrar una empresa nueva en QuotesFlow con tu correo, pero ya tienes una cuenta.',
        '',
        'Inicia sesión: {{loginUrl}}',
        'Recupera tu contraseña: {{resetUrl}}',
        '',
        'Si no fuiste tú, ignora este correo.',
      ].join('\n'),
    },
  ],
  [
    EmailTemplate.QUOTE_SENT,
    {
      subject: 'Cotización {{quoteReference}} de {{companyName}}',
      preview: 'Adjuntamos tu cotización en PDF.',
      text: [
        'Hola, {{customerName}}:',
        '',
        '{{senderName}} de {{companyName}} te envía la cotización {{quoteReference}}. La encuentras adjunta en PDF.',
        '',
        'Total: {{total}}',
        'Válida hasta el {{validUntil}}.',
        '',
        'Si tienes preguntas, responde a quien te la envió o contacta a {{companyName}}.',
        '',
        'Este correo se envió con QuotesFlow en nombre de {{companyName}}.',
      ].join('\n'),
    },
  ],
]);

function fillPlaceholders(
  source: string,
  values: ReadonlyMap<string, string>,
  escape: (value: string) => string,
): string {
  return source.replace(PLACEHOLDER_PATTERN, (_placeholder, name: string) => {
    const value = values.get(name);
    // Un marcador sin dato es un fallo de programación: mejor no enviar que enviar "{{actionUrl}}".
    if (value === undefined) throw new Error(`Email template variable is missing: ${name}`);
    return escape(value);
  });
}

/**
 * Renderizador de `IEmailTemplateRenderer` sobre el HTML que genera `pnpm emails:build` desde MJML (D-28).
 * Escapa los datos en el HTML y quita los saltos de línea del asunto.
 */
export class CompiledEmailTemplateRenderer implements IEmailTemplateRenderer {
  render<T extends EmailTemplate>(template: T, variables: EmailTemplateVariables[T]): RenderedEmail {
    const copy = COPY_BY_TEMPLATE.get(template);
    const html = compiledEmailTemplates.get(template);
    if (!copy || !html) throw new Error(`Email template is not compiled: ${template}`);

    const values = new Map<string, string>(Object.entries(variables));
    values.set(PREVIEW_VARIABLE, copy.preview);

    return {
      subject: fillPlaceholders(copy.subject, values, keepAsIs).replace(LINE_BREAK_PATTERN, ' '),
      html: fillPlaceholders(html, values, escapeHtml),
      text: fillPlaceholders(copy.text, values, keepAsIs),
    };
  }
}
