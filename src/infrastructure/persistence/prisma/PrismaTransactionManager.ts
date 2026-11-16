import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, PrismaClient } from '@prisma/client';
import { ITransactionManager } from '../../../application/ports/services/ITransactionManager.js';

/** Cliente que pueden usar los repositorios: el de la transacción abierta o el raíz. */
export type PrismaDatabaseClient = PrismaClient | Prisma.TransactionClient;

// Una transacción por cadena asíncrona: dos peticiones simultáneas nunca comparten transacción.
const activeTransaction = new AsyncLocalStorage<Prisma.TransactionClient>();

/** Cliente de la transacción abierta en esta cadena asíncrona, si la hay. */
export function currentTransactionClient(): Prisma.TransactionClient | undefined {
  return activeTransaction.getStore();
}

/** Adaptador de `ITransactionManager` sobre `prisma.$transaction` interactivo. */
export class PrismaTransactionManager implements ITransactionManager {
  constructor(private readonly prisma: PrismaClient) {}

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (currentTransactionClient()) return work();

    return this.prisma.$transaction((transactionClient) => activeTransaction.run(transactionClient, work));
  }
}
