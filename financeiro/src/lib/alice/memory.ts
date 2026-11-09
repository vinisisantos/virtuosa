import { randomUUID } from "node:crypto";
import { Prisma, type LeadMemory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { containsAliceIntroduction } from "@/lib/ai-assistant/conversation-presentation";
import { inboxMessageAuthorName } from "@/lib/whatsapp/inbox-attendant";
import { AliceMemoryError, MEMORY_FIELDS, prepareMemoryUpdate, type AliceMemoryScope, type AliceMemoryUpdate, type MemoryField } from "@/lib/alice/memory-input";

export { AliceMemoryError, type AliceMemoryScope, type AliceMemoryUpdate } from "@/lib/alice/memory-input";
type MemoryDatabase = Pick<typeof prisma, "$queryRaw">;

function scopeCondition(scope: AliceMemoryScope): Prisma.Sql {
  if (!scope || typeof scope.conversationId !== "string" || !scope.conversationId.trim()
    || scope.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || scope.unidade !== "SBC") throw new AliceMemoryError("invalid_scope");
  return Prisma.sql`c.id=${scope.conversationId} AND c."instanceId"=${scope.instanceId} AND i.unit='SBC'`;
}

function memoryValue(field: MemoryField, value: string | boolean | string[]): Prisma.Sql {
  if (Array.isArray(value)) return Prisma.sql`ARRAY[${value.length ? Prisma.join(value) : Prisma.empty}]::TEXT[]`;
  return field.kind === "level" ? Prisma.sql`${value}::"LeadMemoryResultLevel"` : Prisma.sql`${value}`;
}

async function readMemory(scope: AliceMemoryScope, database: MemoryDatabase): Promise<LeadMemory | undefined> {
  const rows = await database.$queryRaw<LeadMemory[]>(Prisma.sql`
    SELECT m.* FROM "LeadMemory" m
    JOIN "WhatsAppConversation" c ON c.id=m."conversationId"
    JOIN "WhatsAppInstance" i ON i.id=c."instanceId"
    WHERE ${scopeCondition(scope)} AND m.unidade='SBC'`);
  return rows[0];
}

export async function getOrCreateMemory(
  scope: AliceMemoryScope, initialData: AliceMemoryUpdate = {}, database: MemoryDatabase = prisma,
): Promise<LeadMemory> {
  const condition = scopeCondition(scope);
  const patch = prepareMemoryUpdate(initialData);
  const existing = await readMemory(scope, database);
  if (existing) return existing;
  const columns = [Prisma.sql`"id"`, Prisma.sql`"conversationId"`, Prisma.sql`"unidade"`, Prisma.sql`"updatedAt"`];
  const values = [Prisma.sql`${randomUUID()}`, Prisma.sql`${scope.conversationId}`, Prisma.sql`'SBC'`, Prisma.sql`CURRENT_TIMESTAMP`];
  for (const field of MEMORY_FIELDS) {
    const value = patch[field.key];
    if (value === undefined) continue;
    columns.push(Prisma.raw(`"${field.key}"`));
    values.push(memoryValue(field, value));
  }
  const rows = await database.$queryRaw<LeadMemory[]>(Prisma.sql`
    INSERT INTO "LeadMemory" (${Prisma.join(columns)})
    SELECT ${Prisma.join(values)} FROM "WhatsAppConversation" c
    JOIN "WhatsAppInstance" i ON i.id=c."instanceId" WHERE ${condition}
    ON CONFLICT ("conversationId") DO UPDATE SET "conversationId"=EXCLUDED."conversationId"
      WHERE "LeadMemory".unidade='SBC'
    RETURNING "LeadMemory".*`);
  if (!rows[0]) throw new AliceMemoryError("memory_unavailable");
  return rows[0];
}

function updateExpression(field: MemoryField, value: string | boolean | string[]): Prisma.Sql {
  // Os nomes vêm exclusivamente da lista estática, nunca de identificadores do payload.
  const column = Prisma.raw(`m."${field.key}"`);
  const incoming = memoryValue(field, value);
  if (field.kind === "list") return Prisma.sql`ARRAY(
    SELECT entry.value FROM unnest(${column} || ${incoming}) WITH ORDINALITY AS entry(value, position)
    GROUP BY entry.value ORDER BY min(entry.position))`;
  if (field.kind === "origin") return Prisma.sql`COALESCE(${column}, ${incoming})`;
  if (field.kind === "escalation") return Prisma.sql`(${column} OR ${incoming})`;
  return incoming;
}

export async function applyMemoryUpdate(
  scope: AliceMemoryScope, update: AliceMemoryUpdate, database: MemoryDatabase = prisma,
): Promise<LeadMemory> {
  const condition = scopeCondition(scope);
  const patch = prepareMemoryUpdate(update);
  const changes: Prisma.Sql[] = [];
  for (const field of MEMORY_FIELDS) {
    const value = patch[field.key];
    if (value !== undefined) changes.push(Prisma.sql`${Prisma.raw(`"${field.key}"`)}=${updateExpression(field, value)}`);
  }
  if (!changes.length) {
    const existing = await readMemory(scope, database);
    if (!existing) throw new AliceMemoryError("memory_unavailable");
    return existing;
  }
  // O merge ocorre na própria escrita: duas atualizações de listas não perdem itens.
  const rows = await database.$queryRaw<LeadMemory[]>(Prisma.sql`
    UPDATE "LeadMemory" m SET ${Prisma.join(changes)}, "updatedAt"=clock_timestamp()
    FROM "WhatsAppConversation" c JOIN "WhatsAppInstance" i ON i.id=c."instanceId"
    WHERE m."conversationId"=c.id AND m.unidade='SBC' AND ${condition} RETURNING m.*`);
  if (!rows[0]) throw new AliceMemoryError("memory_unavailable");
  return rows[0];
}

type PresentationProof = { id: string; body: string; timestamp: Date; respondedByName: string | null };

export async function markPresentationDone(
  scope: AliceMemoryScope, sentMessageRowId: string, database: MemoryDatabase = prisma,
): Promise<LeadMemory> {
  const condition = scopeCondition(scope);
  if (typeof sentMessageRowId !== "string" || !sentMessageRowId.trim()) throw new AliceMemoryError("presentation_unproven");
  const proof = (await database.$queryRaw<PresentationProof[]>(Prisma.sql`
    SELECT p.id, p.body, p.timestamp, p."respondedByName" FROM "WhatsAppMessage" p
    JOIN "WhatsAppConversation" c ON c.id=p."conversationId"
    JOIN "WhatsAppInstance" i ON i.id=c."instanceId"
    WHERE ${condition} AND p.id=${sentMessageRowId} AND p."fromMe"=TRUE
      AND p.type='text' AND p.status IN ('sent','delivered','read','played')`))[0];
  const normalized = proof?.body.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (!proof || (!containsAliceIntroduction(proof.body)
    && !/\b(?:sou|me chamo|meu nome e)\s+(?:a\s+)?claudenice\b/u.test(normalized || ""))) throw new AliceMemoryError("presentation_unproven");
  const aliceAt = inboxMessageAuthorName(proof) === "Alice" ? proof.timestamp : null;
  const rows = await database.$queryRaw<LeadMemory[]>(Prisma.sql`
    UPDATE "LeadMemory" m SET
      "apresentacaoFeitaEm"=COALESCE(m."apresentacaoFeitaEm", p.timestamp),
      "ultimaMensagemAliceEm"=GREATEST(m."ultimaMensagemAliceEm", ${aliceAt}::TIMESTAMP(3)),
      "updatedAt"=CASE WHEN m."apresentacaoFeitaEm" IS NULL
        OR (m."ultimaMensagemAliceEm" IS NULL AND ${aliceAt}::TIMESTAMP(3) IS NOT NULL)
        OR m."ultimaMensagemAliceEm"<${aliceAt}::TIMESTAMP(3) THEN clock_timestamp() ELSE m."updatedAt" END
    FROM "WhatsAppConversation" c JOIN "WhatsAppInstance" i ON i.id=c."instanceId"
      JOIN "WhatsAppMessage" p ON p."conversationId"=c.id
    WHERE ${condition} AND m."conversationId"=c.id AND m.unidade='SBC'
      AND p.id=${proof.id} AND p.body=${proof.body} AND p.timestamp=${proof.timestamp}
      AND p."respondedByName" IS NOT DISTINCT FROM ${proof.respondedByName}
      AND p."fromMe"=TRUE AND p.type='text' AND p.status IN ('sent','delivered','read','played')
    RETURNING m.*`);
  if (!rows[0]) throw new AliceMemoryError("presentation_unproven");
  return rows[0];
}
