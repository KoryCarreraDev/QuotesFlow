import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown } from '@/infrastructure/web/gracefulShutdown.js';

// F1-T08: al recibir SIGTERM (despliegue, escalado) la API deja de aceptar conexiones, termina las
// peticiones en curso, cierra la base de datos y sale con 0. Si algo se cuelga, sale con 1 al vencer el plazo.

const SHUTDOWN_TIMEOUT_MS = 1_000;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

function createServerDouble(closeBehaviour: 'closes' | 'fails' | 'hangs' = 'closes') {
  return {
    close: vi.fn((onClosed: (error?: Error) => void) => {
      if (closeBehaviour === 'closes') onClosed();
      if (closeBehaviour === 'fails') onClosed(new Error('server close failed'));
    }),
    closeIdleConnections: vi.fn(),
    closeAllConnections: vi.fn(),
  };
}

function setup(closeBehaviour: 'closes' | 'fails' | 'hangs' = 'closes') {
  const server = createServerDouble(closeBehaviour);
  const disconnectDatabase = vi.fn(async () => undefined);
  const exitProcess = vi.fn();
  const logShutdown = vi.fn();
  const shutdown = createGracefulShutdown({
    server,
    disconnectDatabase,
    exitProcess,
    log: logShutdown,
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
  });
  return { shutdown, server, disconnectDatabase, exitProcess };
}

describe('createGracefulShutdown', () => {
  it('cierra el servidor, después la base de datos, y sale con 0', async () => {
    const { shutdown, server, disconnectDatabase, exitProcess } = setup();

    await shutdown('SIGTERM');

    expect(server.close).toHaveBeenCalledOnce();
    expect(server.closeIdleConnections).toHaveBeenCalledOnce();
    expect(disconnectDatabase).toHaveBeenCalledOnce();
    expect(server.close.mock.invocationCallOrder[0]).toBeLessThan(disconnectDatabase.mock.invocationCallOrder[0]);
    expect(exitProcess).toHaveBeenCalledWith(EXIT_SUCCESS);
  });

  it('una segunda señal durante el apagado no lo repite', async () => {
    const { shutdown, server } = setup();

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(server.close).toHaveBeenCalledOnce();
  });

  it('si cerrar el servidor falla, cierra igualmente la base de datos y sale con 1', async () => {
    const { shutdown, disconnectDatabase, exitProcess } = setup('fails');

    await shutdown('SIGTERM');

    expect(disconnectDatabase).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledWith(EXIT_FAILURE);
  });

  it('si el apagado no termina en el plazo, corta las conexiones y sale con 1', async () => {
    vi.useFakeTimers();
    try {
      const { shutdown, server, exitProcess } = setup('hangs');

      void shutdown('SIGTERM');
      await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);

      expect(server.closeAllConnections).toHaveBeenCalledOnce();
      expect(exitProcess).toHaveBeenCalledWith(EXIT_FAILURE);
    } finally {
      vi.useRealTimers();
    }
  });
});
