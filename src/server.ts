import app from './app.js';
import { env } from './config/env.js';
import { appLogger } from './infrastructure/logging/appLogger.js';
import { PrismaService } from './infrastructure/persistence/prisma/PrismaService.js';
import { fileStorage } from './cross-cutting/sharedServices.js';
import { createGracefulShutdown } from './infrastructure/web/gracefulShutdown.js';

// Menos que los 30 s que suelen dar los orquestadores entre SIGTERM y SIGKILL.
const SHUTDOWN_TIMEOUT_MS = 10_000;
const STARTUP_FAILURE_EXIT_CODE = 1;

const start = async () => {
  try {
    await fileStorage.assertWritable();
    const server = app.listen(env.PORT, () => {
      appLogger.info('Server started', { port: env.PORT, nodeEnv: env.NODE_ENV });
    });

    const shutdown = createGracefulShutdown({
      server,
      disconnectDatabase: () => PrismaService.getInstance().client.$disconnect(),
      exitProcess: (exitCode) => process.exit(exitCode),
      log: (message, error) => (error ? appLogger.error(message, error) : appLogger.info(message)),
      timeoutMs: SHUTDOWN_TIMEOUT_MS,
    });
    process.on('SIGTERM', (signal) => void shutdown(signal));
    process.on('SIGINT', (signal) => void shutdown(signal));
  } catch (error) {
    appLogger.error('Server failed to start', error);
    process.exit(STARTUP_FAILURE_EXIT_CODE);
  }
};

void start();
