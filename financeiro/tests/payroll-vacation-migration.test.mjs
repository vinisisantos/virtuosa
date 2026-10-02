import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('migração das férias é idempotente e sem sobrescrever tabela tributária configurada', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "PayrollVacation" ("id" TEXT PRIMARY KEY)');
    await db.exec('CREATE TABLE "PayrollEntry" ("id" TEXT PRIMARY KEY)');
    const sql = await readFile(new URL('../prisma/migrations/20261002160000_payroll_vacation_receipt_tax_tables/migration.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec('UPDATE "PayrollTaxTable" SET "inssBrackets" = \'[{"limit":2000,"rate":0.1}]\'::jsonb WHERE "year" = 2026');
    await db.exec(sql);
    const result = await db.query('SELECT "inssBrackets", "irrfTable" FROM "PayrollTaxTable" WHERE "year" = 2026');
    assert.deepEqual(result.rows[0].inssBrackets, [{ limit: 2000, rate: 0.1 }]);
    assert.ok(Array.isArray(result.rows[0].irrfTable.brackets));
    const columns = await db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_name IN ('PayrollVacation', 'PayrollEntry')`);
    assert.ok(columns.rows.some(row => row.column_name === 'receipt'));
    assert.ok(columns.rows.some(row => row.column_name === 'transportActualCost'));
  } finally {
    await db.close();
  }
});
