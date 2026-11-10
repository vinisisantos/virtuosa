import assert from "node:assert/strict";
import test from "node:test";
import { runnerFixture } from "./fixtures/alice-autonomy-runner.mjs";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
globalThis.prisma = {};
globalThis.fetch = async () => { throw new Error('Rede externa proibida'); };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
  if (specifier === '@/generated/alice-knowledge') return { url: new URL('./fixtures/alice-test-knowledge.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const source = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(source)) return next(source.href, context);
  }
  return next(['next/server', 'next/headers'].includes(specifier) ? `${specifier}.js` : specifier, context);
} });
const { loadAliceAutonomousContext } = await import("../src/lib/ai-assistant/autonomy/context.ts");
const { processAliceAutonomousTurn } = await import("../src/lib/ai-assistant/autonomy/runner.ts");
const { generateAliceAutonomousReply } = await import("../src/lib/ai-assistant/autonomy/generate.ts");
const { getOrCreateMemory } = await import("../src/lib/alice/memory.ts");
const { applyCurrentAliceMemory, rememberHumanPresentation, clearAliceEscalationOnResume } = await import('../src/lib/alice/runtime-memory.ts');
const { claimAliceAutonomousTurn, pauseAliceForHuman } = await import('../src/lib/ai-assistant/autonomy/queue.ts');
const { structuredOutput, providerResponse } = await import('./fixtures/alice-structured-output.mjs');
const enableMemory = () => { process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED = 'true'; };
const scopeOf = (f) => ({ conversationId: f.claim.turn.conversationId, instanceId: f.claim.turn.instanceId, unidade: 'SBC' });

test("memória SBC lê a apresentação antiga sem anonimizar e registra pergunta realmente enviada", async () => {
  const previous = process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED;
  process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED = "true";
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    const old = new Date(f.state.clock.getTime() - 3 * 86_400_000);
    await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",body,status,timestamp,"respondedByName")
      VALUES ('old-intro','conversation-a','old',TRUE,'Olá, sou a Alice, da Virtuosa. O que mais te incomoda hoje?', 'sent',$1,'Alice')`, [old]);
    await f.pg.query(`UPDATE "WhatsAppMessage" SET body='Vim pelo LIPO LASER 699. Meu nome é Luana e quero tratar o abdômen' WHERE id='source-a'`);
    const context = await loadAliceAutonomousContext(f.claim.turn, f.adapter, f.state.clock);
    assert.equal(context.handoffReason, null);
    assert.equal(context.prompt.CONTROLES_CONTINUIDADE_ALICE.presentationAt, old.toISOString());
    assert.deepEqual(context.prompt.CONTROLES_CONTINUIDADE_ALICE.questionsAsked, ["queixa"]);
    assert.match(JSON.stringify(context.prompt), /sou a Alice/);
    assert.match(JSON.stringify(context.prompt), /Luana/);
    assert.equal(context.memoryRuntime.scope.conversationId, 'conversation-a');
  } finally {
    if (previous === undefined) delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED;
    else process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED = previous;
    await f.pg.close();
  }
});

test("apresentação repetida é removida antes do HTTP e a auditoria não registra o texto da cliente", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",body,status,timestamp,"respondedByName")
      VALUES ('intro','conversation-a','intro',TRUE,'Me chamo Claudenice, atendente da Virtuosa.', 'sent',NOW()-interval '2 days','Claudenice')`);
    const deps = { ...f.deps, loadContext: loadAliceAutonomousContext, generate: (context, _, signal) => generateAliceAutonomousReply(context,
      async () => providerResponse(structuredOutput({ resposta: ['Olá! Sou a Alice, da Virtuosa.', 'Vamos continuar de onde paramos.'] })), signal) };
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), 'sent');
    assert.deepEqual(f.state.sends, ['Vamos continuar de onde paramos.']);
    const logs = (await f.pg.query('SELECT details FROM "AuditLog"')).rows;
    assert.match(logs[0].details, /presentation_removed/);
    assert.doesNotMatch(logs[0].details, /Claudenice|Vamos continuar|Cliente de teste/);
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test("intervenção humana durante geração impede HTTP e mantém custo, sem aplicar rascunho na memória", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    const deps = { ...f.deps, loadContext: loadAliceAutonomousContext, generate: (context, _, signal) => generateAliceAutonomousReply(context,
      async () => { await pauseAliceForHuman(f.claim.turn.conversationId, f.adapter); return providerResponse(structuredOutput()); }, signal) };
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), 'skipped');
    assert.deepEqual(f.state.sends, []);
    assert.equal((await getOrCreateMemory(scopeOf(f), {}, f.adapter)).resumo, null);
    assert.equal((await f.readTurn()).inputTokens, 100);
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test("fonte antiga não sobrescreve memória após nova mensagem e humana pode retomar escalonamento explicitamente", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    await loadAliceAutonomousContext(f.claim.turn, f.adapter, f.state.clock);
    assert.equal(await applyCurrentAliceMemory(scopeOf(f), 'source-a', { resumo: 'Fato atual.', escalarHumano: true }, f.adapter), true);
    await clearAliceEscalationOnResume(scopeOf(f), f.adapter);
    assert.equal((await getOrCreateMemory(scopeOf(f), {}, f.adapter)).escalarHumano, false);
    await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",body,timestamp) VALUES ('new-source','conversation-a','new','Correção posterior',NOW()+interval '2 seconds')`);
    assert.equal(await applyCurrentAliceMemory(scopeOf(f), 'source-a', { resumo: 'Fato ultrapassado.' }, f.adapter), false);
    assert.equal((await getOrCreateMemory(scopeOf(f), {}, f.adapter)).resumo, 'Fato atual.');
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test("apresentação humana aceita também alimenta a continuidade sem atribuir a saída à Alice", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",body,status,"respondedByName","respondedBy")
      VALUES ('human','conversation-a','human',TRUE,'Me chamo Claudenice, atendente da Virtuosa.','sent','Claudenice','user-fixture')`);
    await rememberHumanPresentation({ ...scopeOf(f), messageRowId: 'human', body: 'Me chamo Claudenice, atendente da Virtuosa.', type: 'text', status: 'sent' }, f.adapter);
    const memory = await getOrCreateMemory(scopeOf(f), {}, f.adapter);
    assert.ok(memory.apresentacaoFeitaEm);
    assert.equal(memory.ultimaMensagemAliceEm, null);
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test("worker envia as duas partes com 3s, sem gerar de novo, e grava somente perguntas efetivamente aceitas", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    const reply = structuredOutput({ resposta: ["Olá! Sou a Alice, assistente virtual da Virtuosa.", "É a primeira vez que você realiza esse procedimento?"],
      memoria: { resumo: "Cliente quer entender o procedimento.", perguntasFeitas: ['queixa'] } });
    const deps = { ...f.deps, loadContext: loadAliceAutonomousContext, generate: (context, _, signal) => generateAliceAutonomousReply(context, async () => {
      f.state.generations++; return providerResponse(reply);
    }, signal) };
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), 'queued');
    const first = await getOrCreateMemory(scopeOf(f), {}, f.adapter);
    assert.ok(first.apresentacaoFeitaEm);
    assert.deepEqual(first.perguntasFeitas, []);
    assert.equal(first.resumo, null);
    assert.equal(await claimAliceAutonomousTurn(f.adapter), null);
    f.state.clock = new Date(f.state.clock.getTime() + 3_000);
    await f.pg.query(`UPDATE "AliceAutonomousTurn" SET "availableAt"=clock_timestamp()-interval '1 second' WHERE id=$1`, [f.claim.turn.id]);
    const next = await claimAliceAutonomousTurn(f.adapter);
    assert.equal(await processAliceAutonomousTurn(next, {}, deps), 'sent');
    assert.deepEqual(f.state.sends, reply.resposta);
    assert.equal(f.state.generations, 1);
    const final = await getOrCreateMemory(scopeOf(f), {}, f.adapter);
    assert.deepEqual(final.perguntasFeitas, ['primeira_vez']);
    assert.equal(final.resumo, reply.memoria.resumo);
    assert.equal((await f.readTurn()).inputTokens, 100);
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

const fearReply = 'É normal ter esse receio. É importante tirar essa dúvida antes.\n\nPode haver algum desconforto, que varia de pessoa para pessoa. A profissional avalia seu histórico e orienta sobre o procedimento e os cuidados.\n\nA avaliação é gratuita e sem compromisso. Você decide com calma, só se se sentir segura.\n\nSe quiser, prefere durante a semana ou no sábado?';

test("medo geral tem acolhimento, mas pressão, garantia e condição de saúde nunca são enviados", async (t) => {
  for (const [text, reply, expected, calls] of [
    ['Tenho medo de agulha', fearReply, 'sent', 1],
    ['E se der reação?', fearReply, 'sent', 1],
    ['Tenho medo', `${fearReply}\n\nNão tem risco.`, 'needs_human', 1],
    ['Tenho medo', `${fearReply}\n\nVale aproveitar enquanto a condição estiver disponível.`, 'needs_human', 1],
    ['Uso medicação e tenho medo', fearReply, 'needs_human', 0],
    ['Tenho pressão alta e medo de agulha', fearReply, 'needs_human', 0],
    ['Estou grávida e tenho receio', fearReply, 'needs_human', 0],
    ['Já tive uma reação com aplicação anterior, tenho medo', fearReply, 'needs_human', 0],
  ]) await t.test(text + expected, async () => {
    enableMemory();
    const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
    try {
      await f.pg.query(`UPDATE "WhatsAppMessage" SET body=$1 WHERE id='source-a'`, [text]);
      const deps = { ...f.deps, loadContext: loadAliceAutonomousContext, generate: (context, _, signal) => generateAliceAutonomousReply(context,
        async () => { f.state.generations++; return providerResponse(structuredOutput({ resposta: [reply] })); }, signal) };
      assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), expected);
      assert.equal(f.state.generations, calls);
      if (expected === 'sent') assert.deepEqual(f.state.sends, [reply]);
      else assert.deepEqual(f.state.sends, []);
      if (calls) assert.equal((await f.readTurn()).inputTokens, 100);
    } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
  });
});

test("falha após início de HTTP não prova apresentação nem permite reenvio da resposta", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    f.state.failSend = true;
    const deps = { ...f.deps, loadContext: loadAliceAutonomousContext, generate: (context, _, signal) => generateAliceAutonomousReply(context,
      async () => providerResponse(structuredOutput({ resposta: ['Sou a Alice, assistente virtual da Virtuosa.'] })), signal) };
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), 'uncertain');
    const memory = await getOrCreateMemory(scopeOf(f), {}, f.adapter);
    assert.equal(memory.apresentacaoFeitaEm, null);
    assert.equal(memory.ultimaMensagemAliceEm, null);
    assert.equal(memory.resumo, null);
    assert.equal(await claimAliceAutonomousTurn(f.adapter), null);
    assert.equal(f.state.sends.length, 1);
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test("retorno por anúncio após avaliação antiga não confirmada responde sobre o preço sem alterar a agenda", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    await f.pg.query(`INSERT INTO "Agendamento" VALUES
      ('antiga','SBC','5511900001234','Avaliação','nao_confirmou',NOW()-interval '17 days',NOW()-interval '17 days'+interval '30 minutes'),
      ('cancelada','SBC','5511900001234','Avaliação','desmarcou',NOW()+interval '1 day',NOW()+interval '2 days'),
      ('outra-unidade','Osasco','5511900001234','Avaliação','confirmado',NOW()+interval '1 day',NOW()+interval '2 days')`);
    await f.pg.query(`INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId","fromMe",body,status,timestamp,"respondedByName")
      VALUES ('intro','conversation-a','intro',TRUE,'Sou a Alice, atendente da Virtuosa.','sent',NOW()-interval '20 days','Alice')`);
    await f.pg.query(`UPDATE "WhatsAppMessage" SET body='Vim pelo LIPO LASER 699,00. Gostaria de mais informações.' WHERE id='source-a'`);
    const resposta = 'O valor dessa campanha é R$ 699,00 por região.';
    const deps = { ...f.deps, loadContext: loadAliceAutonomousContext, generate: (context, _, signal) => {
      assert.equal(context.prompt.DADOS_AGENDA_ATUAIS, null);
      return generateAliceAutonomousReply(context, async () => providerResponse(structuredOutput({ resposta: [resposta] })), signal);
    } };
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), 'sent');
    assert.deepEqual(f.state.sends, [resposta]);
    assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM "Agendamento"')).rows[0].n, 3);
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test("avaliação já iniciada continua protegida até o término", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    await f.pg.query(`INSERT INTO "Agendamento" VALUES
      ('agora','SBC','5511900001234','Avaliação','confirmado',NOW()-interval '10 minutes',NOW()+interval '20 minutes'),
      ('futura','SBC','5511900001234','Avaliação','pendente',NOW()+interval '1 day',NOW()+interval '2 days')`);
    const context = await loadAliceAutonomousContext(f.claim.turn, f.adapter, f.state.clock);
    assert.equal(context.memoryRuntime.guard.appointment.state, 'CONFIRMADO');
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test("agendamento atual surgindo durante geração bloqueia preço e falha fechada não apaga seu custo", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    const deps = { ...f.deps, loadContext: loadAliceAutonomousContext, generate: (context, _, signal) => generateAliceAutonomousReply(context,
      async () => {
        await f.pg.query(`INSERT INTO "Agendamento" VALUES ('appointment','SBC','5511900001234','Avaliação','confirmado',NOW()+interval '1 day',NOW()+interval '1 day 30 minutes')`);
        return providerResponse(structuredOutput({ resposta: ['O valor é R$ 699,00.'] }));
      }, signal) };
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), 'needs_human');
    assert.deepEqual(f.state.sends, []);
    assert.equal((await f.readTurn()).inputTokens, 100);
    assert.equal((await f.readTurn()).error, 'price_after_booking');
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test("complemento que virou apenas reapresentação é descartado sem apagar o primeiro envio concluído", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    const deps = { ...f.deps, loadContext: loadAliceAutonomousContext, generate: (context, _, signal) => generateAliceAutonomousReply(context,
      async () => providerResponse(structuredOutput({ resposta: ['Sou a Alice, assistente virtual da Virtuosa.', 'Me chamo Alice, da Clínica Virtuosa.'] })), signal) };
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, deps), 'queued');
    await f.pg.query(`UPDATE "AliceAutonomousTurn" SET "availableAt"=NOW()-interval '1 second' WHERE id=$1`, [f.claim.turn.id]);
    const next = await claimAliceAutonomousTurn(f.adapter);
    assert.equal(await processAliceAutonomousTurn(next, {}, deps), 'sent');
    assert.equal((await f.readTurn()).status, 'sent');
    assert.equal(f.state.sends.length, 1);
    assert.equal((await f.readChat()).unreadCount, 0, "o primeiro balão já aceito concluiu o atendimento");
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});

test("turno preparado antes do deploy conserva o envio protegido sem gerar ou inventar um resumo", async () => {
  enableMemory();
  const f = await runnerFixture(claimAliceAutonomousTurn, { memory: true });
  try {
    const messages = ['Sou a Alice, assistente virtual da Virtuosa.'];
    await f.pg.query(`UPDATE "AliceAutonomousTurn" SET "messagesJson"=$1::jsonb WHERE id=$2`, [JSON.stringify(messages), f.claim.turn.id]);
    f.claim.turn.messagesJson = messages;
    assert.equal(await processAliceAutonomousTurn(f.claim, {}, { ...f.deps, loadContext: loadAliceAutonomousContext }), 'sent');
    assert.equal(f.state.generations, 0);
    const memory = await getOrCreateMemory(scopeOf(f), {}, f.adapter);
    assert.equal(memory.resumo, null);
    assert.ok(memory.apresentacaoFeitaEm);
  } finally { delete process.env.ALICE_CONVERSATION_MEMORY_SBC_ENABLED; await f.pg.close(); }
});
