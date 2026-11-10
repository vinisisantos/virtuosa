import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";

const migrationUrl = new URL("../../prisma/migrations/20261109010000_alice_autonomous_turns/migration.sql", import.meta.url);
const quote = (key) => Prisma.raw(`"${key}"`);
const condition = (key, value) => {
  if (value === null) return Prisma.sql`${quote(key)} IS NULL`;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("in" in value) return Prisma.sql`${quote(key)} IN (${Prisma.join(value.in)})`;
    if ("not" in value) return Prisma.sql`${quote(key)} <> ${value.not}`;
    if ("lt" in value) return Prisma.sql`${quote(key)} < ${value.lt}`;
    if ("lte" in value) return Prisma.sql`${quote(key)} <= ${value.lte}`;
    if ("gt" in value) return Prisma.sql`${quote(key)} > ${value.gt}`;
    if ("gte" in value) return Prisma.sql`${quote(key)} >= ${value.gte}`;
  }
  return Prisma.sql`${quote(key)} = ${value}`;
};
const whereSql = (where) => Prisma.join(Object.entries(where).map(([key, value]) => condition(key, value)), " AND ");
const jsonFields = new Set(["messagesJson", "providerMessageIds"]);
const valueSql = (key, value) => value === Prisma.JsonNull ? Prisma.sql`'null'::jsonb`
  : jsonFields.has(key) && value !== null ? Prisma.sql`${JSON.stringify(value)}::jsonb` : Prisma.sql`${value}`;

// Adaptador restrito às fronteiras Prisma usadas pela fila. Nunca carrega o .env.
export function queueDatabase(pg) {
  const query = (sql) => pg.query(sql.text, sql.values);
  const updateMany = (table) => async ({ where, data }) => {
    const result = await query(Prisma.sql`UPDATE ${quote(table)} SET ${Prisma.join(Object.entries(data).filter(([, value]) => value !== undefined)
      .map(([key, value]) => Prisma.sql`${quote(key)} = ${valueSql(key, value)}`))} WHERE ${whereSql(where)}`);
    return { count: result.affectedRows };
  };
  const findMany = (table) => async ({ where, orderBy = [], take = 100 }) => {
    const order = Array.isArray(orderBy) ? orderBy : [orderBy];
    const suffix = order.length ? Prisma.sql`ORDER BY ${Prisma.join(order.flatMap((entry) => Object.entries(entry)
      .map(([key, direction]) => Prisma.sql`${quote(key)} ${Prisma.raw(direction.toUpperCase())}`)))}` : Prisma.empty;
    return (await query(Prisma.sql`SELECT * FROM ${quote(table)} WHERE ${whereSql(where)} ${suffix} LIMIT ${take}`)).rows;
  };
  const findFirst = (table) => async (args) => (await findMany(table)({ ...args, take: 1 }))[0] || null;
  const database = {
    $queryRaw: async (sql) => (await query(sql)).rows,
    $executeRaw: async (strings, ...values) => (await query(Prisma.sql(strings, ...values))).affectedRows,
    appSetting: { findMany: async ({ where }) => (await query(Prisma.sql`SELECT * FROM "AppSetting" WHERE ${whereSql(where)}`)).rows },
    whatsAppConversation: {
      findFirst: async (args) => {
        const conversation = await findFirst("WhatsAppConversation")(args);
        return conversation && { ...conversation,
          instance: await findFirst("WhatsAppInstance")({ where: { id: conversation.instanceId } }),
          commercialHolds: [], contact: { name: "Cliente de teste", phone: "5511900001234", unit: "SBC" } };
      },
      updateMany: updateMany("WhatsAppConversation"),
    },
    whatsAppMessage: { findFirst: findFirst("WhatsAppMessage"), findMany: findMany("WhatsAppMessage") },
    aliceAutoSchedule: { findUnique: ({ where }) => findFirst("AliceAutoSchedule")({ where: where.conversationId_replyMessageId }) },
    leadMemory: { findFirst: ({ where }) => findFirst("LeadMemory")({ where }) },
    client: { findMany: async () => [] },
    auditLog: { create: async ({ data }) => query(Prisma.sql`INSERT INTO "AuditLog" ("userName",action,entity,"entityId",details,unit)
      VALUES (${data.userName},${data.action},${data.entity},${data.entityId},${data.details},${data.unit})`) },
    aliceAutonomousTurn: {
      updateMany: updateMany("AliceAutonomousTurn"),
      update: async (args) => { await updateMany("AliceAutonomousTurn")(args); return findFirst("AliceAutonomousTurn")({ where: args.where }); },
      findFirst: findFirst("AliceAutonomousTurn"), findMany: findMany("AliceAutonomousTurn"),
      findUnique: ({ where }) => findFirst("AliceAutonomousTurn")({ where: where.conversationId_sourceMessageId || where }),
      upsert: async ({ create }) => {
        const keys = Object.keys(create);
        const inserted = await query(Prisma.sql`INSERT INTO "AliceAutonomousTurn" (${Prisma.join(keys.map(quote))})
          VALUES (${Prisma.join(keys.map((key) => valueSql(key, create[key])))})
          ON CONFLICT ("conversationId", "sourceMessageId") DO NOTHING RETURNING *`);
        return inserted.rows[0] || findFirst("AliceAutonomousTurn")({ where: { conversationId: create.conversationId, sourceMessageId: create.sourceMessageId } });
      },
    },
  };
  database.$transaction = async (operation) => Array.isArray(operation) ? Promise.all(operation)
    : pg.transaction((connection) => operation(queueDatabase(connection)));
  return database;
}

export async function database({ memory = false } = {}) {
  const pg = new PGlite({ parsers: { 1114: (value) => new Date(`${value}Z`) } });
  await pg.exec(`
    SET TIME ZONE 'UTC';
    CREATE TABLE "AppSetting" (
      "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "value" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "WhatsAppInstance" ("id" TEXT PRIMARY KEY, "unit" TEXT DEFAULT 'SBC', "status" TEXT DEFAULT 'connected', "provider" TEXT DEFAULT 'evolution', "name" TEXT DEFAULT 'fixture');
    CREATE TABLE "WhatsAppConversation" (
      "id" TEXT PRIMARY KEY,
      "instanceId" TEXT NOT NULL REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE,
      "aiMode" TEXT NOT NULL DEFAULT 'manual', "aiModeUpdatedAt" TIMESTAMP,
      "aiModeUpdatedBy" TEXT, "status" TEXT NOT NULL DEFAULT 'open',
      "blockedAt" TIMESTAMP, "archivedAt" TIMESTAMP, "commercialPaused" BOOLEAN NOT NULL DEFAULT FALSE,
      "unreadCount" INT NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "assignedTo" TEXT, "assignedToName" TEXT, "lastInboundAt" TIMESTAMP,
      "lastOutboundAt" TIMESTAMP, "lastKnownJid" TEXT
    );
    CREATE TABLE "WhatsAppMessage" (
      "id" TEXT PRIMARY KEY,
      "conversationId" TEXT NOT NULL REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE,
      "messageId" TEXT NOT NULL, "fromMe" BOOLEAN NOT NULL DEFAULT FALSE,
      "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "status" TEXT NOT NULL DEFAULT 'received', "body" TEXT NOT NULL DEFAULT 'Olá',
      "type" TEXT NOT NULL DEFAULT 'text', "respondedByName" TEXT, "respondedBy" TEXT,
      "mediaUrl" TEXT, "mediaMimeType" TEXT, "mediaSizeBytes" INT
    );
    CREATE TABLE "AliceAutoSchedule" (
      "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL, "replyMessageId" TEXT NOT NULL,
      "appointmentId" TEXT, "state" TEXT NOT NULL, "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO "WhatsAppInstance" (id) VALUES ('instance-a'), ('instance-b');
    INSERT INTO "WhatsAppConversation" ("id", "instanceId") VALUES ('conversation-a', 'instance-a'), ('conversation-b', 'instance-b');
    INSERT INTO "WhatsAppMessage" ("id", "conversationId", "messageId") VALUES
      ('source-a', 'conversation-a', 'same-provider-id'), ('source-b', 'conversation-b', 'same-provider-id');
  `);
  const migration = await readFile(migrationUrl, "utf8");
  await pg.exec(migration);
  await pg.exec(await readFile(new URL("../../prisma/migrations/20261109180000_alice_audio_transcription/migration.sql", import.meta.url), "utf8"));
  if (memory) {
    await pg.exec(await readFile(new URL("../../prisma/migrations/20261109100000_alice_conversation_memory/migration.sql", import.meta.url), "utf8"));
    await pg.exec(`CREATE TABLE "Agendamento" (id TEXT, unit TEXT, "clientPhone" TEXT, procedimento TEXT, status TEXT, "startTime" TIMESTAMP, "endTime" TIMESTAMP NOT NULL);
      CREATE TABLE "AuditLog" ("userName" TEXT, action TEXT, entity TEXT, "entityId" TEXT, details TEXT, unit TEXT);`);
  }
  return { pg, migration, adapter: queueDatabase(pg) };
}

export async function insertTurn(pg, overrides = {}) {
  const row = {
    id: "turn-a", conversationId: "conversation-a", instanceId: "instance-a",
    unit: "SBC", sourceMessageId: "source-a", status: "queued",
    model: "claude-sonnet-4-6", ...overrides,
  };
  return pg.query(`
    INSERT INTO "AliceAutonomousTurn"
      ("id", "conversationId", "instanceId", "unit", "sourceMessageId", "status", "model", "availableAt", "updatedAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *
  `, [row.id, row.conversationId, row.instanceId, row.unit, row.sourceMessageId, row.status, row.model]);
}

export async function activateFixture(pg, instanceId, now = new Date()) {
  const activatedAt = new Date(now.getTime() - 60_000).toISOString();
  await pg.query('INSERT INTO "WhatsAppInstance" (id) VALUES ($1) ON CONFLICT DO NOTHING', [instanceId]);
  await pg.query('UPDATE "WhatsAppConversation" SET "instanceId"=$1 WHERE id=\'conversation-a\'', [instanceId]);
  await pg.query('UPDATE "AppSetting" SET value=$1 WHERE key=\'alice_autonomous_sbc_v1\'', [JSON.stringify({ enabled: true, instanceId, activatedAt })]);
  await pg.query('INSERT INTO "AppSetting" (id,key,value) VALUES (\'assistant\',\'ai_assistant_alice_v1\',\'{"enabled":true}\')');
  await pg.query('UPDATE "WhatsAppMessage" SET timestamp=$1, "createdAt"=$1 WHERE id=\'source-a\'', [new Date(now.getTime() - 10_000)]);
}
