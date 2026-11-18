import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import {
  type TenantWithTeam,
  persistQuote,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { executeSql } from '@tests/support/database/testDatabase.js';

// F3-A10: la migración `check_quote_rows_before_launch` se detiene si hay cotizaciones que el dominio no podría leer.
// Se ejecuta su SQL contra filas inválidas que la aplicación no deja crear (datos de antes de las reglas de F3).

const migrationSql = readFileSync(
  path.resolve('prisma/migrations/20261118130100_check_quote_rows_before_launch/migration.sql'),
  'utf8',
);

describe('Migración check_quote_rows_before_launch', () => {
  let company: TenantWithTeam;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
  });

  it('no hace nada con cotizaciones válidas ni con una base vacía', async () => {
    await executeSql(migrationSql);
    await persistQuote(company.tenant.id, company.salesRep.id, { status: 'SENT' });

    await expect(executeSql(migrationSql)).resolves.toBeUndefined();
  });

  it('se detiene con una cotización sin lead, contacto ni empresa', async () => {
    const quote = await persistQuote(company.tenant.id, company.salesRep.id);
    await prisma.quote.update({ where: { id: quote.id }, data: { contactId: null } });

    await expect(executeSql(migrationSql)).rejects.toThrow('1 quotes without lead, contact or company');
  });

  it('se detiene con un ítem de cantidad cero o con un precio negativo', async () => {
    const zeroQuantity = await persistQuote(company.tenant.id, company.salesRep.id);
    await prisma.quoteItem.updateMany({ where: { quoteId: zeroQuantity.id }, data: { quantity: 0 } });
    await expect(executeSql(migrationSql)).rejects.toThrow('1 items with quantity outside 1..1000000');
    await prisma.quoteItem.updateMany({ where: { quoteId: zeroQuantity.id }, data: { quantity: 1, unitPrice: '-1' } });
    await expect(executeSql(migrationSql)).rejects.toThrow('1 items with negative price');
  });

  it('ignora las filas borradas, que la aplicación no lee', async () => {
    const quote = await persistQuote(company.tenant.id, company.salesRep.id);
    await prisma.quote.update({ where: { id: quote.id }, data: { contactId: null, deleted: 'DELETED' } });

    await expect(executeSql(migrationSql)).resolves.toBeUndefined();
  });
});
