import { AuditEntry, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';

/** Doble de `IAuditLogger`: guarda las entradas en memoria para comprobar qué audita cada caso de uso. */
export class RecordingAuditLogger implements IAuditLogger {
  readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
