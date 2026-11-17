import { describe, expect, it } from 'vitest';
import {
  listTablesWithNullableTenantId,
  listTablesWithoutColumn,
  listTablesWithoutTenantForeignKey,
} from '@tests/support/database/testDatabase.js';

// Tablas que, por diseño, no pertenecen a una empresa. Añadir una aquí exige justificarlo en el PR
// (por ejemplo las tablas de administración de plataforma de la fase F5).
const TABLES_WITHOUT_TENANT_SCOPE = ['Tenant'];

// Tablas de historial inmutable: no se borran, así que no llevan la marca de borrado suave.
// EmailLog (F2-T01) es el historial de envíos de correo.
const TABLES_WITHOUT_SOFT_DELETE = ['AuditLog', 'EmailLog'];

describe('Esquema de la base de datos tras aplicar las migraciones', () => {
  it('toda tabla de negocio tiene la columna tenantId (regla R5)', async () => {
    const tablesWithoutTenant = await listTablesWithoutColumn('tenantId');

    expect(tablesWithoutTenant).toEqual(TABLES_WITHOUT_TENANT_SCOPE);
  });

  it('ningún tenantId admite NULL: todo registro de negocio pertenece a una empresa', async () => {
    await expect(listTablesWithNullableTenantId()).resolves.toEqual([]);
  });

  it('todo tenantId es clave foránea hacia Tenant', async () => {
    await expect(listTablesWithoutTenantForeignKey()).resolves.toEqual([]);
  });

  it('toda tabla de negocio tiene la marca de borrado suave', async () => {
    const tablesWithoutSoftDelete = await listTablesWithoutColumn('deleted');

    expect(tablesWithoutSoftDelete).toEqual(TABLES_WITHOUT_SOFT_DELETE);
  });
});
