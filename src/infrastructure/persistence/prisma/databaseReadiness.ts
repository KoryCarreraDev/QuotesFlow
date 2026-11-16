import { PrismaClient } from '@prisma/client';
import { ILogger } from '../../../application/ports/services/ILogger.js';

// Si la base de datos no contesta en este plazo, la instancia no está lista: mejor 503 rápido que una
// sonda colgada que el orquestador interpreta como caída.
const READINESS_QUERY_TIMEOUT_MS = 2_000;

/**
 * Comprueba que la base de datos responde a una consulta trivial.
 *
 * @returns `true` si respondió a tiempo. Nunca lanza: el motivo del fallo se registra en el servidor.
 */
export async function isDatabaseReachable(prisma: PrismaClient, logger: ILogger): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Readiness query timed out')), READINESS_QUERY_TIMEOUT_MS);
  });

  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timedOut]);
    return true;
  } catch (error) {
    logger.error('Readiness check failed', error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
