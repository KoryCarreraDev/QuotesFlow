// Acceso directo a la base de datos del archivo de test, por fuera de Prisma y de `src/`.
// Lo usa `tests/setup/database.setup.ts` para vaciar las tablas entre tests.
//
// No importar nada de `src/` aquí: este módulo se carga antes de fijar el entorno de la aplicación.

import pg from 'pg';

/** Toda base creada para un archivo de test empieza por este prefijo. */
export const TEST_DATABASE_NAME_PREFIX = 'test_';

const PRISMA_MIGRATIONS_TABLE = '_prisma_migrations';

let testDatabasePool: pg.Pool | undefined;

// Barrera de seguridad: vaciar tablas solo es aceptable en una base creada por los tests.
function assertPointsToTestDatabase(databaseUrl: string | undefined): asserts databaseUrl is string {
  const databaseName = databaseUrl ? new URL(databaseUrl).pathname.replace('/', '') : '';
  if (!databaseName.startsWith(TEST_DATABASE_NAME_PREFIX)) {
    throw new Error(
      `Refusing to touch database "${databaseName}": DATABASE_URL does not point to a per-file test database.`,
    );
  }
}

function getTestDatabasePool(): pg.Pool {
  if (!testDatabasePool) {
    const databaseUrl = process.env.DATABASE_URL;
    assertPointsToTestDatabase(databaseUrl);
    testDatabasePool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  }
  return testDatabasePool;
}

/**
 * Ejecuta SQL tal cual en la base del test. Sirve para probar el SQL de una migración contra filas que la aplicación
 * no deja crear (por ejemplo, datos anteriores a las reglas actuales).
 */
export async function executeSql(sql: string): Promise<void> {
  await getTestDatabasePool().query(sql);
}

/** Vacía todas las tablas de negocio. Se ejecuta sola antes de cada test de `integration` y `api`. */
export async function resetDatabase(): Promise<void> {
  const pool = getTestDatabasePool();
  const { rows: tables } = await pool.query<{ tablename: string }>(
    'SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename <> $2',
    ['public', PRISMA_MIGRATIONS_TABLE],
  );
  if (tables.length === 0) {
    return;
  }

  // Los nombres salen del catálogo de PostgreSQL, no de entrada externa.
  const quotedTableNames = tables.map((table) => `"public"."${table.tablename}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${quotedTableNames} RESTART IDENTITY CASCADE`);
}

/** Lista las tablas públicas que no tienen la columna indicada. Sirve para verificar reglas del esquema. */
export async function listTablesWithoutColumn(columnName: string): Promise<string[]> {
  const pool = getTestDatabasePool();
  const { rows: tables } = await pool.query<{ table_name: string }>(
    `SELECT t.table_name
       FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name <> $1
        AND NOT EXISTS (
              SELECT 1
                FROM information_schema.columns c
               WHERE c.table_schema = t.table_schema
                 AND c.table_name = t.table_name
                 AND c.column_name = $2
            )
      ORDER BY t.table_name`,
    [PRISMA_MIGRATIONS_TABLE, columnName],
  );
  return tables.map((table) => table.table_name);
}

/** Tablas cuya columna `tenantId` admite NULL: un registro así no pertenecería a ninguna empresa. */
export async function listTablesWithNullableTenantId(): Promise<string[]> {
  const pool = getTestDatabasePool();
  const { rows: tables } = await pool.query<{ table_name: string }>(
    `SELECT c.table_name
       FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'tenantId'
        AND c.is_nullable = 'YES'
      ORDER BY c.table_name`,
  );
  return tables.map((table) => table.table_name);
}

/** Tablas cuya columna `tenantId` no tiene clave foránea hacia `Tenant`. */
export async function listTablesWithoutTenantForeignKey(): Promise<string[]> {
  const pool = getTestDatabasePool();
  const { rows: tables } = await pool.query<{ table_name: string }>(
    `SELECT c.table_name
       FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'tenantId'
        AND NOT EXISTS (
              SELECT 1
                FROM information_schema.key_column_usage k
                JOIN information_schema.referential_constraints r
                  ON r.constraint_name = k.constraint_name AND r.constraint_schema = k.constraint_schema
                JOIN information_schema.constraint_column_usage target
                  ON target.constraint_name = r.unique_constraint_name
                 AND target.constraint_schema = r.unique_constraint_schema
               WHERE k.table_schema = c.table_schema
                 AND k.table_name = c.table_name
                 AND k.column_name = 'tenantId'
                 AND target.table_name = 'Tenant'
            )
      ORDER BY c.table_name`,
  );
  return tables.map((table) => table.table_name);
}

export async function closeTestDatabasePool(): Promise<void> {
  if (testDatabasePool) {
    await testDatabasePool.end();
    testDatabasePool = undefined;
  }
}
