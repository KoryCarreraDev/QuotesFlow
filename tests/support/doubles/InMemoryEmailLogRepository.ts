import { EmailLogEntry, IEmailLogRepository } from '@/application/ports/repositories/IEmailLogRepository.js';

/** Doble de `IEmailLogRepository`: guarda los envíos en memoria, en orden. */
export class InMemoryEmailLogRepository implements IEmailLogRepository {
  readonly entries: EmailLogEntry[] = [];
  /** Id de cada envío, en el mismo orden que `entries`. */
  readonly ids: string[] = [];

  async record(entry: EmailLogEntry): Promise<string> {
    this.entries.push(entry);
    const id = `email-log-${this.entries.length}`;
    this.ids.push(id);
    return id;
  }
}
