import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {dispatchMetadataForSend,dispatchSnapshot,dispatchDeliveryStatus,dispatchUnitEnabled,parseDispatchRequest} from '../src/lib/whatsapp/dispatch.ts';
import {latestDispatchesQuery} from '../src/lib/whatsapp/dispatch-query.ts';

const batch={batchId:'12345678-1234-1234-1234-123456789abc',source:'inbox_bulk',size:10,campaignName:' Botox '};
test('escopo é a caixa real ou contato de Todas, nunca unidade fornecida no lote',()=>{
  assert.equal(dispatchUnitEnabled('Osasco','SCS'),true);
  for(const unit of ['SCS','SBC',null,'']) assert.equal(dispatchUnitEnabled(unit,'Osasco'),false);
  assert.equal(dispatchUnitEnabled('Todas','Osasco'),true);
  assert.equal(dispatchUnitEnabled('Todas','SCS'),false);
  assert.equal(dispatchMetadataForSend({...batch,unit:'Osasco'},'SCS','Osasco'),null);
  assert.deepEqual(dispatchMetadataForSend(batch,'Osasco'),{version:1,unit:'Osasco',batchId:batch.batchId,source:'inbox_bulk',campaignName:'Botox'});
});
test('somente lote explícito válido de até dez, sem herdar autoria/data/status do navegador',()=>{
  for(const value of [null,{},'lote',{...batch,size:11},{...batch,size:0},{...batch,size:1.5},{...batch,batchId:'x'},{...batch,source:'automatic'}]) assert.equal(parseDispatchRequest(value),null);
  const metadata=dispatchMetadataForSend({...batch,sentByName:'forjado',status:'delivered',timestamp:'2000-01-01'},'Osasco');
  assert.equal(metadata.sentByName,undefined);assert.equal(metadata.status,undefined);assert.equal(metadata.timestamp,undefined);
  assert.equal(dispatchMetadataForSend({...batch,campaignName:'x'.repeat(500)},'Osasco').campaignName.length,160);
});
test('snapshot só aceita saída com metadados válidos e usa os campos persistidos',()=>{
  const row={id:'m',conversationId:'c',fromMe:true,dispatchMetadata:dispatchMetadataForSend(batch,'Osasco'),timestamp:'2026-09-09T14:00:00Z',respondedByName:'Operadora',status:'sent'};
  assert.equal(dispatchSnapshot({...row,dispatchMetadata:null}),null);
  assert.equal(dispatchSnapshot({...row,fromMe:false}),null);
  assert.equal(dispatchSnapshot({...row,timestamp:'invalid'}),null);
  assert.equal(dispatchSnapshot(row).sentByName,'Operadora');assert.equal(dispatchSnapshot(row).sentAt,'2026-09-09T14:00:00.000Z');
});
test('aceite de envio não é confundido com entrega/leitura',()=>{
  for(const status of ['sent','SERVER_ACK']) assert.equal(dispatchDeliveryStatus(status).label,'Enviada');
  for(const status of ['delivered','DELIVERY_ACK']) assert.equal(dispatchDeliveryStatus(status).label,'Entregue');
  assert.equal(dispatchDeliveryStatus('READ').label,'Lida');
  assert.equal(dispatchDeliveryStatus('error').label,'Falha');
  assert.equal(dispatchDeliveryStatus('deleted').label,'Excluída');
  assert.equal(dispatchDeliveryStatus('unknown').tone,'neutral');
});
test('migração aditiva idempotente e query retorna somente último disparo da conversa exata',async()=>{
  const pg=new PGlite();
  try {
    await pg.exec('CREATE TABLE "WhatsAppMessage" (id text PRIMARY KEY,"conversationId" text,"messageId" text,"timestamp" timestamptz,"respondedByName" text,status text,"fromMe" boolean)');
    const column=await readFile(new URL('../prisma/migrations/20260909120000_whatsapp_dispatch_metadata/migration.sql',import.meta.url),'utf8');
    const index=await readFile(new URL('../prisma/migrations/20260909120100_whatsapp_dispatch_index/migration.sql',import.meta.url),'utf8');
    await pg.exec(column);await pg.exec(column);await pg.exec(index);await pg.exec(index);
    const metadata=JSON.stringify(dispatchMetadataForSend(batch,'Osasco'));
    for(const [id,conversationId,day,dispatch,fromMe] of [['old','a',1,metadata,true],['new','a',2,metadata,true],['manual','a',3,null,true],['inbound','a',4,metadata,false],['private','b',5,metadata,true]]) {
      await pg.query('INSERT INTO "WhatsAppMessage" VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,conversationId,'same-wa-id',`2026-09-0${day}T14:00:00Z`,'Operador','sent',fromMe,dispatch]);
    }
    const q=latestDispatchesQuery(['a','a']);
    let rows=(await pg.query(q.text,q.values)).rows;
    assert.deepEqual(rows.map(r=>r.id),['new']);
    await pg.query('UPDATE "WhatsAppMessage" SET status=$1 WHERE id=$2',['delivered','new']);
    rows=(await pg.query(q.text,q.values)).rows;
    assert.equal(rows[0].status,'delivered');
    await pg.query('UPDATE "WhatsAppMessage" SET status=$1 WHERE id=$2',['deleted','new']);
    assert.equal((await pg.query(q.text,q.values)).rows[0].status,'deleted');
    assert.throws(()=>latestDispatchesQuery([]));
    const missing=latestDispatchesQuery(['not-authorized-in-this-scope']);
    assert.deepEqual((await pg.query(missing.text,missing.values)).rows,[]);
  } finally {await pg.close();}
});
