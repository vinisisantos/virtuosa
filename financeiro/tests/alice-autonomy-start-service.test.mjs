import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { ALICE_AUTONOMY_INSTANCE_ID } from "../src/lib/ai-assistant/autonomy/policy.ts";

const modules = {
  "@/lib/whatsapp/conversation-access": "export async function findAuthorizedConversation(){return globalThis.takeoverAuthorized ? globalThis.takeoverConversation : null}",
  "@/lib/pipeline/service-start": "export async function advanceNewLeadToServiceStage(){return {status:'not_applicable'}}",
};
registerHooks({ resolve(specifier, context, next) {
  if (modules[specifier]) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
  return next(specifier === "next/server" ? "next/server.js" : specifier, context);
} });
let events;
const db = {
  whatsAppConversation: {
    updateMany: async ({ data }) => { events.push("pause"); Object.assign(globalThis.takeoverConversation, data); return { count: 1 }; },
    update: async ({ data }) => { events.push("claim-human"); Object.assign(globalThis.takeoverConversation, data); return globalThis.takeoverConversation; },
  },
  aliceAutonomousTurn: { updateMany: async () => { events.push("cancel-pending"); return { count: 1 }; } },
  $transaction: async (fn) => fn(db),
};
globalThis.prisma = db;
globalThis.fetch = async () => { throw new Error("Rede externa proibida"); };
const { PATCH } = await import("../src/app/api/whatsapp/conversations/[id]/reopen/route.ts");
beforeEach(() => {
  events = [];
  globalThis.takeoverAuthorized = true;
  globalThis.takeoverConversation = { id: "chat", instanceId: ALICE_AUTONOMY_INSTANCE_ID, aiMode: "agent", status: "open", assignedTo: "operator", contact: { phone: "5511900001234", unit: "SBC" }, instance: { unit: "SBC" }, authorizedInstance: { canManage: true } };
});
const start = (changes = {}) => PATCH(new Request("http://synthetic.invalid/reopen", { method: "PATCH", headers: {
  "Content-Type": "application/json", "x-user-id": "operator", "x-user-name": "Operadora",
}, body: JSON.stringify({ startService: true, assignedTo: "operator", ...changes }) }), { params: Promise.resolve({ id: "chat" }) });

test("Assumir atendimento pausa a Alice e cancela pendências antes de atribuir a operadora", async () => {
  assert.equal((await start()).status, 200);
  assert.deepEqual(events, ["pause", "cancel-pending", "claim-human"]);
  assert.equal(globalThis.takeoverConversation.aiMode, "manual");
  assert.equal(globalThis.takeoverConversation.assignedToName, "Operadora");
});
test("sem acesso ou atribuição forjada não é possível pausar a Alice", async () => {
  globalThis.takeoverAuthorized = false;
  assert.equal((await start()).status, 404);
  globalThis.takeoverAuthorized = true;
  assert.equal((await start({ assignedTo: "other" })).status, 403);
  assert.deepEqual(events, []);
});
test("reabertura simples e outras caixas não mudam o fluxo anterior", async () => {
  assert.equal((await start({ startService: false })).status, 200);
  assert.deepEqual(events, ["claim-human"]);
  events = [];
  globalThis.takeoverConversation.instanceId = "osasco";
  assert.equal((await start()).status, 200);
  assert.deepEqual(events, ["claim-human"]);
});
