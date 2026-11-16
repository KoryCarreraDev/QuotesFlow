import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';

/**
 * Gestor de transacciones para tests unitarios. No revierte nada (los repositorios en memoria no
 * tienen transacciones): solo registra si hay una transacción abierta, para comprobar qué escrituras
 * hace el caso de uso dentro de ella. La reversión real se prueba contra PostgreSQL en `integration/`.
 */
export class RecordingTransactionManager implements ITransactionManager {
  private openTransactionCount = 0;
  completedTransactionCount = 0;
  failedTransactionCount = 0;

  get isInsideTransaction(): boolean {
    return this.openTransactionCount > 0;
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.openTransactionCount += 1;
    try {
      const result = await work();
      this.completedTransactionCount += 1;
      return result;
    } catch (error) {
      this.failedTransactionCount += 1;
      throw error;
    } finally {
      this.openTransactionCount -= 1;
    }
  }
}
