import { buildAiTrainingResponsePolicy } from "@/lib/ai-public-response-policy";
import { generateAiTrainingDraft, loadKnowledge } from "@/lib/ai-shadow";
import {
  aiTrainingDiagramV6MessageAudit,
  aiTrainingDiagramV6PendingPrompt,
  resolveAiTrainingDiagramV6Turn,
  type AiTrainingDiagramV6State,
} from "@/lib/ai-training-diagram-v6";

function compact(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function generateAiTrainingDiagramV6Reply(params: {
  state: AiTrainingDiagramV6State;
  latestClientMessage: string;
  recentMessages: Array<{ role: string; content: string }>;
  now?: Date;
}) {
  const resolved = resolveAiTrainingDiagramV6Turn({
    state: params.state,
    latestClientMessage: params.latestClientMessage,
    now: params.now,
  });

  if (resolved.kind === "scripted") {
    return {
      messages: resolved.messages.map((message) => message.content),
      messageAudits: resolved.messages.map((message) => aiTrainingDiagramV6MessageAudit({
        state: resolved.state,
        source: "scripted",
        mediaKey: message.mediaKey,
      })),
      model: "deterministic:diagram-v6",
      guardrailFlags: resolved.guardrailFlags,
      sdrState: resolved.state,
      latencyMs: 0,
      promptTokens: null,
      completionTokens: null,
      generationAttempts: 0,
    };
  }

  const knowledge = await loadKnowledge(resolved.state.campaign.unit, { requireApproved: true });
  const safeKnowledge = {
    unitKnowledge: knowledge.unitKnowledge,
    procedures: knowledge.procedures,
  };
  const prompt = `Este é o runtime isolado V6 do Treinamento IA. Nenhuma mensagem será enviada ao WhatsApp e nenhum cadastro real será alterado.

Pergunta fora do roteiro feita pelo cliente simulado:
${compact(resolved.faqQuestion || params.latestClientMessage, 1200)}

Campanha cadastrada e congelada nesta simulação:
${JSON.stringify(resolved.state.campaign, null, 2)}

Base aprovada disponível:
${JSON.stringify(safeKnowledge, null, 2)}

Últimas mensagens apenas para continuidade:
${JSON.stringify(params.recentMessages.slice(-8).map((message) => ({
    role: message.role === "assistant" ? "Clinica" : "Cliente",
    content: compact(message.content, 800),
  })), null, 2)}

Responda somente à pergunta atual em até duas mensagens curtas. Não avance o script, não faça nova pergunta, não invente preço, quantidade de sessões, resultado, contraindicação, disponibilidade ou indicação individual. Você é assistente virtual, nunca profissional clínica. Se faltar conhecimento aprovado, declare a limitação e explique que, nesta simulação, nenhuma pessoa real será acionada. Retorne somente o JSON exigido pelo sistema.`;

  const generated = await generateAiTrainingDraft(
    prompt,
    buildAiTrainingResponsePolicy(params.latestClientMessage),
  );
  const resumePrompt = resolved.resumePrompt || aiTrainingDiagramV6PendingPrompt(resolved.state);
  const messages = generated.messages
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, 2);
  let appendedResumePrompt = false;
  if (resumePrompt && !messages.some((message) => message.includes(resumePrompt))) {
    messages.push(resumePrompt);
    appendedResumePrompt = true;
  }

  return {
    messages,
    messageAudits: messages.map((_, index) => aiTrainingDiagramV6MessageAudit({
      state: resolved.state,
      source: appendedResumePrompt && index === messages.length - 1 ? "scripted" : "model",
    })),
    model: generated.model,
    guardrailFlags: [...new Set([...resolved.guardrailFlags, ...generated.guardrailFlags, "diagram_v6_faq_interruption"])],
    sdrState: resolved.state,
    latencyMs: generated.latencyMs,
    promptTokens: generated.promptTokens ?? null,
    completionTokens: generated.completionTokens ?? null,
    generationAttempts: generated.generationAttempts,
  };
}
