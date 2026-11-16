// Arranca UN contenedor efímero de PostgreSQL para toda la ejecución (decisión D-02 de PLAN.md)
// y aplica las migraciones reales de `prisma/migrations` sobre una base plantilla.
// Cada archivo de test crea después su propia base copiando esa plantilla (ver `database.setup.ts`).
//
// Corre en el proceso principal de Vitest, una vez por proyecto que lo declare (`integration` y `api`).
// El estado se comparte por `globalThis` para que ambos proyectos reutilicen el mismo contenedor.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Misma versión mayor que `docker-compose.yml`. Se puede cambiar con TEST_POSTGRES_IMAGE.
const DEFAULT_POSTGRES_IMAGE = 'postgres:15';
const TEMPLATE_DATABASE_NAME = 'quotesflow_template';
const MAINTENANCE_DATABASE_NAME = 'postgres';
const DATABASE_USER = 'quotesflow_test';
const DATABASE_PASSWORD = 'quotesflow_test';
const SHARED_STATE_KEY = Symbol.for('quotesflow.tests.databaseContainer');

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface SharedContainerState {
  startup: Promise<StartedPostgreSqlContainer>;
  activeProjectCount: number;
}

type GlobalWithSharedState = typeof globalThis & { [SHARED_STATE_KEY]?: SharedContainerState };

const globalWithSharedState = globalThis as GlobalWithSharedState;

function runPrismaCli(prismaArguments: string[], databaseUrl: string): void {
  const prismaCliPath = createRequire(import.meta.url).resolve('prisma/build/index.js');

  try {
    execFileSync(process.execPath, [prismaCliPath, ...prismaArguments], {
      cwd: projectRoot,
      // DATABASE_URL explícita: `prisma.config.ts` carga `.env`, pero dotenv no pisa variables ya definidas.
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } catch (error) {
    const processOutput = error as { stdout?: Buffer; stderr?: Buffer };
    const details = [processOutput.stdout, processOutput.stderr].map((output) => output?.toString() ?? '').join('\n');
    throw new Error(`"prisma ${prismaArguments.join(' ')}" failed for the test database:\n${details}`, {
      cause: error,
    });
  }
}

function prepareSchema(templateDatabaseUrl: string): void {
  // El cliente se regenera siempre: así los tests nunca corren con un cliente más viejo que `schema.prisma`.
  runPrismaCli(['generate'], templateDatabaseUrl);
  runPrismaCli(['migrate', 'deploy'], templateDatabaseUrl);
}

async function startContainerWithMigratedTemplate(): Promise<StartedPostgreSqlContainer> {
  const postgresImage = process.env.TEST_POSTGRES_IMAGE ?? DEFAULT_POSTGRES_IMAGE;

  let container: StartedPostgreSqlContainer;
  try {
    container = await new PostgreSqlContainer(postgresImage)
      .withDatabase(TEMPLATE_DATABASE_NAME)
      .withUsername(DATABASE_USER)
      .withPassword(DATABASE_PASSWORD)
      .start();
  } catch (error) {
    throw new Error('Could not start the PostgreSQL test container. Integration and API tests need Docker running.', {
      cause: error,
    });
  }

  try {
    prepareSchema(container.getConnectionUri());
  } catch (error) {
    await container.stop();
    throw error;
  }

  return container;
}

function buildMaintenanceDatabaseUrl(container: StartedPostgreSqlContainer): string {
  const connectionUrl = new URL(container.getConnectionUri());
  connectionUrl.pathname = `/${MAINTENANCE_DATABASE_NAME}`;
  return connectionUrl.toString();
}

export default async function setupDatabaseContainer(project: TestProject): Promise<() => Promise<void>> {
  const sharedState = (globalWithSharedState[SHARED_STATE_KEY] ??= {
    startup: startContainerWithMigratedTemplate(),
    activeProjectCount: 0,
  });
  sharedState.activeProjectCount += 1;

  const container = await sharedState.startup;

  project.provide('testDatabaseAdminUrl', buildMaintenanceDatabaseUrl(container));
  project.provide('testDatabaseTemplateName', TEMPLATE_DATABASE_NAME);

  return async function teardownDatabaseContainer(): Promise<void> {
    sharedState.activeProjectCount -= 1;
    if (sharedState.activeProjectCount > 0) {
      return;
    }
    delete globalWithSharedState[SHARED_STATE_KEY];
    await container.stop();
  };
}
