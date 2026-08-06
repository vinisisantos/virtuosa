import { buildAiTrainingResponsePolicy } from "@/lib/ai-public-response-policy";
import { generateAiTrainingDraft, loadKnowledge } from "@/lib/ai-shadow";
import {
  aiTrainingDiagramV7MessageAudit,
  aiTrainingDiagramV7PendingPrompt,
  resolveAiTrainingDiagramV7Turn,
  type AiTrainingDiagramV7Message,
  type AiTrainingDiagramV7State,
} from "@/lib/ai-training-diagram-v7";

function compact(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function normalizeForMatch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const REPETITION_STOP_WORDS = new Set(["para", "como", "essa", "esse", "isso", "uma", "com", "que", "voce", "nossa", "pela", "pelo", "mais", "pode", "fica"]);

function meaningfulTokens(value: string) {
  return new Set(normalizeForMatch(value).split(" ").filter((token) => token.length >= 4 && !REPETITION_STOP_WORDS.has(token)));
}

function substantiallyRepeats(current: string, previous: string) {
  const currentTokens = meaningfulTokens(current);
  const previousTokens = meaningfulTokens(previous);
  const smaller = Math.min(currentTokens.size, previousTokens.size);
  if (smaller < 7) return false;
  let shared = 0;
  for (const token of currentTokens) if (previousTokens.has(token)) shared += 1;
  return shared >= 7 && shared / smaller >= 0.58;
}

function validObjectiveComposition(params: {
  messages: string[];
  state: AiTrainingDiagramV7State;
  recentAssistantMessages: string[];
  objective?: string;
}) {
  if (params.messages.length < 1 || params.messages.length > 2) return false;
  const joined = params.messages.join("\n\n");
  const questionCount = (joined.match(/\?/g) || []).length;
  if (questionCount !== 1) return false;
  if (/\b(?:eu avalio|eu observo|eu defino|eu aplico|vou avaliar|vou observar)\b/i.test(joined)) return false;
  if (/\b(?:garant|resultado certo|resultado excelente|liberad[oa] para realizar)\b/i.test(joined)) return false;
  if (/\bsem (?:prometer|garantir) resultado\b/i.test(joined)) return false;
  if (params.state.node === "confirm_unit" && !normalizeForMatch(joined).includes(normalizeForMatch(params.state.unitAddress))) return false;
  if (params.objective === "acolher_sem_repetir_e_qualificar_experiencia" && /\b(?:profissional|especialista|avalia|estrategia|cada caso|cuidado adequado)\b/i.test(normalizeForMatch(joined))) return false;
  if (params.objective === "acolher_experiencia_com_prova_e_confirmar_unidade") {
    if (params.messages.length !== 2) return false;
    if (!/\b(?:exemplo|ilustrativ|simulacao)\b/i.test(normalizeForMatch(params.messages[0]))) return false;
    if (/\b(?:nossa cliente|uma cliente|resultado que tivemos|saiu satisfeita)\b/i.test(normalizeForMatch(params.messages[0]))) return false;
  }
  return !params.recentAssistantMessages.slice(-3).some((previous) => substantiallyRepeats(joined, previous));
}

function fallbackResult(params: {
  state: AiTrainingDiagramV7State;
  messages: AiTrainingDiagramV7Message[];
  guardrailFlags: string[];
  objective?: string;
}) {
  return {
    messages: params.messages.map((message) => message.content),
    messageAudits: params.messages.map((message) => aiTrainingDiagramV7MessageAudit({
      state: params.state,
      source: "scripted",
      mediaKey: message.mediaKey,
      objective: params.objective,
    })),
    model: "deterministic:diagram-v7-fallback",
    guardrailFlags: [...new Set([...params.guardrailFlags, "diagram_v7_safe_fallback"])],
    sdrState: params.state,
    latencyMs: 0,
    promptTokens: null,
    completionTokens: null,
    generationAttempts: 0,
  };
}

export async function generateAiTrainingDiagramV7Reply(params: {
  state: AiTrainingDiagramV7State;
  latestClientMessage: string;
  recentMessages: Array<{ role: string; content: string }>;
  now?: Date;
}) {
  const resolved = resolveAiTrainingDiagramV7Turn({
    state: params.state,
    latestClientMessage: params.latestClientMessage,
    now: params.now,
  });

  if (resolved.kind === "scripted") {
    return {
      messages: resolved.messages.map((message) => message.content),
      messageAudits: resolved.messages.map((message) => aiTrainingDiagramV7MessageAudit({ state: resolved.state, source: "scripted", mediaKey: message.mediaKey })),
      model: "deterministic:diagram-v7",
      guardrailFlags: resolved.guardrailFlags,
      sdrState: resolved.state,
      latencyMs: 0,
      promptTokens: null,
      completionTokens: null,
      generationAttempts: 0,
    };
  }

  const recentAssistantMessages = params.recentMessages
    .filter((message) => message.role === "assistant")
    .slice(-4)
    .map((message) => message.content);

  if (resolved.kind === "faq") {
    const knowledge = await loadKnowledge(resolved.state.campaign.unit, { requireApproved: true });
    const prompt = `Ambiente isolado do Treinamento IA. Responda à dúvida atual sem mudar a etapa da conversa.

Dúvida do cliente simulado:
${compact(resolved.faqQuestion || params.latestClientMessage, 1000)}

Campanha fixa:
${JSON.stringify(resolved.state.campaign)}

Base aprovada:
${JSON.stringify({ unitKnowledge: knowledge.unitKnowledge, procedures: knowledge.procedures })}

Responda em uma mensagem curta. Não faça nova pergunta e não invente informação. Retorne apenas o JSON exigido.`;
    try {
      const generated = await generateAiTrainingDraft(prompt, buildAiTrainingResponsePolicy(params.latestClientMessage));
      const messages = generated.messages.map((message) => message.trim()).filter(Boolean).slice(0, 2);
      const resumePrompt = resolved.resumePrompt || aiTrainingDiagramV7PendingPrompt(resolved.state);
      if (resumePrompt) messages.push(resumePrompt);
      return {
        messages,
        messageAudits: messages.map((_, index) => aiTrainingDiagramV7MessageAudit({
          state: resolved.state,
          source: index === messages.length - 1 && !!resumePrompt ? "scripted" : "model",
          objective: index === messages.length - 1 ? "retomar_cursor" : "responder_interrupcao",
        })),
        model: generated.model,
        guardrailFlags: [...new Set([...resolved.guardrailFlags, ...generated.guardrailFlags, "diagram_v7_faq_interruption"])],
        sdrState: resolved.state,
        latencyMs: generated.latencyMs,
        promptTokens: generated.promptTokens ?? null,
        completionTokens: generated.completionTokens ?? null,
        generationAttempts: generated.generationAttempts,
      };
    } catch {
      return fallbackResult({
        state: resolved.state,
        messages: [{ content: "Não tenho uma informação aprovada suficiente para responder isso com segurança nesta simulação." }, ...(resolved.resumePrompt ? [{ content: resolved.resumePrompt }] : [])],
        guardrailFlags: [...resolved.guardrailFlags, "diagram_v7_faq_model_failed"],
        objective: "responder_interrupcao",
      });
    }
  }

  const fallbackMessages = resolved.fallbackMessages || [{ content: aiTrainingDiagramV7PendingPrompt(resolved.state) }];
  const prompt = `Você redige somente a fala do objetivo atual de um atendimento comercial simulado. O diretor determinístico já escolheu a etapa; não avance, não volte e não crie perguntas extras.

Objetivo atual:
${resolved.objective}

Instruções obrigatórias para esta fala:
${resolved.compositionInstructions}

Campanha fixa e fatos aprovados:
${JSON.stringify({
    name: resolved.state.campaign.name,
    offerItems: resolved.state.campaign.offerItems,
    unitAddress: resolved.state.unitAddress,
    family: resolved.state.family,
  })}

Mensagem atual do cliente simulado:
${compact(params.latestClientMessage, 900)}

Últimas falas da assistente, apenas para não repetir palavras nem explicações:
${JSON.stringify(recentAssistantMessages.map((message) => compact(message, 500)))}

Escreva como uma atendente brasileira natural e acolhedora. Não repita literalmente a resposta do cliente, não recapitule qualificações, varie a abertura e use uma única pergunta no final. Prefira uma mensagem curta; use duas apenas quando houver mudança clara entre acolhimento e informação. Retorne somente o JSON exigido.`;

  try {
    const generated = await generateAiTrainingDraft(prompt, buildAiTrainingResponsePolicy(params.latestClientMessage));
    const messages = generated.decision === "reply"
      ? generated.messages.map((message) => message.trim()).filter(Boolean).slice(0, 2)
      : [];
    if (!validObjectiveComposition({ messages, state: resolved.state, recentAssistantMessages, objective: resolved.objective })) {
      return fallbackResult({ state: resolved.state, messages: fallbackMessages, guardrailFlags: [...resolved.guardrailFlags, "diagram_v7_composition_rejected"], objective: resolved.objective });
    }
    const mediaKey = fallbackMessages.find((message) => message.mediaKey)?.mediaKey;
    return {
      messages,
      messageAudits: messages.map((_, index) => aiTrainingDiagramV7MessageAudit({
        state: resolved.state,
        source: "model",
        mediaKey: index === 0 ? mediaKey : undefined,
        objective: resolved.objective,
      })),
      model: generated.model,
      guardrailFlags: [...new Set([...resolved.guardrailFlags, ...generated.guardrailFlags, "diagram_v7_natural_composition"])],
      sdrState: resolved.state,
      latencyMs: generated.latencyMs,
      promptTokens: generated.promptTokens ?? null,
      completionTokens: generated.completionTokens ?? null,
      generationAttempts: generated.generationAttempts,
    };
  } catch {
    return fallbackResult({ state: resolved.state, messages: fallbackMessages, guardrailFlags: [...resolved.guardrailFlags, "diagram_v7_composition_failed"], objective: resolved.objective });
  }
}
