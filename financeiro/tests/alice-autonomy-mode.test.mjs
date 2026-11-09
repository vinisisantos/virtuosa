import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { NextRequest } from "next/server.js";
import { ALICE_AUTONOMY_INSTANCE_ID } from "../src/lib/ai-assistant/autonomy/policy.ts";

const state = globalThis.aliceModeTest = {};
const replacements = {
  "next/server": `export {NextRequest,NextResponse} from ${JSON.stringify(import.meta.resolve("next/server.js"))};`,
  "@/lib/db": "export const prisma=globalThis.aliceModeTest.db;",
  "@/lib/auth": "export const getUserFromHeaders=()=>globalThis.aliceModeTest.user;",
  "@/lib/ai-assistant/access": "export function requireAliceAuthorizedUser(){}",
  "@/lib/ai-assistant/context": "export async function loadAccessibleAliceConversation(){return globalThis.aliceModeTest.access;}",
  "@/lib/ai-assistant/generate": "export async function generateConversationSuggestion(){throw new Error('Não pode gerar modelos neste teste');}",
  "@/lib/ai-assistant/runtime": "export function requireAliceLiveRuntime(){}",
  "@/lib/ai-assistant/autonomy/config": "export async function loadAliceAutonomyConfig(){return {enabled:globalThis.aliceModeTest.enabled};} export const aliceAutonomyRuntimeStatus=()=>({ready:globalThis.aliceModeTest.ready});",
  "@/lib/ai-assistant/autonomy/queue": "export async function pauseAliceForHuman(){globalThis.aliceModeTest.events.push('pause');} export async function enqueueAliceAutonomousTurn(input){globalThis.aliceModeTest.events.push(input);}",
};
registerHooks({ resolve(specifier, context, next) {
  if (replacements[specifier]) return { url: `data:text/javascript,${encodeURIComponent(replacements[specifier])}`, shortCircuit: true };
  return next(specifier, context);
} });
state.db = {
  whatsAppConversation: { update: async ({ data }) => { state.events.push(`mode:${data.aiMode}`); return { aiMode: data.aiMode }; } },
  whatsAppMessage: { findFirst: async () => state.latest },
};
const { PATCH } = await import("../src/app/api/crm/ai-assistant/suggestions/route.ts");
beforeEach(() => {
  state.user = { userId: "operator" }; state.enabled = true; state.ready = true; state.events = [];
  state.access = { unit: "SBC", conversation: { instanceId: ALICE_AUTONOMY_INSTANCE_ID, aiMode: "suggestions" } };
  state.latest = { id: "internal-message", timestamp: new Date(), fromMe: false };
});
const mode = (value) => PATCH(new NextRequest("https://example.test/api/crm/ai-assistant/suggestions", {
  method: "PATCH", body: JSON.stringify({ conversationId: "conversation", action: "mode", mode: value }),
}));

test("PATCH não libera agente em Osasco, em outra caixa ou sem operação ativa", async () => {
  for (const change of [() => { state.access.unit = "Osasco"; }, () => { state.access.conversation.instanceId = "other-sbc"; }]) {
    change(); assert.equal((await mode("agent")).status, 403); assert.deepEqual(state.events, []);
    state.access = { unit: "SBC", conversation: { instanceId: ALICE_AUTONOMY_INSTANCE_ID, aiMode: "suggestions" } };
  }
  state.enabled = false; assert.equal((await mode("agent")).status, 409); assert.deepEqual(state.events, []);
  state.enabled = true; state.ready = false; assert.equal((await mode("agent")).status, 409); assert.deepEqual(state.events, []);
});

test("PATCH exige usuário e ativação explícita enfileira só a fonte interna da conversa autorizada", async () => {
  state.user = null; assert.equal((await mode("agent")).status, 401); assert.deepEqual(state.events, []);
  state.user = { userId: "operator" };
  assert.equal((await mode("agent")).status, 200);
  assert.equal(state.events[0], "mode:agent");
  assert.equal(state.events[1].sourceMessageId, "internal-message");
  assert.equal(state.events[1].instanceId, ALICE_AUTONOMY_INSTANCE_ID);
});

test("PATCH para assumir atendimento cancela pendências antes de mudar o modo", async () => {
  state.access.conversation.aiMode = "agent";
  assert.equal((await mode("manual")).status, 200);
  assert.deepEqual(state.events, ["pause", "mode:manual"]);
});
