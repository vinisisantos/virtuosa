import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';

export const IMPORT_CONFIRMATION = 'sbc-pdf-2026-10-21-confirmed';
const SOURCE_HASH = 'c4650aa27a1f8a9c64f0a0a8ea5fc9e729bdcbadc635e3910d2df005dae3c270';
const PLAN_HASH = '9bb8a724a85aa2749c36c88e88cf45b816bc19562d7cfb8bce6507d5c2bfa8df';
const fields = ['id', 'code', 'name', 'description', 'category', 'price', 'cost', 'duration', 'unit', 'active'];
const select = Object.fromEntries([...fields, 'createdAt', 'updatedAt'].map(key => [key, true]));
const normalize = name => name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function loadApprovedCatalog(plan = JSON.parse(readFileSync(new URL('./data/sbc-catalog-2026-10-21.json', import.meta.url), 'utf8'))) {
  if (plan.sourceSha256 !== SOURCE_HASH || plan.inserts.length !== 329 || plan.matched.length !== 175 ||
      createHash('sha256').update(JSON.stringify(plan)).digest('hex') !== PLAN_HASH) {
    throw new Error('Plano diferente da fonte conferida.');
  }
  return plan;
}

export function planImport(current, plan = loadApprovedCatalog()) {
  const byId = new Map(current.map(row => [row.id, row]));
  const missing = [], updates = [];
  for (const match of plan.matched) {
    const saved = byId.get(match.id);
    if (!saved || saved.unit !== 'SBC' || saved.name !== match.currentName || saved.price !== match.currentPrice ||
        ![match.currentDuration, match.newDuration].includes(saved.duration)) {
      throw new Error(`Cadastro existente alterado ou ausente: ${match.id}. Rever o plano sem sobrescrever.`);
    }
    if (saved.duration !== match.newDuration) updates.push({ id: saved.id, before: saved.duration, after: match.newDuration });
  }
  for (const row of plan.inserts) {
    const saved = byId.get(row.id);
    if (saved) {
      if (fields.some(key => saved[key] !== row[key])) throw new Error(`Item importado foi alterado: ${row.id}.`);
      continue;
    }
    const sourceName = normalize(row.name.replace(/ \(cód\. .*\)$/, ''));
    if (current.some(existing => existing.unit === 'SBC' &&
        (normalize(existing.name) === normalize(row.name) ||
          (existing.code === row.code && normalize(existing.name) === sourceName)))) {
      throw new Error(`Inclusão concorrente ou cadastro manual precisa de conciliação: ${row.name}.`);
    }
    missing.push(row);
  }
  return { missing, updates, existing: plan.inserts.length - missing.length };
}

const readCatalog = db => db.serviceCatalog.findMany({ select, orderBy: { id: 'asc' } });
const fingerprint = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');

export async function importCatalog(db, { apply = false } = {}) {
  const approved = loadApprovedCatalog();
  if (!apply) {
    const plan = planImport(await readCatalog(db), approved);
    return { mode: 'simulation', toInsert: plan.missing.length, toUpdate: plan.updates.length, existing: plan.existing };
  }
  return db.$transaction(async tx => {
    const before = await readCatalog(tx);
    const plan = planImport(before, approved);
    const updates = new Map(plan.updates.map(row => [row.id, row]));
    let inserted = 0, updated = 0;
    if (plan.missing.length) {
      inserted = await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ServiceCatalog" (id, code, name, description, category, price, cost, duration, unit, active, "createdAt", "updatedAt")
        VALUES ${Prisma.join(plan.missing.map(row => Prisma.sql`(
          ${row.id}, ${row.code}, ${row.name}, ${row.description}, ${row.category},
          ${row.price}, ${row.cost}, ${row.duration}, ${row.unit}, ${row.active}, NOW(), NOW()
        )`))} ON CONFLICT (id) DO NOTHING`);
    }
    if (plan.updates.length) {
      updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "ServiceCatalog" AS catalog SET duration = patch.after::int, "updatedAt" = NOW()
        FROM (VALUES ${Prisma.join(plan.updates.map(row => Prisma.sql`(${row.id}, ${row.before}::int, ${row.after}::int)`))})
          AS patch(id, before, after)
        WHERE catalog.id = patch.id AND catalog.unit = 'SBC' AND catalog.duration = patch.before::int`);
    }
    const after = await readCatalog(tx);
    const remaining = planImport(after, approved);
    if (remaining.missing.length || remaining.updates.length || inserted !== plan.missing.length || updated !== plan.updates.length) {
      throw new Error('Conferência do lote falhou; reverter a transação.');
    }
    const afterById = new Map(after.map(row => [row.id, row]));
    for (const saved of before) {
      const expected = updates.has(saved.id)
        ? { ...saved, duration: updates.get(saved.id).after, updatedAt: afterById.get(saved.id)?.updatedAt }
        : saved;
      if (JSON.stringify(afterById.get(saved.id)) !== JSON.stringify(expected)) {
        throw new Error('Um campo não autorizado mudou; reverter a transação.');
      }
    }
    if (after.length !== before.length + inserted) throw new Error('Quantidade inesperada após o lote.');
    return {
      mode: 'applied', inserted, updated, existing: plan.existing,
      unitCount: after.filter(row => row.unit === 'SBC').length,
      otherUnitsUnchanged: fingerprint(before.filter(row => row.unit !== 'SBC')) === fingerprint(after.filter(row => row.unit !== 'SBC')),
      durationChanges: plan.updates,
    };
  }, { isolationLevel: 'Serializable', timeout: 20000, maxWait: 10000 });
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && process.env.SBC_CATALOG_IMPORT_CONFIRMATION !== IMPORT_CONFIRMATION) {
    throw new Error('Gravação exige confirmação explícita do lote de SBC.');
  }
  const { prisma } = await import('../src/lib/db.ts');
  try { console.log(JSON.stringify(await importCatalog(prisma, { apply }))); }
  finally { await prisma.$disconnect(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
