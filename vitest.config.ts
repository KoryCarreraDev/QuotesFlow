import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Umbrales de cobertura acordados en la decisión D-03 de PLAN.md.
// Prohibido bajarlos para que un PR pase (regla R2).
const GLOBAL_COVERAGE_THRESHOLD = 80;
const CORE_LAYERS_COVERAGE_THRESHOLD = 90;

// Los tests con base de datos esperan al contenedor de PostgreSQL y a la copia de la plantilla.
const DATABASE_TEST_TIMEOUT_MS = 30_000;
const DATABASE_HOOK_TIMEOUT_MS = 120_000;

const COMMON_SETUP_FILE = 'tests/setup/testEnvironment.setup.ts';
const DATABASE_GLOBAL_SETUP_FILE = 'tests/setup/databaseContainer.globalSetup.ts';
const DATABASE_SETUP_FILE = 'tests/setup/database.setup.ts';

function coverageThreshold(percentage: number) {
  return {
    statements: percentage,
    branches: percentage,
    functions: percentage,
    lines: percentage,
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@tests': path.resolve(projectRoot, 'tests'),
      '@': path.resolve(projectRoot, 'src'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      // Fuera de la medición: arranque del proceso y archivos que solo declaran tipos.
      exclude: [
        'src/server.ts',
        'src/types/**',
        'src/application/dtos/**',
        'src/application/ports/**',
        'src/application/use-case/**/listFiltered*UseCase.ts',
      ],
      thresholds: {
        ...coverageThreshold(GLOBAL_COVERAGE_THRESHOLD),
        'src/domain/**': coverageThreshold(CORE_LAYERS_COVERAGE_THRESHOLD),
        'src/application/**': coverageThreshold(CORE_LAYERS_COVERAGE_THRESHOLD),
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: [COMMON_SETUP_FILE, 'tests/setup/unit.setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: [DATABASE_GLOBAL_SETUP_FILE],
          setupFiles: [COMMON_SETUP_FILE, DATABASE_SETUP_FILE],
          testTimeout: DATABASE_TEST_TIMEOUT_MS,
          hookTimeout: DATABASE_HOOK_TIMEOUT_MS,
        },
      },
      {
        extends: true,
        test: {
          name: 'api',
          include: ['tests/api/**/*.test.ts'],
          globalSetup: [DATABASE_GLOBAL_SETUP_FILE],
          setupFiles: [COMMON_SETUP_FILE, DATABASE_SETUP_FILE],
          testTimeout: DATABASE_TEST_TIMEOUT_MS,
          hookTimeout: DATABASE_HOOK_TIMEOUT_MS,
        },
      },
    ],
  },
});
