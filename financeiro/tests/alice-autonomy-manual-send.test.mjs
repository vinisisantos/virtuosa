import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { ALICE_AUTONOMY_INSTANCE_ID } from "../src/lib/ai-assistant/autonomy/policy.ts";

const nextServer = import.meta.resolve("next/server.js");
const modules = {
  "next/server": `export {NextResponse} from ${JSON.stringify(nextServer)}; export function after(){throw new Error('Nenhum after esperado')}`,
  "@/lib/whatsapp/instance-resolver": "export async function getInstancesForRequest(){return {instances:globalThis.aliceEventInstances,isProxy:false}}",
  "@/lib/ai-assistant/delegated-access": "export async function loadAssignedAliceHandoff(){return globalThis.aliceDelegatedConversation}",
  "@/lib/whatsapp/media-storage": "export const isPrivateBlobUrl=()=>false;export const signPrivateMediaUrls=async x=>x;export const inspectPrivateBlob=async()=>null;export const createPrivateBlobReadUrl=async()=>null;",
  "@/lib/whatsapp/link-preview": "export const firstWhatsAppLink=()=>null;export const loadWhatsAppLinkPreview=async()=>null;",
};
registerHooks({ resolve(specifier, context, next) {
  if (modules[specifier]) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
  return next(specifier, context);
} });

let conversation, events;
const db = {
  whatsAppConversation: {
    findFirst: async ({ where }) => where.id === conversation.id && where.instanceId.in.includes(conversation.instanceId) ? conversation : null,
    updateMany: async ({ where, data }) => {
      if (data.aiMode === "manual") {
        assert.equal(where.instanceId, ALICE_AUTONOMY_INSTANCE_ID);
        events.push("pause"); conversation.aiMode = "manual";
      }
      return { count: 1 };
    },
  },
  aliceAutonomousTurn: { updateMany: async () => { events.push("cancel-pending"); return { count: 1 }; } },
  activityLog: { create: async () => ({}) }, webhookLog: { create: async () => ({}) },
  $transaction: async (fn) => fn(db),
};
globalThis.prisma = db;
globalThis.fetch = async (url) => {
  assert.match(String(url), /^http:\/\/127\.0\.0\.1:1\/message\/sendText\/fixture$/);
  events.push("external-request");
  if (conversation.instanceId === ALICE_AUTONOMY_INSTANCE_ID) assert.equal(conversation.aiMode, "manual");
  return new Response(JSON.stringify({ error: "Falha externa simulada, sem WhatsApp" }), { status: 503 });
};
const { POST } = await import("../src/app/api/whatsapp/send/route.ts");

beforeEach(() => {
  process.env.EVOLUTION_API_URL = "http://127.0.0.1:1";
  events = [];
  globalThis.aliceEventInstances = [{ id: ALICE_AUTONOMY_INSTANCE_ID, name: "fixture", provider: "evolution", unit: "SBC", status: "connected", canReply: true }];
  conversation = { id: "chat", instanceId: ALICE_AUTONOMY_INSTANCE_ID, assignedTo: "operator", aiMode: "agent",
    contact: { phone: "5511900001234", name: "Cliente fictícia", unit: "SBC" } };
  globalThis.aliceDelegatedConversation = { ...conversation, instance: globalThis.aliceEventInstances[0] };
});
const send = (changes = {}) => POST(new Request("http://localhost/api/whatsapp/send", {
  method: "POST", headers: { "Content-Type": "application/json", "x-user-id": "operator", "x-user-name": "Operadora" },
  body: JSON.stringify({ conversationId: "chat", body: "Olá, tudo bem?", type: "text", ...changes }),
}));

test("resposta manual pausa a Alice antes do HTTP mesmo se o provedor falhar", async () => {
  assert.equal((await send()).status, 503);
  assert.deepEqual(events, ["pause", "cancel-pending", "external-request"]);
});

test("sugestão revisada manualmente também pausa antes do envio", async () => {
  assert.equal((await send({ aiAssistantDraftId: "reviewed-draft", aiAssistantDraftVersion: 1 })).status, 503);
  assert.deepEqual(events, ["pause", "cancel-pending", "external-request"]);
});

test("resposta humana delegada por segurança clínica usa a mesma barreira de tomada", async () => {
  assert.equal((await send({ delegatedHandoff: true })).status, 503);
  assert.deepEqual(events, ["pause", "cancel-pending", "external-request"]);
});

test("usuário sem permissão não pode pausar o agente nem enviar", async () => {
  globalThis.aliceEventInstances[0].canReply = false;
  assert.equal((await send()).status, 403);
  assert.deepEqual(events, []);
});

test("outras caixas não consultam nem pausam o piloto de SBC", async () => {
  globalThis.aliceEventInstances[0].id = "osasco-instance";
  globalThis.aliceEventInstances[0].unit = "Osasco";
  conversation.instanceId = "osasco-instance";
  assert.equal((await send()).status, 503);
  assert.deepEqual(events, ["external-request"]);
});
