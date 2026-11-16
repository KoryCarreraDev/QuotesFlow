/** Lo que el apagado necesita del servidor HTTP de Node. */
export interface ClosableServer {
  close(onClosed: (error?: Error) => void): unknown;
  closeIdleConnections(): void;
  closeAllConnections(): void;
}

export interface GracefulShutdownOptions {
  server: ClosableServer;
  disconnectDatabase: () => Promise<void>;
  exitProcess: (exitCode: number) => void;
  log: (message: string, error?: unknown) => void;
  /** Plazo para terminar las peticiones en curso antes de cortar las conexiones. */
  timeoutMs: number;
}

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

function closeServer(server: ClosableServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // Las conexiones keep-alive sin petición en curso mantendrían el servidor abierto hasta el plazo.
    server.closeIdleConnections();
  });
}

/**
 * Crea el manejador de SIGTERM/SIGINT (F1-T08).
 *
 * Orden: el servidor deja de aceptar conexiones y espera a que terminen las peticiones en curso;
 * después se cierra la conexión a la base de datos y el proceso sale con 0. Si pasa el plazo,
 * se cortan las conexiones abiertas y sale con 1, para que el orquestador no espere para siempre.
 */
export function createGracefulShutdown(options: GracefulShutdownOptions): (signal: string) => Promise<void> {
  let shutdownInProgress: Promise<void> | undefined;

  async function shutDown(signal: string): Promise<void> {
    options.log(`${signal} received: shutting down`);
    const deadline = setTimeout(() => {
      options.log('Shutdown timed out: closing open connections');
      options.server.closeAllConnections();
      options.exitProcess(EXIT_FAILURE);
    }, options.timeoutMs);

    let exitCode = EXIT_SUCCESS;
    try {
      await closeServer(options.server);
    } catch (error) {
      exitCode = EXIT_FAILURE;
      options.log('Error while closing the HTTP server', error);
    }

    try {
      await options.disconnectDatabase();
    } catch (error) {
      exitCode = EXIT_FAILURE;
      options.log('Error while disconnecting from the database', error);
    }

    clearTimeout(deadline);
    options.exitProcess(exitCode);
  }

  return (signal: string) => {
    // Una segunda señal (Ctrl+C repetido, SIGTERM + SIGINT) no reinicia el apagado.
    shutdownInProgress ??= shutDown(signal);
    return shutdownInProgress;
  };
}
