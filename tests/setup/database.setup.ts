// Se ejecuta antes de cada archivo de test de los proyectos `integration` y `api`.
//
// Crea una base de datos propia para el archivo, copiando la plantilla ya migrada, y apunta
// `DATABASE_URL` a ella ANTES de que se importe `src/config/database.ts`. Así:
//   - ningún test puede tocar la base de desarrollo del `.env`;
//   - los archivos de test corren en paralelo sin pisarse datos;
//   - cada test empieza con las tablas vacías (`beforeEach` de abajo).
//
// Este archivo no puede importar nada de `src/` de forma estática (se evaluaría antes de fijar la URL).

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeEach, inject } from 'vitest';
import { TEST_DATABASE_NAME_PREFIX, closeTestDatabasePool, resetDatabase } from '../support/database/testDatabase.js';

const maintenanceDatabaseUrl = inject('testDatabaseAdminUrl');
const templateDatabaseName = inject('testDatabaseTemplateName');
const testDatabaseName = `${TEST_DATABASE_NAME_PREFIX}${randomUUID().replaceAll('-', '')}`;

const maintenanceClient = new pg.Client({ connectionString: maintenanceDatabaseUrl });
await maintenanceClient.connect();
try {
  // Los nombres vienen de constantes y de un UUID generado aquí: no hay entrada externa que interpolar.
  await maintenanceClient.query(`CREATE DATABASE "${testDatabaseName}" TEMPLATE "${templateDatabaseName}"`);
} finally {
  await maintenanceClient.end();
}

const testDatabaseUrl = new URL(maintenanceDatabaseUrl);
testDatabaseUrl.pathname = `/${testDatabaseName}`;
process.env.DATABASE_URL = testDatabaseUrl.toString();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  const { default: prisma } = await import('@/config/database.js');
  await prisma.$disconnect();
  await closeTestDatabasePool();
});
