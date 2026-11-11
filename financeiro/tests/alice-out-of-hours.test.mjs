import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { runnerFixture } from "./fixtures/alice-autonomy-runner.mjs";

globalThis.prisma = {};
globalThis.fetch = async () => { throw new Error("Rede externa proibida"); };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url:"data:text/javascript,export {};",shortCircuit:true };
  if (specifier === "@/generated/alice-knowledge") return { url:new URL("./fixtures/alice-test-knowledge.mjs",import.meta.url).href,shortCircuit:true };
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const source=new URL(`${specifier}.ts`,context.parentURL);
    if (existsSync(source)) return next(source.href,context);
  }
  return next(["next/server","next/headers"].includes(specifier)?`${specifier}.js`:specifier,context);
} });
const { aliceAutonomySchedulingTextValid }=await import("../src/lib/ai-assistant/autonomy/content-policy.ts");
const { claimAliceAutonomousTurn }=await import("../src/lib/ai-assistant/autonomy/queue.ts");
const { loadAliceAutonomousContext }=await import("../src/lib/ai-assistant/autonomy/context.ts");
const { processAliceAutonomousTurn }=await import("../src/lib/ai-assistant/autonomy/runner.ts");
const { pauseAliceForHuman }=await import("../src/lib/ai-assistant/autonomy/queue.ts");
const { sbcOutOfHoursReply }=await import("../src/lib/ai-assistant/autonomy/out-of-hours.ts");
const { aliceEvaluationAllowedPeriods }=await import("../src/lib/ai-assistant/evaluation-offer-policy.ts");
const { buildAliceAssistantRequest }=await import("../src/lib/ai-assistant/provider.ts");
const { generateAliceAutonomousReply }=await import("../src/lib/ai-assistant/autonomy/generate.ts");
const { buildAliceStructuredRequest }=await import("../src/lib/alice/structured-request.ts");
const { buildAliceContext }=await import("../src/lib/alice/build-context.ts");
const { contextInput }=await import("./fixtures/alice-memory-context.mjs");

test("período de atendimento pode ser explicado sem virar oferta de toda a grade",()=>{
  const now=new Date("2026-11-11T18:24:00Z");
  const text="Aos sábados, atendemos das 8h às 13h. De segunda a sexta, atendemos das 10h às 20h. Só agendamos dentro desses períodos. Você consegue vir durante a semana à tarde?";
  assert.equal(aliceAutonomySchedulingTextValid([text],now,{HORARIOS_SBC:[]}),true);
  assert.equal(aliceAutonomySchedulingTextValid([`${text} Pode vir em 14/11/2026 às 15h?`],now),false);
  assert.equal(aliceAutonomySchedulingTextValid(["Aos sábados, atendemos das 8h às 15h."],now),false);
});

test("Bony: só 15h após oferta de sábado recebe período real e alternativa, sem reserva ou geração paga",async()=>{
  const f=await runnerFixture(claimAliceAutonomousTurn,{memory:true,beforeClaim:async pg=>{
    await pg.exec(`UPDATE "WhatsAppMessage" SET body='Só 15h' WHERE id='source-a'`);
    await pg.exec(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",body,type,status,timestamp,"createdAt","respondedByName")
      SELECT 'oferta',"conversationId",'oferta',TRUE,'No sábado temos 8h, 9h ou 10h. Qual funciona melhor?','text','delivered',timestamp-interval '2 minutes',"createdAt"-interval '2 minutes','Alice' FROM "WhatsAppMessage" WHERE id='source-a';
      INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",body,timestamp,"createdAt")
      SELECT 'trabalho',"conversationId",'trabalho','Eu trabalho de manhã',timestamp-interval '1 second',"createdAt"-interval '1 second' FROM "WhatsAppMessage" WHERE id='source-a'`);
  }});
  process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED="true";
  try {
    f.deps.loadContext=loadAliceAutonomousContext;
    f.deps.generate=async()=>{throw new Error("A negociação fora da grade deve ter continuidade sem geração paga");};
    assert.equal(await processAliceAutonomousTurn(f.claim,{},f.deps),"sent");
    assert.equal(f.state.sends.length,1);
    assert.match(f.state.sends[0],/sábados.*8h.*13h/su);
    assert.match(f.state.sends[0],/segunda a sexta.*10h.*20h/su);
    assert.match(f.state.sends[0],/semana.*tarde/su);
    assert.doesNotMatch(f.state.sends[0],/agendei|reservad|confirmad/iu);
    assert.equal((await f.readTurn()).appointmentId,null);
    assert.equal((await f.readTurn()).generationStartedAt,null);
    assert.equal((await f.readTurn()).usageRecorded,true);
    assert.equal((await f.readTurn()).costMicroUsd,0);
    assert.equal((await f.readChat()).aiMode,"agent");
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED;await f.pg.close(); }
});

const now=new Date("2026-11-11T18:24:00Z");
function context(body,offer="No sábado temos 8h, 9h ou 10h. Qual funciona melhor?") {
  const source={id:"source",body,type:"text",fromMe:false,status:"delivered",timestamp:now};
  return {prompt:{UNIDADE:"SBC"},source,messages:[{id:"offer",body:offer,type:"text",fromMe:true,
    respondedByName:"Alice",respondedBy:null,status:"sent",timestamp:new Date(+now-60_000)},source]};
}

test("explica fora da grade e dias fechados, mas não interfere em escolha válida, ambígua ou pergunta de procedimento",()=>{
  for(const body of ["Só 15h","No sábado 15h","No domingo às 11h","Na segunda às 21h","14/11/2026 às 15h","Sábado 12h15"]) {
    const reply=sbcOutOfHoursReply(context(body),now);
    assert.ok(reply,body);
    assert.equal(aliceAutonomySchedulingTextValid([reply],now,{HORARIOS_SBC:[]}),true,reply);
  }
  for(const body of ["Sábado 13h","Segunda 15h","Só 8h","10h ou 15h","Não posso às 15h","Só 15h, qual o valor?",
    "Só 15h, estou grávida","Só 15h, dói?","14/11/2026 na quarta às 15h","Só 25h","Só 15h99"]) {
    assert.equal(sbcOutOfHoursReply(context(body),now),null,body);
  }
  assert.match(sbcOutOfHoursReply(context("Domingo 15h"),now),/domingos não realizamos avaliações/u);
  const old=context("Só 15h");old.messages[0].timestamp=new Date(+now-86_400_001);
  assert.equal(sbcOutOfHoursReply(old,now),null);
  const human=context("Só 15h");human.messages[0].respondedBy="human";
  assert.equal(sbcOutOfHoursReply(human,now),null);
});

test("descrição de funcionamento não libera oferta escondida, faixa aberta nem informação falsa",()=>{
  const hours="Aos sábados, atendemos das 8h às 13h.";
  for(const text of [
    `${hours} Pode vir às 15h?`,`${hours} Pode vir em 14/11/2026 às 15h?`,
    `${hours} 14/11/2026: 8h, 9h, 10h, 11h, 12h ou 13h?`,
    "No sábado 14/11/2026, temos horários das 8h às 13h.",
    "De segunda a sexta, atendemos das 9h às 20h.","Aos sábados, atendemos das 8h às 15h.",
    `${hours} Tenho uma última vaga em 14/11/2026 às 10h.`,
  ]) assert.equal(aliceAutonomySchedulingTextValid([text],now),false,text);
});

test("o pedido de 15h e trabalho pela manhã preservam alternativas da tarde; regra vale somente para SBC",()=>{
  const prompt={UNIDADE:"SBC",CONVERSA:[{role:"cliente",text:"Eu trabalho de manhã"},{role:"cliente",text:"Só 15h"}]};
  assert.deepEqual([...aliceEvaluationAllowedPeriods(prompt,now)],["afternoon"]);
  assert.doesNotMatch(buildAliceAssistantRequest({UNIDADE:"Osasco"}).instructions,/PERIODO_DE_ATENDIMENTO_SBC/u);
  assert.match(buildAliceAssistantRequest(prompt).instructions,/PERIODO_DE_ATENDIMENTO_SBC/u);
  assert.match(buildAliceAssistantRequest(prompt).instructions,/compatível com o trabalho/u);
});

test("continuidade de horário revalida intervenção humana antes do envio e não repete mensagem aceita",async()=>{
  for(const intervene of [false,true]) {
    const f=await runnerFixture(claimAliceAutonomousTurn,{beforeClaim:async pg=>{
      await pg.exec(`UPDATE "WhatsAppMessage" SET body='Só sábado 15h' WHERE id='source-a'`);
    }});
    try {
      f.deps.loadContext=loadAliceAutonomousContext;
      if(intervene) f.state.onBeforeSend=()=>pauseAliceForHuman("conversation-a",f.adapter);
      assert.equal(await processAliceAutonomousTurn(f.claim,{},f.deps),intervene?"skipped":"sent");
      assert.equal(f.state.sends.length,intervene?0:1);
      assert.equal(await processAliceAutonomousTurn(f.claim,{},f.deps),"skipped");
      assert.equal(f.state.sends.length,intervene?0:1);
      assert.equal(f.state.generations,0);
    } finally {await f.pg.close();}
  }
});

test("recuperação orienta períodos reais e continuidade pela própria Alice nos dois contratos",async()=>{
  const input=contextInput();
  const structured=buildAliceStructuredRequest({scope:input.scope,prompt:buildAliceContext(input),schedulingRetry:true});
  assert.match(structured.system,/CORRECAO_DE_HORARIOS/u);
  assert.match(structured.system,/Aos sábados, atendemos das 8h às 13h/u);
  assert.match(structured.system,/sem delegar.*equipe/u);
  assert.doesNotMatch(structured.system,/para a equipe confirmar as opções/u);
  let called=false;
  await generateAliceAutonomousReply({...context("Só 15h"),contactName:null,schedulingRetry:true},async(_,request)=>{
    called=true;const payload=JSON.parse(request.body);
    assert.match(payload.system,/CORRECAO_DE_HORARIOS/u);
    assert.match(payload.system,/sem delegar.*equipe/u);
    return new Response(JSON.stringify({model:"claude-sonnet-4-6",stop_reason:"end_turn",usage:{input_tokens:100,output_tokens:20},
      content:[{type:"text",text:JSON.stringify({response:"Você consegue vir durante a semana?",messages:["Você consegue vir durante a semana?"],needsHuman:false,confidence:"high",usedKnowledge:[]})}]}),{status:200});
  });
  assert.equal(called,true);
});
