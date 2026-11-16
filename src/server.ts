import app from './app.js';
import { env } from './config/env.js';
import { PrismaService } from './infrastructure/persistence/prisma/PrismaService.js';
import { createGracefulShutdown } from './infrastructure/web/gracefulShutdown.js';

// Menos que los 30 s que suelen dar los orquestadores entre SIGTERM y SIGKILL.
const SHUTDOWN_TIMEOUT_MS = 10_000;
const STARTUP_FAILURE_EXIT_CODE = 1;

const start = () => {
  try {
    const server = app.listen(env.PORT, () => {
      console.log(`Servidor corriendo en puerto ${env.PORT} [${env.NODE_ENV}]`);
    });

    const shutdown = createGracefulShutdown({
      server,
      disconnectDatabase: () => PrismaService.getInstance().client.$disconnect(),
      exitProcess: (exitCode) => process.exit(exitCode),
      log: (message, error) => (error ? console.error(message, error) : console.log(message)),
      timeoutMs: SHUTDOWN_TIMEOUT_MS,
    });
    process.on('SIGTERM', (signal) => void shutdown(signal));
    process.on('SIGINT', (signal) => void shutdown(signal));
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(STARTUP_FAILURE_EXIT_CODE);
  }
};

start();
