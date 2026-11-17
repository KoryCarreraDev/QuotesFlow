# Correo transaccional

## Propósito
Enviar los correos que la plataforma necesita para funcionar (verificar el correo, recuperar la contraseña, invitar usuarios, avisos de seguridad) y dejar constancia de cada envío. Lo usan los módulos de identidad de F2 (F2-T04, F2-T05); no tiene endpoints propios.

## Reglas de negocio
- Un fallo del proveedor nunca deshace la operación que pidió el correo: el registro o la invitación quedan guardados y el envío queda como `FAILED` en `EmailLog`, con el motivo. El usuario puede pedir que se reenvíe.
- Cada envío, bueno o fallido, queda en `EmailLog` con empresa, usuario (si ya existe), plantilla, destinatario, estado e id del proveedor. Nunca se guarda el cuerpo: los correos llevan enlaces con tokens de un solo uso.
- Los correos están en español (R11: los lee el cliente final). Las plantillas se escriben en MJML (D-28) para que se vean bien en Gmail, Outlook, Apple Mail y Yahoo.

| Plantilla | Cuándo | Datos |
|---|---|---|
| `EMAIL_VERIFICATION` | Al registrarse (F2-T04) | `firstName`, `actionUrl`, `expiresInHours` |
| `PASSWORD_RESET` | Al pedir recuperar la contraseña (F2-T04) | `firstName`, `actionUrl`, `expiresInMinutes` |
| `PASSWORD_CHANGED` | Tras cambiar la contraseña (F2-T04) | `firstName`, `resetUrl` |
| `USER_INVITATION` | Al invitar a un usuario (F2-T05) | `inviterName`, `companyName`, `roleName`, `actionUrl`, `expiresInDays` |
| `ACCOUNT_ALREADY_REGISTERED` | Registro con un correo que ya tiene cuenta (F2-T04, H8) | `firstName`, `loginUrl`, `resetUrl` |

## Cómo se usa
```ts
const emailSender = req.container!.email.getTransactionalEmailSender();
await emailSender.send(
  { email: user.email, tenantId: user.tenantId, userId: user.id },
  EmailTemplate.EMAIL_VERIFICATION,
  { firstName: user.firstName, actionUrl, expiresInHours: '24' },
);
```

## Plantillas
- Fuente: `src/infrastructure/email/templates/*.mjml` (más `partials/` de cabecera, pie y estilos).
- Tras cambiar una plantilla: `pnpm emails:build`, que regenera `src/infrastructure/email/compiledEmailTemplates.ts`. Un test falla si el archivo generado no coincide con las plantillas.
- Asunto, texto de vista previa y versión en texto plano están en `CompiledEmailTemplateRenderer.ts`.
- Plantilla nueva: valor en `EmailTemplate`, sus datos en `EmailTemplateVariables`, archivo MJML, entrada en `scripts/emails/emailTemplateSources.ts` y textos en el renderizador.

## Configuración
| Variable | Uso |
|---|---|
| `EMAIL_PROVIDER` | `resend` (producción), `log` (desarrollo: el texto del correo sale en el log, con sus enlaces) o `memory` (tests) |
| `RESEND_API_KEY` | Clave de la API de Resend. Hasta que Operaciones verifique el dominio se usa una clave de ejemplo: los envíos quedan como `FAILED` |
| `EMAIL_FROM` | Remitente verificado en Resend |
| `APP_BASE_URL` | URL del frontend con la que se arman los enlaces |

## Seguridad
- Los datos que pueden venir del usuario (nombres, empresa) se escapan en el HTML y el asunto no admite saltos de línea.
- La URL de Resend es fija en el código (API10); el adaptador no sigue redirecciones, tiene un plazo de 10 s y valida la respuesta con Zod.
- La clave de Resend solo llega por variable de entorno, nunca aparece en errores ni en logs: el error de axios no se adjunta como causa porque lleva la cabecera `Authorization`.
- El aviso técnico de un envío fallido no lleva el destinatario (dato personal); el destinatario queda solo en `EmailLog`.
