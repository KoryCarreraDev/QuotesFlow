import { IFileStorage, StoredFile } from '@/application/ports/services/IFileStorage.js';

/** Doble en memoria de `IFileStorage`. `failNextSave` / `failNextDelete` simulan un almacenamiento caído. */
export class InMemoryFileStorage implements IFileStorage {
  private readonly files = new Map<string, StoredFile>();
  failNextSave = false;
  failNextDelete = false;

  keys(): string[] {
    return [...this.files.keys()];
  }

  async save(key: string, content: Uint8Array, contentType: string): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error('simulated storage failure');
    }
    this.files.set(key, { content, contentType });
  }

  async read(key: string): Promise<StoredFile | null> {
    return this.files.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new Error('simulated storage failure');
    }
    this.files.delete(key);
  }
}
