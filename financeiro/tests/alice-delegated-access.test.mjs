import assert from "node:assert/strict";
import test from "node:test";

const db = {
  user: { findUnique: async () => null },
  whatsAppConversation: { findFirst: async () => null },
  notification: { findFirst: async () => null },
};
globalThis.prisma = db;
const { loadAssignedAliceHandoff } = await import("#lib/ai-assistant/delegated-access");

const gabriela = "gabriela-id";
const conversation = {
  id: "conversation-id",
  instanceId: "sbc-instance",
  assignedTo: gabriela,
  status: "open",
  blockedAt: null,
  archivedAt: null,
  contact: { name: "Cliente" },
  instance: { id: "sbc-instance", unit: "SBC", status: "connected" },
};
const request = (userId) => new Request("https://example.test/api/crm/alice-handoff/conversation-id", {
  headers: { "x-user-id": userId },
});

test("delegação exige identidade, unidade e atribuição da conversa, nunca acesso à instância inteira", async () => {
  const previous = process.env.ALICE_SBC_HANDOFF_USER_ID;
  process.env.ALICE_SBC_HANDOFF_USER_ID = gabriela;
  const queries = [];
  db.user.findUnique = async () => ({
    id: gabriela, isActive: true, role: "GERENTE", unit: "SBC", permissions: { crm: true, unitSBC: true },
  });
  db.whatsAppConversation.findFirst = async (args) => {
    queries.push(args.where);
    return args.where.id === conversation.id ? conversation : null;
  };
  db.notification.findFirst = async (args) => {
    assert.equal(args.where.userId, gabriela);
    assert.equal(args.where.type, "AI_HUMAN_HANDOFF");
    assert.equal(args.where.unit, "SBC");
    return args.where.link === "/crm/inbox/alice-handoff/conversation-id"
      ? { id: "alice-notification" }
      : null;
  };
  try {
    assert.equal((await loadAssignedAliceHandoff(request(gabriela), conversation.id)).id, conversation.id);
    assert.deepEqual(queries[0], { id: conversation.id, assignedTo: gabriela, instance: { unit: "SBC" } });
    await assert.rejects(loadAssignedAliceHandoff(request("outro-usuario"), conversation.id), /Conversa não encontrada/);
    await assert.rejects(loadAssignedAliceHandoff(request(gabriela), "outra-conversa"), /Conversa não encontrada/);
  } finally {
    if (previous === undefined) delete process.env.ALICE_SBC_HANDOFF_USER_ID;
    else process.env.ALICE_SBC_HANDOFF_USER_ID = previous;
  }
});

test("delegação falha quando colaboradora perde permissão no CRM", async () => {
  const previous = process.env.ALICE_SBC_HANDOFF_USER_ID;
  process.env.ALICE_SBC_HANDOFF_USER_ID = gabriela;
  db.user.findUnique = async () => ({
    id: gabriela, isActive: true, role: "GERENTE", unit: "SBC", permissions: { crm: false },
  });
  db.whatsAppConversation.findFirst = async () => conversation;
  db.notification.findFirst = async () => ({ id: "alice-notification" });
  try {
    await assert.rejects(loadAssignedAliceHandoff(request(gabriela), conversation.id), /Conversa não encontrada/);
  } finally {
    if (previous === undefined) delete process.env.ALICE_SBC_HANDOFF_USER_ID;
    else process.env.ALICE_SBC_HANDOFF_USER_ID = previous;
  }
});

test("atribuição manual sem encaminhamento da Alice não concede acesso delegado", async () => {
  const previous = process.env.ALICE_SBC_HANDOFF_USER_ID;
  process.env.ALICE_SBC_HANDOFF_USER_ID = gabriela;
  db.user.findUnique = async () => ({
    id: gabriela, isActive: true, role: "GERENTE", unit: "SBC", permissions: { crm: true },
  });
  db.whatsAppConversation.findFirst = async () => conversation;
  db.notification.findFirst = async () => null;
  try {
    await assert.rejects(loadAssignedAliceHandoff(request(gabriela), conversation.id), /Conversa não encontrada/);
  } finally {
    if (previous === undefined) delete process.env.ALICE_SBC_HANDOFF_USER_ID;
    else process.env.ALICE_SBC_HANDOFF_USER_ID = previous;
  }
});
