import { EmailFailureReason } from '../services/IEmailService.js';
import { EmailTemplate } from '../services/IEmailTemplateRenderer.js';

/** Resultado de un envío. */
export enum EmailDeliveryStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
}

/**
 * Un envío de correo. Nunca guarda el cuerpo: los correos llevan enlaces con tokens de un solo uso.
 */
export interface EmailLogEntry {
  /** Empresa a la que pertenece el envío; explícita porque registro y recuperación no tienen sesión. */
  tenantId: string;
  /** Usuario destinatario, si ya existe (una invitación aún no tiene usuario). */
  userId?: string;
  template: EmailTemplate;
  recipient: string;
  status: EmailDeliveryStatus;
  providerMessageId?: string;
  failureReason?: EmailFailureReason;
}

/** Registro de envíos de correo (`EmailLog`, F2-T01). Solo se añaden filas: es un historial. */
export interface IEmailLogRepository {
  /** Guarda el envío y devuelve su id, para que quien lo pidió (por ejemplo, la auditoría de una cotización) lo enlace. */
  record(entry: EmailLogEntry): Promise<string>;
}
