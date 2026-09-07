import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { assertAdministrativeDeploy, IMPORT_CONFIRMATION, importCatalog, loadApprovedCatalog, planImport } from '../scripts/import-scs-catalog.mjs';

async function fixture() {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE "ServiceCatalog" (
    id text PRIMARY KEY, code text, name text NOT NULL, description text,
    category text NOT NULL, price double precision NOT NULL, cost double precision NOT NULL,
    duration int NOT NULL, unit text NOT NULL, active boolean NOT NULL,
    "createdAt" timestamp DEFAULT NOW(), "updatedAt" timestamp DEFAULT NOW());
    INSERT INTO "ServiceCatalog" (id,code,name,description,category,price,cost,duration,unit,active) VALUES
    ('osasco', '0402', 'Pison Melasma', 'preservar', 'Laser', 123, 17, 40, 'Osasco', true),
    ('sbc', NULL, 'Procedimento SBC', NULL, 'Facial', 456, 10, 60, 'SBC', false),
    ('shared', NULL, 'Compartilhado', NULL, 'Estética', 890, 0, 5, 'Todas', true),
    ('scs-existing', 'custom', 'Personalizado SCS', NULL, 'Outros', 50, 0, 10, 'SCS', true);
    CREATE TABLE "PipelineSaleItem" (id text, price double precision);
    INSERT INTO "PipelineSaleItem" VALUES ('historical-sale', 100);`);
  const reads = [];
  const writes = [];
  const adapter = connection => ({
    serviceCatalog: {
      findMany: async () => {
        reads.push(1);
        return (await connection.query('SELECT * FROM "ServiceCatalog" ORDER BY id')).rows;
      },
    },
    $executeRaw: async sql => {
      writes.push(sql);
      return (await connection.query(sql.text, sql.values)).affectedRows;
    },
  });
  const db = { ...adapter(pg), $transaction: fn => pg.transaction(tx => fn(adapter(tx))) };
  return { pg, db, reads, writes };
}

test('fonte aprovada preserva 500 linhas, códigos, variantes, zeros e total exato', () => {
  const rows = loadApprovedCatalog();
  assert.equal(rows.length, 500);
  assert.equal(new Set(rows.map(row => row.id)).size, 500);
  assert.deepEqual(rows, loadApprovedCatalog());
  assert.equal(rows.reduce((sum, row) => sum + Math.round(row.price * 100), 0), 43905389);
  assert.equal(rows.filter(row => row.price === 0).length, 34);
  assert.ok(rows.some(row => row.duration === 0));
  assert.ok(rows.every(row => row.unit === 'SCS' && row.cost === 0 && row.active));
  assert.deepEqual(rows.filter(row => row.name === 'Pison Melasma').map(row => [row.code, row.price]), [['0402', 700], ['0403', 910]]);
  assert.equal(rows.filter(row => row.code === '0370').length, 3);
  assert.equal(rows.filter(row => row.name === 'Entrada de Pacote').length, 5);
  assert.equal(rows.find(row => row.name === 'Procedimento Teste').code, null);
  const source = JSON.parse(readFileSync(new URL('../scripts/data/scs-catalog-2026-09-06.json', import.meta.url), 'utf8'));
  source.rows[0].priceCents = 1;
  assert.throws(() => loadApprovedCatalog(source), /Fonte diferente/);
});

test('gravação exige deploy de produção e confirmação específica, antes de abrir conexão', () => {
  assert.throws(() => assertAdministrativeDeploy({}), /explicitamente/);
  assert.throws(() => assertAdministrativeDeploy({ VERCEL_ENV: 'preview', SCS_CATALOG_IMPORT_ON_DEPLOY: IMPORT_CONFIRMATION }));
  assert.throws(() => assertAdministrativeDeploy({ VERCEL_ENV: 'production', SCS_CATALOG_IMPORT_ON_DEPLOY: 'true' }));
  assert.doesNotThrow(() => assertAdministrativeDeploy({ VERCEL_ENV: 'production', SCS_CATALOG_IMPORT_ON_DEPLOY: IMPORT_CONFIRMATION }));
});

test('simulação não grava; lote usa três operações e preserva catálogo anterior e vendas', async () => {
  const { pg, db, reads, writes } = await fixture();
  try {
    const before = (await pg.query('SELECT * FROM "ServiceCatalog" ORDER BY id')).rows;
    assert.equal((await importCatalog(db)).toInsert, 500);
    assert.equal(writes.length, 0);
    reads.length = 0;
    assert.equal((await importCatalog(db, { apply: true })).inserted, 500);
    assert.equal(reads.length, 2);
    assert.equal(writes.length, 1);
    assert.match(writes[0].text, /ON CONFLICT \(id\) DO NOTHING/);
    const after = (await pg.query('SELECT * FROM "ServiceCatalog" ORDER BY id')).rows;
    assert.equal(after.length, 504);
    assert.deepEqual(after.filter(row => before.some(old => old.id === row.id)), before);
    assert.equal(planImport(after).missing.length, 0);
    assert.equal((await pg.query('SELECT sum(round(price::numeric,2))::text AS sum FROM "ServiceCatalog" WHERE id NOT IN (\'osasco\',\'sbc\',\'shared\',\'scs-existing\')')).rows[0].sum, '439053.89');
    assert.deepEqual((await pg.query('SELECT * FROM "PipelineSaleItem"')).rows, [{ id: 'historical-sale', price: 100 }]);
    assert.equal((await importCatalog(db, { apply: true })).inserted, 0);
    assert.equal((await importCatalog(db)).toInsert, 0);
    assert.equal(writes.length, 1);
  } finally { await pg.close(); }
});

test('conflitos e edições posteriores bloqueiam reexecução sem sobrescrever', async () => {
  const { pg, db } = await fixture();
  try {
    await pg.exec('UPDATE "ServiceCatalog" SET name=\'Pison Melasma\',code=NULL WHERE id=\'scs-existing\'');
    await assert.rejects(importCatalog(db, { apply: true }), /preexistente/);
    assert.equal((await pg.query('SELECT count(*)::int AS count FROM "ServiceCatalog"')).rows[0].count, 4);
    await pg.exec('UPDATE "ServiceCatalog" SET name=\'Personalizado SCS\',code=\'custom\' WHERE id=\'scs-existing\'');
    await importCatalog(db, { apply: true });
    const id = loadApprovedCatalog()[0].id;
    await pg.query('UPDATE "ServiceCatalog" SET price=42 WHERE id=$1', [id]);
    await assert.rejects(importCatalog(db, { apply: true }), /foi alterado/);
    assert.equal((await pg.query('SELECT price FROM "ServiceCatalog" WHERE id=$1', [id])).rows[0].price, 42);
  } finally { await pg.close(); }
});

test('erro em uma linha reverte o lote inteiro', async () => {
  const { pg, db } = await fixture();
  try {
    await pg.exec('ALTER TABLE "ServiceCatalog" ADD CONSTRAINT max_price_test CHECK (price < 10000)');
    await assert.rejects(importCatalog(db, { apply: true }), /max_price_test/);
    assert.equal((await pg.query('SELECT count(*)::int AS count FROM "ServiceCatalog"')).rows[0].count, 4);
  } finally { await pg.close(); }
});
