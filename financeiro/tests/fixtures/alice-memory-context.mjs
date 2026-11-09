import { ALICE_AUTONOMY_INSTANCE_ID } from "../../src/lib/ai-assistant/autonomy/policy.ts";

export const scope = { conversationId: "context-chat", instanceId: ALICE_AUTONOMY_INSTANCE_ID, unidade: "SBC" };
export const now = new Date("2026-11-09T12:00:00.000Z");
export const earlier = new Date("2026-11-07T12:00:00.000Z");

export function memory(changes = {}) {
  return {
    id: "memory-fixture", conversationId: scope.conversationId, unidade: "SBC", nome: null, nomeConfirmado: false,
    campanhaOrigem: null, procedimentoInteresse: null, queixaPrincipal: null, nivelResultado: "NAO_INFORMADO",
    primeiraVez: null, saudeObservacoes: null, precoPerguntado: false, precoInformado: null, objecoes: [],
    etapaFunil: "NOVO", avaliacaoData: null, apresentacaoFeitaEm: null, perguntasFeitas: [], resumo: null,
    ultimaMensagemClienteEm: null, ultimaMensagemAliceEm: null, escalarHumano: false, motivoEscalonamento: null,
    createdAt: earlier, updatedAt: earlier, ...changes,
  };
}

export function message(id, body, fromMe = false, changes = {}) {
  return { id, conversationId: scope.conversationId, body, fromMe, type: "text", status: fromMe ? "sent" : "received",
    timestamp: fromMe ? earlier : now, respondedByName: fromMe ? "Alice" : null, ...changes };
}

export function contextInput(changes = {}) {
  return {
    scope, memory: memory(), history: [message("intro", "Olá! Sou a Alice, assistente virtual da Virtuosa.", true), message("client", "Quero tratar a região abdominal.")],
    knowledge: { documents: [{ name: "Base de teste aprovada", text: "Informação sintética do procedimento." }] },
    campaignName: "LIPO LASER", contactName: "Cliente Teste", evaluationOptions: [], now, autonomous: true, ...changes,
  };
}
