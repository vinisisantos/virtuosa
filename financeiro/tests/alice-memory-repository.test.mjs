import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ALICE_AUTONOMY_INSTANCE_ID } from "../src/lib/ai-assistant/autonomy/policy.ts";

globalThis.prisma = { $queryRaw: () => { throw new Error("Banco real proibido no teste"); } };
const { getOrCreateMemory, applyMemoryUpdate, markPresentationDone, recordAliceSentMessage } = await import("../src/lib/alice/memory.ts");
const scope = { conversationId: "chat-a", instanceId: ALICE_AUTONOMY_INSTANCE_ID, unidade: "SBC" };
const introduction = "Olá! Sou a Alice, assistente virtual da Virtuosa.";
const firstSentAt = new Date("2026-11-08T12:00:00.000Z");

async function fixture() {
  // Prisma interpreta TIMESTAMP como UTC; o parser padrão do PGlite usa o fuso local.
  const pg = new PGlite({ parsers: { 1114: (value) => new Date(`${value}Z`) } });
  await pg.exec(`
    SET TIME ZONE 'UTC';
    CREATE TABLE "WhatsAppInstance" (id TEXT PRIMARY KEY, unit TEXT);
    CREATE TABLE "WhatsAppConversation" (id TEXT PRIMARY KEY, "contactId" TEXT, "instanceId" TEXT, "aiMode" TEXT DEFAULT 'agent');
    CREATE TABLE "WhatsAppMessage" (id TEXT PRIMARY KEY, "conversationId" TEXT, "messageId" TEXT,
      body TEXT, "fromMe" BOOLEAN, type TEXT DEFAULT 'text', status TEXT DEFAULT 'sent', timestamp TIMESTAMP(3), "respondedByName" TEXT, "respondedBy" TEXT);
  `);
  await pg.query('INSERT INTO "WhatsAppInstance" VALUES ($1,\'SBC\'),(\'other-box\',\'SBC\'),(\'osasco\',\'Osasco\')', [scope.instanceId]);
  await pg.query('INSERT INTO "WhatsAppConversation" (id,"contactId","instanceId") VALUES (\'chat-a\',\'contact-a\',$1),(\'chat-b\',\'contact-b\',$1),(\'same-contact-other-box\',\'contact-a\',\'other-box\'),(\'chat-osasco\',\'contact-c\',\'osasco\')', [scope.instanceId]);
  await pg.exec(await readFile(new URL("../prisma/migrations/20261109100000_alice_conversation_memory/migration.sql", import.meta.url), "utf8"));
  const calls = [];
  const db = { async $queryRaw(query) {
    calls.push(query.text);
    return (await pg.query(query.text, query.values)).rows;
  } };
  return { pg, calls, db };
}

async function addMessage(pg, changes = {}) {
  const message = { id: "intro", conversationId: "chat-a", messageId: "provider-id", body: introduction,
    fromMe: true, type: "text", status: "sent", timestamp: firstSentAt, respondedByName: "Alice", respondedBy: null, ...changes };
  await pg.query('INSERT INTO "WhatsAppMessage" (id,"conversationId","messageId",body,"fromMe",type,status,timestamp,"respondedByName","respondedBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', Object.values(message));
}

test("repositório de memória em PostgreSQL isolado: escopo, merge atômico e prova de apresentação", async (t) => {
  const f = await fixture();
  const run = async (name, work) => t.test(name, async () => {
    await f.pg.exec('DELETE FROM "LeadMemory"; DELETE FROM "WhatsAppMessage"');
    f.calls.length = 0;
    await work();
  });
  try {
    await run("cria uma vez com texto sem máscaras e relê sem sobrescrever ou tocar no updatedAt", async () => {
      const initial = await getOrCreateMemory(scope, { nome: "Camila Teste 🍀", primeiraVez: false, objecoes: [] }, f.db);
      assert.equal(f.calls.length, 2);
      assert.equal(initial.nome, "Camila Teste 🍀");
      assert.equal(initial.primeiraVez, false);
      f.calls.length = 0;
      const again = await getOrCreateMemory(scope, { nome: "Outro nome" }, f.db);
      assert.deepEqual(again, initial);
      assert.equal(f.calls.length, 1);
    });

    await run("criações simultâneas retornam a mesma memória sem duplicar registros", async () => {
      const memories = await Promise.all(Array.from({ length: 5 }, () => getOrCreateMemory(scope, {}, f.db)));
      assert.equal(new Set(memories.map((memory) => memory.id)).size, 1);
      assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM "LeadMemory"')).rows[0].n, 1);
    });

    await run("null não apaga, false é válido, listas unem e resumo é substituído", async () => {
      await getOrCreateMemory(scope, { nome: "Nome preservado", primeiraVez: true, objecoes: ["valor"], perguntasFeitas: ["queixa"], resumo: "Resumo antigo" }, f.db);
      f.calls.length = 0;
      const merged = await applyMemoryUpdate(scope, { nome: null, primeiraVez: false, objecoes: ["valor", "horário"], perguntasFeitas: ["queixa", "nome"], resumo: "Resumo novo", nivelResultado: "MEDIO" }, f.db);
      assert.equal(f.calls.length, 1);
      assert.equal(merged.nome, "Nome preservado");
      assert.equal(merged.primeiraVez, false);
      assert.equal(merged.resumo, "Resumo novo");
      assert.equal(merged.nivelResultado, "MEDIO");
      assert.deepEqual(merged.objecoes, ["valor", "horário"]);
      assert.deepEqual(merged.perguntasFeitas, ["queixa", "nome"]);
      const untouched = await applyMemoryUpdate(scope, { nome: "  ", resumo: null, objecoes: null }, f.db);
      assert.deepEqual(untouched, merged);
      assert.deepEqual((await applyMemoryUpdate(scope, { objecoes: [] }, f.db)).objecoes, merged.objecoes);
    });

    await run("atualizações concorrentes preservam itens e campos distintos", async () => {
      await getOrCreateMemory(scope, { perguntasFeitas: ["nome"] }, f.db);
      await Promise.all([
        applyMemoryUpdate(scope, { perguntasFeitas: ["queixa"], procedimentoInteresse: "Lipo Laser" }, f.db),
        applyMemoryUpdate(scope, { perguntasFeitas: ["primeira_vez"], queixaPrincipal: "Flacidez" }, f.db),
      ]);
      const memory = await getOrCreateMemory(scope, {}, f.db);
      assert.deepEqual(new Set(memory.perguntasFeitas), new Set(["nome", "queixa", "primeira_vez"]));
      assert.equal(memory.procedimentoInteresse, "Lipo Laser");
      assert.equal(memory.queixaPrincipal, "Flacidez");
    });

    await run("origem preenchida é preservada e modelo não remove encaminhamento humano", async () => {
      await getOrCreateMemory(scope, { campanhaOrigem: "Lipo Laser", escalarHumano: true }, f.db);
      const memory = await applyMemoryUpdate(scope, { campanhaOrigem: "Outra campanha", escalarHumano: false }, f.db);
      assert.equal(memory.campanhaOrigem, "Lipo Laser");
      assert.equal(memory.escalarHumano, true);
    });

    await run("valida conversa, caixa e unidade sem misturar o mesmo contato entre instâncias", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      for (const other of [{ ...scope, conversationId: "same-contact-other-box" }, { ...scope, conversationId: "chat-osasco" }]) {
        await assert.rejects(getOrCreateMemory(other, {}, f.db), { code: "memory_unavailable" });
        await assert.rejects(applyMemoryUpdate(other, { nome: "Não deve gravar" }, f.db), { code: "memory_unavailable" });
      }
      f.calls.length = 0;
      for (const other of [{ ...scope, unidade: "Osasco" }, { ...scope, instanceId: "other-box" }, { ...scope, conversationId: "" }]) {
        await assert.rejects(getOrCreateMemory(other, {}, f.db), { code: "invalid_scope" });
      }
      assert.equal(f.calls.length, 0);
      assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM "LeadMemory"')).rows[0].n, 1);
    });

    await run("revalida unidade atual da instância mesmo com memória já existente", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await f.pg.query('UPDATE "WhatsAppInstance" SET unit=\'Osasco\' WHERE id=$1', [scope.instanceId]);
      try {
        await assert.rejects(getOrCreateMemory(scope, {}, f.db), { code: "memory_unavailable" });
        await assert.rejects(applyMemoryUpdate(scope, { nome: "Não pode" }, f.db), { code: "memory_unavailable" });
      } finally { await f.pg.query('UPDATE "WhatsAppInstance" SET unit=\'SBC\' WHERE id=$1', [scope.instanceId]); }
    });

    await run("parâmetros de texto são dados, nunca SQL executável", async () => {
      const text = "Dúvida'); DROP TABLE \"LeadMemory\"; --\nNome sem máscara 😊";
      await getOrCreateMemory(scope, {}, f.db);
      assert.equal((await applyMemoryUpdate(scope, { queixaPrincipal: text }, f.db)).queixaPrincipal, text);
      assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM "LeadMemory"')).rows[0].n, 1);
    });

    await run("campos protegidos e dados inválidos falham antes de escrever", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      f.calls.length = 0;
      for (const update of [{ etapaFunil: "AGENDADO" }, { apresentacaoFeitaEm: firstSentAt }, { conversationId: "chat-b" }, { resumo: "a".repeat(601) }]) {
        await assert.rejects(applyMemoryUpdate(scope, update, f.db), { code: "invalid_update" });
      }
      assert.equal(f.calls.length, 0);
      await assert.rejects(applyMemoryUpdate({ ...scope, conversationId: "chat-b" }, { nome: "sem memória" }, f.db), { code: "memory_unavailable" });
    });

    await run("só mensagem de saída aceita da conversa exata comprova apresentação", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await addMessage(f.pg, { fromMe: false });
      await assert.rejects(markPresentationDone(scope, "intro", f.db), { code: "presentation_unproven" });
      for (const status of ["pending", "error", "deleted"]) {
        await f.pg.query('UPDATE "WhatsAppMessage" SET "fromMe"=TRUE,status=$1 WHERE id=\'intro\'', [status]);
        await assert.rejects(markPresentationDone(scope, "intro", f.db), { code: "presentation_unproven" });
      }
      await f.pg.exec('UPDATE "WhatsAppMessage" SET status=\'sent\' WHERE id=\'intro\'');
      await getOrCreateMemory({ ...scope, conversationId: "chat-b" }, {}, f.db);
      await addMessage(f.pg, { id: "other-intro", conversationId: "chat-b", body: "Qual região você quer tratar?" });
      await assert.rejects(markPresentationDone({ ...scope, conversationId: "chat-b" }, "intro", f.db), { code: "presentation_unproven" });
      await assert.rejects(markPresentationDone(scope, "provider-id", f.db), { code: "presentation_unproven" });
      f.calls.length = 0;
      const memory = await markPresentationDone(scope, "intro", f.db);
      assert.equal(f.calls.length, 2);
      assert.equal(memory.apresentacaoFeitaEm.getTime(), firstSentAt.getTime());
      assert.equal(memory.ultimaMensagemAliceEm.getTime(), firstSentAt.getTime());
    });

    await run("marcação é idempotente e não troca a data da primeira apresentação", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await addMessage(f.pg);
      const first = await markPresentationDone(scope, "intro", f.db);
      assert.deepEqual(await markPresentationDone(scope, "intro", f.db), first);
      const later = new Date("2026-11-09T12:00:00.000Z");
      await addMessage(f.pg, { id: "later-intro", timestamp: later });
      const memory = await markPresentationDone(scope, "later-intro", f.db);
      assert.equal(memory.apresentacaoFeitaEm.getTime(), firstSentAt.getTime());
      assert.equal(memory.ultimaMensagemAliceEm.getTime(), later.getTime());
    });

    await run("apresentação humana não inventa uma saída da Alice e legado é reconhecido", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await addMessage(f.pg, { body: "Olá! Me chamo Claudenice, da Virtuosa.", respondedByName: "Claudenice" });
      const human = await markPresentationDone(scope, "intro", f.db);
      assert.equal(human.apresentacaoFeitaEm.getTime(), firstSentAt.getTime());
      assert.equal(human.ultimaMensagemAliceEm, null);
      await addMessage(f.pg, { id: "legacy", respondedByName: "Alice (automação)" });
      assert.equal((await markPresentationDone(scope, "legacy", f.db)).ultimaMensagemAliceEm.getTime(), firstSentAt.getTime());
    });

    await run("boas-vindas genéricas e resposta sem apresentação não criam a prova", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await addMessage(f.pg, { body: "Olá! Seja muito bem-vinda à Clínica Virtuosa!" });
      await assert.rejects(markPresentationDone(scope, "intro", f.db), { code: "presentation_unproven" });
      assert.equal((await getOrCreateMemory(scope, {}, f.db)).apresentacaoFeitaEm, null);
    });

    await run("mudança da mensagem entre leitura e gravação invalida a prova", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await addMessage(f.pg);
      let calls = 0;
      const changing = { async $queryRaw(query) {
        if (calls++ === 1) await f.pg.exec('UPDATE "WhatsAppMessage" SET status=\'error\' WHERE id=\'intro\'');
        return f.db.$queryRaw(query);
      } };
      await assert.rejects(markPresentationDone(scope, "intro", changing), { code: "presentation_unproven" });
      assert.equal((await getOrCreateMemory(scope, {}, f.db)).apresentacaoFeitaEm, null);
    });

    await run("resposta aceita da Alice atualiza sua última saída sem inventar apresentação", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await addMessage(f.pg, { body: "De nada! Estou por aqui 😊" });
      const updated = await recordAliceSentMessage(scope, "intro", f.db);
      assert.equal(updated.ultimaMensagemAliceEm.getTime(), firstSentAt.getTime());
      assert.equal(updated.apresentacaoFeitaEm, null);
      assert.deepEqual(await recordAliceSentMessage(scope, "intro", f.db), updated);
    });

    await run("nome Alice em mensagem de uma usuária humana não prova saída autônoma", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await addMessage(f.pg, { respondedBy: "human-user-id" });
      await assert.rejects(recordAliceSentMessage(scope, "intro", f.db), { code: "message_unproven" });
      assert.equal((await getOrCreateMemory(scope, {}, f.db)).ultimaMensagemAliceEm, null);
    });

    await run("apresentação aceita com nome formatado e legado é comprovada pelo próprio texto", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await addMessage(f.pg, { body: "Olá! Sou a *Alice*, da Clínica Virtuosa." });
      const recorded = await recordAliceSentMessage(scope, "intro", f.db);
      assert.equal(recorded.apresentacaoFeitaEm.getTime(), firstSentAt.getTime());
      assert.equal(recorded.ultimaMensagemAliceEm.getTime(), firstSentAt.getTime());
    });

    await run("recibo pendente, de cliente, humano ou outra conversa não atualiza a memória", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      for (const [index, patch] of [{ status: "pending" }, { status: "error" }, { status: "deleted" }, { fromMe: false },
        { respondedByName: "Claudenice" }, { respondedByName: "Automação de recepção" }, { type: "audio" }, { conversationId: "chat-b" }].entries()) {
        await addMessage(f.pg, { id: `not-accepted-${index}`, ...patch });
        await assert.rejects(recordAliceSentMessage(scope, `not-accepted-${index}`, f.db), { code: "message_unproven" });
      }
      await assert.rejects(recordAliceSentMessage(scope, "provider-id", f.db), { code: "message_unproven" });
      const untouched = await getOrCreateMemory(scope, {}, f.db);
      assert.equal(untouched.ultimaMensagemAliceEm, null);
      assert.equal(untouched.apresentacaoFeitaEm, null);
    });

    await run("última saída avança monotonicamente sem trocar a primeira apresentação", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await addMessage(f.pg);
      await recordAliceSentMessage(scope, "intro", f.db);
      const later = new Date("2026-11-09T12:00:00.000Z");
      await addMessage(f.pg, { id: "later", body: "De nada!", timestamp: later, respondedByName: "Alice (automação)" });
      f.calls.length = 0;
      const updated = await recordAliceSentMessage(scope, "later", f.db);
      assert.equal(f.calls.length, 2);
      assert.equal(updated.apresentacaoFeitaEm.getTime(), firstSentAt.getTime());
      assert.equal(updated.ultimaMensagemAliceEm.getTime(), later.getTime());
      assert.deepEqual(await recordAliceSentMessage(scope, "intro", f.db), updated);
    });

    await run("mudança de autoria, conteúdo, status ou unidade entre leitura e escrita invalida recibo", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      const alterations = [
        'UPDATE "WhatsAppMessage" SET "respondedBy"=\'human-user\' WHERE id=\'changed\'',
        'UPDATE "WhatsAppMessage" SET "respondedByName"=\'Claudenice\' WHERE id=\'changed\'',
        'UPDATE "WhatsAppMessage" SET body=\'Outro texto\' WHERE id=\'changed\'',
        'UPDATE "WhatsAppMessage" SET status=\'error\' WHERE id=\'changed\'',
        `UPDATE "WhatsAppInstance" SET unit='Osasco' WHERE id='${scope.instanceId}'`,
      ];
      for (const alteration of alterations) {
        await f.pg.exec('DELETE FROM "WhatsAppMessage"');
        await addMessage(f.pg, { id: "changed" });
        let calls = 0;
        const changing = { async $queryRaw(query) {
          if (calls++ === 1) await f.pg.exec(alteration);
          return f.db.$queryRaw(query);
        } };
        try { await assert.rejects(recordAliceSentMessage(scope, "changed", changing), { code: "message_unproven" }); }
        finally { await f.pg.query('UPDATE "WhatsAppInstance" SET unit=\'SBC\' WHERE id=$1', [scope.instanceId]); }
      }
      assert.equal((await getOrCreateMemory(scope, {}, f.db)).ultimaMensagemAliceEm, null);
    });

    await run("a mesma apresentação reconhecida pela trava é comprovada após envio aceito", async () => {
      await getOrCreateMemory(scope, {}, f.db);
      await addMessage(f.pg, { body: "Aqui é a Alice, da Clínica Virtuosa." });
      const recorded = await recordAliceSentMessage(scope, "intro", f.db);
      assert.equal(recorded.apresentacaoFeitaEm?.getTime(), firstSentAt.getTime());
    });
  } finally { await f.pg.close(); }
});
