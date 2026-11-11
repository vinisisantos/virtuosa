import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { runnerFixture } from "./fixtures/alice-autonomy-runner.mjs";

globalThis.prisma = {};
globalThis.fetch = async () => { throw new Error("Rede externa proibida neste teste"); };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier === "@/generated/alice-knowledge") return { url: new URL("./fixtures/alice-test-knowledge.mjs", import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const source = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(source)) return next(source.href, context);
  }
  return next(["next/server", "next/headers"].includes(specifier) ? `${specifier}.js` : specifier, context);
} });
const { claimAliceAutonomousTurn, enqueueAliceAutonomousTurn } = await import("../src/lib/ai-assistant/autonomy/queue.ts");
const { loadAliceAutonomousContext } = await import("../src/lib/ai-assistant/autonomy/context.ts");
const { processAliceAutonomousTurn } = await import("../src/lib/ai-assistant/autonomy/runner.ts");
const { structuredOutput } = await import("./fixtures/alice-structured-output.mjs");
const { aliceMediaTextContext } = await import("../src/lib/ai-assistant/autonomy/media-text.ts");

async function fixture(type = "associatedChildMessage") {
  return runnerFixture(claimAliceAutonomousTurn, { memory: true, beforeClaim: async pg => {
    await pg.query(`UPDATE "WhatsAppMessage" SET type=$1,body='' WHERE id='source-a'`, [type]);
    await pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",type,body,timestamp,"createdAt")
      SELECT 'pedido',"conversationId",'pedido','text','Olá! Eu vim pelo GLÚTEOS PERFEITOS, gostaria de saber mais sobre isso.',
        timestamp-interval '17 seconds',"createdAt"-interval '17 seconds' FROM "WhatsAppMessage" WHERE id='source-a'`);
    if (type === "associatedChildMessage") await pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",type,body,timestamp,"createdAt")
      SELECT 'imagem',"conversationId",'imagem','image','',timestamp-interval '3 seconds',"createdAt"-interval '3 seconds'
        FROM "WhatsAppMessage" WHERE id='source-a'`);
  } });
}

test("texto + imagem + evento vazio preservam a fonte mais recente e respondem ao pedido, com e sem memória", async () => {
  for (const memory of [false, true]) {
    const f = await fixture();
    process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED = String(memory);
    try {
      const context = await loadAliceAutonomousContext(f.claim.turn, f.adapter, f.state.clock);
      assert.equal(context.handoffReason, null);
      assert.equal(context.source.id, "source-a", "a referência de concorrência continua sendo a última entrada");
      assert.equal(context.source.type, "associatedChildMessage", "não falsifica tipo ou corpo da mensagem");
      assert.match(JSON.stringify(context.prompt), /GLÚTEOS PERFEITOS/);
      assert.match(JSON.stringify(context.prompt.ANEXOS_NAO_INTERPRETADOS), /não.*interpret|não.*visual/i);
      f.deps.loadContext = (...args) => loadAliceAutonomousContext(...args);
      const legacyGenerate = f.deps.generate;
      const reply="Qual é seu principal objetivo com o Glúteos Perfeitos?";
      f.deps.generate = async () => ({ ...await legacyGenerate(), messages:[reply],
        ...(memory ? { proposal:structuredOutput({ resposta:[reply],memoria:{resumo:"A cliente pediu informações sobre Glúteos Perfeitos."} }) } : {}) });
      const outcome = await processAliceAutonomousTurn(f.claim, {}, f.deps);
      assert.equal(outcome, "sent", `memória=${memory}, erro=${(await f.readTurn()).error}`);
      assert.ok(f.state.sends.length > 0);
      assert.equal((await f.readChat()).aiMode, "agent");
      assert.deepEqual(f.state.handoffs, []);
    } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
  }
});

test("ativação explícita retoma uma vez o bloqueio pré-geração de mídia com pedido textual recente", async () => {
  const f = await fixture();
  try {
    await f.pg.exec(`UPDATE "AliceAutonomousTurn" SET status='needs_human',error='model_requested',"claimToken"=NULL,
      "generationStartedAt"=NULL,"claimedAt"=NULL,"messagesJson"='null'::jsonb;
      UPDATE "WhatsAppConversation" SET "aiModeUpdatedBy"='operator' WHERE id='conversation-a'`);
    const input = { conversationId:"conversation-a", instanceId:f.claim.turn.instanceId, sourceMessageId:"source-a",
      timestamp:f.claim.turn.createdAt, origin:"inbound", resumeMediaTextBy:"operator" };
    const result = await enqueueAliceAutonomousTurn(input, f.adapter, f.state.clock);
    assert.equal(result.queued, true, JSON.stringify(result));
    assert.equal((await f.readTurn()).error, null);
    assert.equal((await f.readTurn()).attempts, 1);
    assert.equal((await f.pg.query('SELECT count(*)::int AS count FROM "AliceAutonomousTurn"')).rows[0].count, 1);
  } finally { await f.pg.close(); }
});

test("associação da mídia é limitada ao mesmo conjunto textual, sem atravessar outra mensagem ou resposta humana", () => {
  const at = new Date("2026-11-11T03:00:00Z");
  const text = { id:"texto",type:"text",body:"Quero saber sobre Glúteos Perfeitos",fromMe:false,timestamp:at,createdAt:at };
  const image = { ...text,id:"imagem",type:"image",body:"",timestamp:new Date(+at+14_000),createdAt:new Date(+at+14_000) };
  assert.equal(aliceMediaTextContext([text,image],image.id).textMessageId,text.id);
  const invalid = [
    [image],
    [text,{ ...image,timestamp:new Date(+at+31_000) }],
    [text,{ ...image,createdAt:new Date(+at+31_000) }],
    [text,{ ...text,id:"humano",fromMe:true,timestamp:new Date(+at+7_000) },image],
    [text,{ ...image,type:"video" }],
    [text,{ ...image,type:"audio" }],
    [text,{ ...image,type:"document" }],
    [text,{ ...image,body:"Depende do que está na foto" }],
    [text,{ ...image,timestamp:new Date(NaN) }],
    [text,{ ...image,timestamp:new Date(+at-1) }],
    [text,image,{ ...text,id:"novo",timestamp:new Date(+at+15_000) }],
  ];
  for (const history of invalid) assert.equal(aliceMediaTextContext(history,image.id),null,JSON.stringify(history));
});

test("imagem sozinha permanece para revisão; condição clínica no texto continua protegida", async () => {
  const f = await fixture("image");
  process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED="true";
  try {
    await f.pg.exec(`UPDATE "WhatsAppMessage" SET body='Tenho diabetes, posso fazer o procedimento?' WHERE id='pedido'`);
    assert.equal((await loadAliceAutonomousContext(f.claim.turn,f.adapter,f.state.clock)).handoffReason,"clinical_safety");
    await f.pg.exec(`DELETE FROM "WhatsAppMessage" WHERE id='pedido'`);
    assert.equal((await loadAliceAutonomousContext(f.claim.turn,f.adapter,f.state.clock)).handoffReason,"model_requested");
    assert.deepEqual(f.state.sends,[]);
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test("retomada de mídia não contorna geração anterior, envio, reserva, lote antigo, pausa ou segurança", async () => {
  const f = await fixture();
  const input = { conversationId:"conversation-a",instanceId:f.claim.turn.instanceId,sourceMessageId:"source-a",
    timestamp:f.claim.turn.createdAt,origin:"inbound",resumeMediaTextBy:"operator" };
  const cases = [
    { name:"sem ação explícita",input:{resumeMediaTextBy:undefined} },
    { name:"outro operador",input:{resumeMediaTextBy:"other"} },
    { name:"lote histórico",input:{origin:"backlog"} },
    { name:"origem histórica",sql:`UPDATE "AliceAutonomousTurn" SET origin='backlog'` },
    { name:"segunda tentativa",sql:`UPDATE "AliceAutonomousTurn" SET attempts=2` },
    { name:"geração já iniciada",sql:`UPDATE "AliceAutonomousTurn" SET "generationStartedAt"=NOW()` },
    { name:"primeiro envio",sql:`UPDATE "AliceAutonomousTurn" SET "firstSentAt"=NOW()` },
    { name:"reserva existente",sql:`UPDATE "AliceAutonomousTurn" SET "appointmentId"='appointment'` },
    { name:"mensagem aceita",sql:`UPDATE "AliceAutonomousTurn" SET "providerMessageIds"='["provider-id"]'::jsonb` },
    { name:"sequência salva",sql:`UPDATE "AliceAutonomousTurn" SET "messagesJson"='["mensagem"]'::jsonb` },
    { name:"posse de worker",sql:`UPDATE "AliceAutonomousTurn" SET "claimToken"='claimed'` },
    { name:"escalonamento clínico",sql:`INSERT INTO "LeadMemory" (id,"conversationId",unidade,"escalarHumano","updatedAt") VALUES ('memory','conversation-a','SBC',TRUE,NOW())` },
    { name:"agenda auditada",sql:`INSERT INTO "AliceAutoSchedule" (id,"conversationId","replyMessageId",state) VALUES ('agenda','conversation-a','source-a','submitted')` },
    { name:"resposta humana posterior",sql:`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",timestamp,body) VALUES ('human','conversation-a','human',TRUE,NOW(),'Respondido')` },
    { name:"pausa mantida",sql:`UPDATE "WhatsAppConversation" SET "aiMode"='manual',"aiModeUpdatedBy"='human-takeover'` },
    { name:"fora das 100 horas",sql:`UPDATE "AppSetting" SET value=jsonb_set(value::jsonb,'{activatedAt}',to_jsonb((NOW()-interval '200 hours')::text))::text
        WHERE key='alice_autonomous_sbc_v1';
      UPDATE "WhatsAppMessage" SET timestamp=NOW()-interval '101 hours',"createdAt"=NOW()-interval '101 hours'` },
  ];
  try {
    for (const item of cases) {
      await f.pg.exec(`DELETE FROM "LeadMemory"; DELETE FROM "AliceAutoSchedule"; DELETE FROM "WhatsAppMessage" WHERE id='human';
        UPDATE "AliceAutonomousTurn" SET status='needs_human',error='model_requested',origin='inbound',attempts=1,
          "claimToken"=NULL,"generationStartedAt"=NULL,"firstSentAt"=NULL,"appointmentId"=NULL,"nextMessageIndex"=0,
          "providerMessageIds"='[]'::jsonb,"messagesJson"='null'::jsonb;
        UPDATE "WhatsAppConversation" SET "aiMode"='agent',"aiModeUpdatedBy"='operator'`);
      if (item.sql) await f.pg.exec(item.sql);
      const result=await enqueueAliceAutonomousTurn({...input,...item.input},f.adapter,f.state.clock);
      assert.equal(result.queued,false,item.name);
    }
    assert.deepEqual(f.state.sends,[]);
  } finally { await f.pg.close(); }
});

test("intervenção humana antes do envio cancela a resposta mesmo com pedido textual associado à imagem", async () => {
  const f=await fixture();
  try {
    f.deps.loadContext=loadAliceAutonomousContext;
    f.state.onBeforeSend=async()=>f.pg.exec(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",timestamp,body)
      VALUES ('human','conversation-a','human',TRUE,NOW(),'Vou assumir daqui')`);
    assert.equal(await processAliceAutonomousTurn(f.claim,{},f.deps),"skipped");
    assert.deepEqual(f.state.sends,[]);
  } finally { await f.pg.close(); }
});
