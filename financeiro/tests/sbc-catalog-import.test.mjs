import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { loadApprovedCatalog, planImport, importCatalog } from '../scripts/import-sbc-catalog.mjs';

async function fixture() {
  const approved = loadApprovedCatalog();
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE "ServiceCatalog" (
    id text PRIMARY KEY, code text, name text NOT NULL, description text,
    category text NOT NULL, price double precision NOT NULL, cost double precision NOT NULL,
    duration int NOT NULL, unit text NOT NULL, active boolean NOT NULL,
    "createdAt" timestamp DEFAULT NOW(), "updatedAt" timestamp DEFAULT NOW());
    CREATE TABLE "PipelineSaleItem" (id text, price double precision);
    INSERT INTO "PipelineSaleItem" VALUES ('historical', 100);
    CREATE TABLE "Agendamento" (id text, duration int);
    INSERT INTO "Agendamento" VALUES ('historical',60);`);
  for (const row of approved.matched) {
    await pg.query(`INSERT INTO "ServiceCatalog" (id,code,name,category,price,cost,duration,unit,active) VALUES ($1,$2,$3,'Original',$4,23,$5,'SBC',true)`,
      [row.id,row.code,row.currentName,row.currentPrice,row.currentDuration]);
  }
  await pg.exec(`INSERT INTO "ServiceCatalog" (id,name,category,price,cost,duration,unit,active)
    SELECT 'preservado-' || n,'Preservado ' || n,'Original',37,23,80,
      CASE WHEN n<=10 THEN 'SBC' WHEN n<=510 THEN 'SCS' WHEN n<=1001 THEN 'Osasco' ELSE 'Todas' END,true
    FROM generate_series(1,1003) n;`);
  const reads=[], writes=[];
  const adapter=connection=>({
    serviceCatalog:{findMany:async()=>{reads.push(1);return (await connection.query('SELECT * FROM "ServiceCatalog" ORDER BY id')).rows;}},
    $executeRaw:async sql=>{writes.push(sql.text);return (await connection.query(sql.text,sql.values)).affectedRows;},
  });
  const db={...adapter(pg),$transaction:fn=>pg.transaction(tx=>fn(adapter(tx)))};
  return {pg,db,reads,writes};
}

test('manifesto aprovado conserva 329 inclusões, 147 durações, variantes e exclusões',()=>{
  const plan=loadApprovedCatalog();
  assert.equal(plan.inserts.length,329);
  assert.equal(new Set(plan.inserts.map(r=>r.id)).size,329);
  assert.equal(plan.matched.filter(r=>r.currentDuration!==r.newDuration).length,147);
  assert.ok(plan.inserts.every(r=>r.unit==='SBC'&&r.cost===0&&r.active));
  assert.equal(plan.inserts.filter(r=>r.duration===0).length,84);
  assert.equal(plan.inserts.filter(r=>r.name==='Entrada de Pacote').length,0);
  assert.equal(plan.exclusions.length,7);
  assert.deepEqual(plan.inserts.filter(r=>r.name.startsWith('Pison Olheiras')).map(r=>[r.code,r.price,r.duration]),[['0406',600,30],['0407',780,30]]);
  assert.equal(plan.matched.find(r=>r.code==='0497').newDuration,10);
  plan.inserts[0].duration=999;
  assert.throws(()=>loadApprovedCatalog(plan),/Fonte|fonte/);
});

test('simula sem escrita e aplica em lote preservando outros campos, unidades e históricos',async()=>{
  const {pg,db,reads,writes}=await fixture();
  try{
    const before=(await pg.query('SELECT * FROM "ServiceCatalog" ORDER BY id')).rows;
    assert.deepEqual(await importCatalog(db),{mode:'simulation',toInsert:329,toUpdate:147,existing:0});
    assert.equal(writes.length,0);reads.length=0;
    const result=await importCatalog(db,{apply:true});
    assert.equal(result.inserted,329);assert.equal(result.updated,147);assert.equal(result.unitCount,514);assert.equal(result.otherUnitsUnchanged,true);
    assert.equal(reads.length,2);assert.equal(writes.length,2);
    const after=(await pg.query('SELECT * FROM "ServiceCatalog" ORDER BY id')).rows;
    const targets=new Map(loadApprovedCatalog().matched.map(r=>[r.id,r.newDuration]));
    for(const old of before){
      const saved=after.find(r=>r.id===old.id);
      assert.deepEqual({...saved,duration:old.duration,updatedAt:old.updatedAt},old);
      assert.equal(saved.duration,targets.get(old.id)??old.duration);
    }
    assert.deepEqual((await pg.query('SELECT * FROM "PipelineSaleItem"')).rows,[{id:'historical',price:100}]);
    assert.deepEqual((await pg.query('SELECT * FROM "Agendamento"')).rows,[{id:'historical',duration:60}]);
    const rerun=await importCatalog(db,{apply:true});assert.equal(rerun.inserted,0);assert.equal(rerun.updated,0);
    assert.equal(writes.length,2);assert.equal(planImport(after).missing.length,0);
  }finally{await pg.close();}
});

test('edição posterior de duração, preço ou item importado bloqueia sem sobrescrever',async()=>{
  const {pg,db}=await fixture();
  try{
    const id=loadApprovedCatalog().matched[0].id;
    await pg.query('UPDATE "ServiceCatalog" SET duration=987 WHERE id=$1',[id]);
    await assert.rejects(importCatalog(db,{apply:true}),/alterado/);
    await pg.query('UPDATE "ServiceCatalog" SET duration=$1 WHERE id=$2',[loadApprovedCatalog().matched[0].currentDuration,id]);
    await importCatalog(db,{apply:true});
    await pg.query('UPDATE "ServiceCatalog" SET price=42 WHERE id=$1',[loadApprovedCatalog().inserts[0].id]);
    await assert.rejects(importCatalog(db,{apply:true}),/alterado/);
    assert.equal((await pg.query('SELECT price FROM "ServiceCatalog" WHERE id=$1',[loadApprovedCatalog().inserts[0].id])).rows[0].price,42);
  }finally{await pg.close();}
});

test('conflito manual de mesmo nome aborta em vez de duplicar',async()=>{
  const {pg,db}=await fixture();
  try{
    await pg.query('UPDATE "ServiceCatalog" SET name=$1 WHERE id=$2',[loadApprovedCatalog().inserts[0].name,'preservado-1']);
    await assert.rejects(importCatalog(db,{apply:true}),/concorrente/);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM "ServiceCatalog"')).rows[0].n,1178);
  }finally{await pg.close();}
});

test('erro no UPDATE desfaz também todas as inclusões do lote',async()=>{
  const {pg,db}=await fixture();
  try{
    await pg.exec('ALTER TABLE "ServiceCatalog" ADD CONSTRAINT duration_guard CHECK (id<>\'0045459a-13c1-4899-a135-99ab20c0a101\' OR duration=60)');
    await assert.rejects(importCatalog(db,{apply:true}),/duration_guard/);
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM "ServiceCatalog"')).rows[0].n,1178);
  }finally{await pg.close();}
});
