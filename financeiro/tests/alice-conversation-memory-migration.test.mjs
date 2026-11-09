import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../prisma/migrations/20261109100000_alice_conversation_memory/migration.sql", import.meta.url), "utf8");
const insertMemory = 'INSERT INTO "LeadMemory" (id, "conversationId", unidade, "updatedAt") VALUES ($1, $2, $3, now())';

test("schema de memória da Alice: migração aditiva isolada, sem banco externo", async (t) => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE TABLE "WhatsAppConversation" (
        id TEXT PRIMARY KEY, "contactId" TEXT NOT NULL, "instanceId" TEXT NOT NULL,
        "aiMode" TEXT NOT NULL DEFAULT 'agent', "unreadCount" INTEGER NOT NULL DEFAULT 2,
        UNIQUE ("contactId", "instanceId")
      );
      INSERT INTO "WhatsAppConversation" (id, "contactId", "instanceId") VALUES
        ('chat-a', 'same-contact', 'instance-a'), ('chat-b', 'same-contact', 'instance-b'),
        ('chat-c', 'other-contact', 'instance-a');
    `);
    const conversationsBefore = (await pg.query('SELECT * FROM "WhatsAppConversation" ORDER BY id')).rows;
    await pg.exec(migration);

    await t.test("cria a estrutura vazia sem modificar conversas ou ativar atendimento", async () => {
      assert.equal((await pg.query('SELECT count(*)::int AS n FROM "LeadMemory"')).rows[0].n, 0);
      assert.deepEqual((await pg.query('SELECT * FROM "WhatsAppConversation" ORDER BY id')).rows, conversationsBefore);
      await pg.query(insertMemory, ["memory-a", "chat-a", "SBC"]);
      const memory = (await pg.query('SELECT * FROM "LeadMemory" WHERE id=$1', ["memory-a"])).rows[0];
      assert.equal(memory.nome, null);
      assert.equal(memory.nomeConfirmado, false);
      assert.equal(memory.primeiraVez, null);
      assert.equal(memory.precoPerguntado, false);
      assert.equal(memory.nivelResultado, "NAO_INFORMADO");
      assert.equal(memory.etapaFunil, "NOVO");
      assert.equal(memory.escalarHumano, false);
      assert.equal(memory.apresentacaoFeitaEm, null);
      assert.deepEqual(memory.objecoes, []);
      assert.deepEqual(memory.perguntasFeitas, []);
      assert.ok(memory.createdAt);
    });

    await t.test("mesmo contato em caixas distintas tem memórias distintas e uma por conversa", async () => {
      await pg.query(insertMemory, ["memory-b", "chat-b", "SBC"]);
      await pg.query('UPDATE "LeadMemory" SET "queixaPrincipal"=$1 WHERE "conversationId"=$2', ["Objetivo informado na caixa A", "chat-a"]);
      assert.equal((await pg.query('SELECT "queixaPrincipal" FROM "LeadMemory" WHERE "conversationId"=$1', ["chat-b"])).rows[0].queixaPrincipal, null);
      await assert.rejects(pg.query(insertMemory, ["duplicate", "chat-a", "SBC"]), { code: "23505" });
      await assert.rejects(pg.query(insertMemory, ["orphan", "missing-chat", "SBC"]), { code: "23503" });
    });

    await t.test("exige unidade explícita e restringe o armazenamento ao piloto SBC", async () => {
      await assert.rejects(pg.query(insertMemory, ["wrong-unit", "chat-c", "Osasco"]), { code: "23514" });
      await assert.rejects(pg.query(insertMemory, ["missing-unit", "chat-c", null]), { code: "23502" });
    });

    await t.test("valida enums, arrays não nulos e resumo até 600 caracteres", async () => {
      await assert.rejects(pg.query('UPDATE "LeadMemory" SET "nivelResultado"=$1 WHERE id=$2', ["INVALIDO", "memory-a"]), { code: "22P02" });
      await assert.rejects(pg.query('UPDATE "LeadMemory" SET "etapaFunil"=$1 WHERE id=$2', ["INVALIDO", "memory-a"]), { code: "22P02" });
      await assert.rejects(pg.exec('UPDATE "LeadMemory" SET "perguntasFeitas"=NULL WHERE id=\'memory-a\''), { code: "23502" });
      await assert.rejects(pg.exec('UPDATE "LeadMemory" SET objecoes=NULL WHERE id=\'memory-a\''), { code: "23502" });
      await pg.query('UPDATE "LeadMemory" SET resumo=$1 WHERE id=$2', ["á".repeat(600), "memory-a"]);
      await assert.rejects(pg.query('UPDATE "LeadMemory" SET resumo=$1 WHERE id=$2', ["á".repeat(601), "memory-a"]), { code: "22001" });
      assert.equal((await pg.query('SELECT char_length(resumo) AS n FROM "LeadMemory" WHERE id=$1', ["memory-a"])).rows[0].n, 600);
    });

    await t.test("reexecutar preserva conteúdo, prova de apresentação e todos os dados anteriores", async () => {
      await pg.query('UPDATE "LeadMemory" SET "apresentacaoFeitaEm"=$1, "perguntasFeitas"=$2, objecoes=$3 WHERE id=$4', ["2026-11-09T12:00:00Z", ["queixa"], ["horário"], "memory-a"]);
      const memoriesBefore = (await pg.query('SELECT * FROM "LeadMemory" ORDER BY id')).rows;
      await pg.exec(migration);
      await pg.exec(migration);
      assert.deepEqual((await pg.query('SELECT * FROM "LeadMemory" ORDER BY id')).rows, memoriesBefore);
      assert.deepEqual((await pg.query('SELECT * FROM "WhatsAppConversation" ORDER BY id')).rows, conversationsBefore);
    });

    await t.test("habilita RLS sem políticas públicas e revoga acesso das roles de navegador", async () => {
      assert.equal((await pg.query("SELECT relrowsecurity FROM pg_class WHERE oid='\"LeadMemory\"'::regclass")).rows[0].relrowsecurity, true);
      assert.equal((await pg.query("SELECT count(*)::int AS n FROM pg_policy WHERE polrelid='\"LeadMemory\"'::regclass")).rows[0].n, 0);
      await pg.exec('GRANT ALL ON "LeadMemory" TO PUBLIC, anon, authenticated');
      await pg.exec(migration);
      for (const role of ["anon", "authenticated"]) {
        const privileges = (await pg.query(`SELECT
          has_table_privilege($1, '"LeadMemory"', 'SELECT') AS "canRead",
          has_table_privilege($1, '"LeadMemory"', 'INSERT') AS "canInsert",
          has_table_privilege($1, '"LeadMemory"', 'UPDATE') AS "canUpdate",
          has_table_privilege($1, '"LeadMemory"', 'DELETE') AS "canDelete"`, [role])).rows[0];
        assert.deepEqual(privileges, { canRead: false, canInsert: false, canUpdate: false, canDelete: false });
      }
    });

    await t.test("não mantém memória órfã quando a conversa correspondente é excluída", async () => {
      await pg.query('DELETE FROM "WhatsAppConversation" WHERE id=$1', ["chat-b"]);
      assert.equal((await pg.query('SELECT count(*)::int AS n FROM "LeadMemory" WHERE "conversationId"=$1', ["chat-b"])).rows[0].n, 0);
      assert.equal((await pg.query('SELECT count(*)::int AS n FROM "LeadMemory" WHERE "conversationId"=$1', ["chat-a"])).rows[0].n, 1);
    });
  } finally {
    await pg.close();
  }
});
