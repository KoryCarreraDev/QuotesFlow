import { EmailLogEntry, IEmailLogRepository } from '@/application/ports/repositories/IEmailLogRepository.js';

/** Doble de `IEmailLogRepository`: guarda los envíos en memoria, en orden. */
export class InMemoryEmailLogRepository implements IEmailLogRepository {
  readonly entries: EmailLogEntry[] = [];

  async record(entry: EmailLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}
