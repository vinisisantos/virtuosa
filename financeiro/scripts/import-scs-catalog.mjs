import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';

const SOURCE_HASH = 'f87d7c4acbd53732392674768f2773ff9073f60b5df9c36e76d639f1036bfc54';
const ROWS_HASH = 'f18ca394dc1368061d80798e558b71b32a2d1d2eb9e8012b035374f8f1e64e7b';
export const IMPORT_CONFIRMATION = 'pdf-2026-09-06-confirmed';
const fields = ['id', 'code', 'name', 'description', 'category', 'price', 'cost', 'duration', 'unit', 'active'];
const select = Object.fromEntries([...fields, 'createdAt', 'updatedAt'].map(key => [key, true]));

function sourceId(index) {
  const bytes = createHash('sha1').update(`virtuosa:catalog:SCS:${SOURCE_HASH}:${index}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function loadApprovedCatalog(source = JSON.parse(readFileSync(new URL('./data/scs-catalog-2026-09-06.json', import.meta.url), 'utf8'))) {
  if (source.sourceSha256 !== SOURCE_HASH || !Array.isArray(source.rows) || source.rows.length !== 500 ||
      createHash('sha256').update(JSON.stringify(source.rows)).digest('hex') !== ROWS_HASH) {
    throw new Error('Fonte diferente dos 500 registros conferidos e aprovados.');
  }
  return source.rows.map((row, index) => ({
    id: sourceId(index + 1),
    code: row.code,
    name: row.name,
    description: `Catálogo particular SCS de 06/09/2026 · Código: ${row.code ?? 'sem código'} · Página ${row.page} do PDF.`,
    category: 'Estética',
    price: row.priceCents / 100,
    cost: row.costCents / 100,
    duration: row.duration,
    unit: 'SCS',
    active: true,
  }));
}

export function planImport(current, expected = loadApprovedCatalog()) {
  const byId = new Map(current.map(row => [row.id, row]));
  const ids = new Set(expected.map(row => row.id));
  const names = new Set(expected.map(row => row.name));
  const keys = new Set(expected.map(row => JSON.stringify([row.code, row.name])));
  // Names and source codes are both reused in this PDF; neither is a unique key.
  // Existing manual SCS records require reconciliation instead of silent merging.
  for (const row of current) {
    if (row.unit === 'SCS' && !ids.has(row.id) &&
        (keys.has(JSON.stringify([row.code, row.name])) || (!row.code && names.has(row.name)))) {
      throw new Error('Há cadastro SCS preexistente que precisa de conciliação; nada foi sobrescrito.');
    }
  }
  const missing = [];
  for (const row of expected) {
    const saved = byId.get(row.id);
    if (!saved) missing.push(row);
    else if (fields.some(key => saved[key] !== row[key])) {
      throw new Error('Um registro importado foi alterado; preservar a alteração e revisar antes de reexecutar.');
    }
  }
  return { missing, existing: expected.length - missing.length };
}

const readCatalog = db => db.serviceCatalog.findMany({ select, orderBy: { id: 'asc' } });

export async function importCatalog(db, { apply = false } = {}) {
  const expected = loadApprovedCatalog();
  const summary = { unit: 'SCS', total: expected.length, totalCents: 43905389, zeroPrices: 34 };
  if (!apply) {
    const plan = planImport(await readCatalog(db), expected);
    return { ...summary, mode: 'simulation', toInsert: plan.missing.length, existing: plan.existing };
  }
  return db.$transaction(async tx => {
    const before = await readCatalog(tx);
    const plan = planImport(before, expected);
    if (!plan.missing.length) return { ...summary, mode: 'applied', inserted: 0, existing: plan.existing };
    const inserted = await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ServiceCatalog" (id, code, name, description, category, price, cost, duration, unit, active, "createdAt", "updatedAt")
      VALUES ${Prisma.join(plan.missing.map(row => Prisma.sql`(
        ${row.id}, ${row.code}, ${row.name}, ${row.description}, ${row.category},
        ${row.price}, ${row.cost}, ${row.duration}, ${row.unit}, ${row.active}, NOW(), NOW()
      )`))}
      ON CONFLICT (id) DO NOTHING`);
    const after = await readCatalog(tx);
    if (planImport(after, expected).missing.length || inserted !== plan.missing.length) {
      throw new Error('Conferência da importação falhou; transação deve ser revertida.');
    }
    const previousIds = new Set(before.map(row => row.id));
    if (JSON.stringify(after.filter(row => previousIds.has(row.id))) !== JSON.stringify(before)) {
      throw new Error('Um registro preexistente mudou; transação deve ser revertida.');
    }
    return { ...summary, mode: 'applied', inserted, existing: plan.existing };
  }, { isolationLevel: 'Serializable', timeout: 20000, maxWait: 10000 });
}

export function assertAdministrativeDeploy(env = process.env) {
  if (env.VERCEL_ENV !== 'production' || env.SCS_CATALOG_IMPORT_ON_DEPLOY !== IMPORT_CONFIRMATION) {
    throw new Error('Gravação permitida apenas no deploy administrativo explicitamente autorizado.');
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply) assertAdministrativeDeploy();
  const { prisma } = await import('../src/lib/db.ts');
  try {
    console.log('[Catálogo SCS]', JSON.stringify(await importCatalog(prisma, { apply })));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('[Catálogo SCS] Importação não concluída. Verifique fonte, privilégios e conflitos; não alterar permissões locais.');
    process.exitCode = 1;
  });
}
