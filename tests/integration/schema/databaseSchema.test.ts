import { describe, expect, it } from 'vitest';
import { listTablesWithoutColumn } from '@tests/support/database/testDatabase.js';
import { itKnownDefect } from '@tests/support/knownDefect.js';

// Tablas que, por diseño, no pertenecen a una empresa. Añadir una aquí exige justificarlo en el PR
// (por ejemplo las tablas de administración de plataforma de la fase F5).
const TABLES_WITHOUT_TENANT_SCOPE = ['Tenant'];

// Tablas de historial inmutable: no se borran, así que no llevan la marca de borrado suave.
const TABLES_WITHOUT_SOFT_DELETE = ['AuditLog'];

describe('Esquema de la base de datos tras aplicar las migraciones', () => {
  itKnownDefect('H15', 'toda tabla de negocio tiene la columna tenantId (regla R5)', async () => {
    const tablesWithoutTenant = await listTablesWithoutColumn('tenantId');

    expect(tablesWithoutTenant).toEqual(TABLES_WITHOUT_TENANT_SCOPE);
  });

  it('toda tabla de negocio tiene la marca de borrado suave', async () => {
    const tablesWithoutSoftDelete = await listTablesWithoutColumn('deleted');

    expect(tablesWithoutSoftDelete).toEqual(TABLES_WITHOUT_SOFT_DELETE);
  });
});
