import { buildClaudeRequest } from "@/lib/ai-assistant/claude-provider";
import { parseGeneration, normalizeAiAssistantMessageLayout } from "@/lib/ai-assistant/provider";
import { personalizeAiAssistantResponse } from "@/lib/ai-assistant/privacy";
import { isSbcOpeningSequenceContext } from "@/lib/ai-assistant/message-sequence";
import type { AliceAutonomousContext } from "@/lib/ai-assistant/autonomy/context";
import { ALICE_AUTONOMY_MODEL, aliceAutonomyCostMicroUsd, aliceAutonomyResponseClaimsBooking } from "@/lib/ai-assistant/autonomy/policy";
import { generateAliceStructuredReply } from "@/lib/alice/structured-generation";
import type { AliceStructuredOutput } from "@/lib/alice/schema";

export type AutonomousGeneration = {
  messages: string[]; needsHuman: boolean; model: string; inputTokens: number; outputTokens: number;
  cacheReadInputTokens: number; cacheCreationInputTokens: number; costMicroUsd: number; generationMs: number;
  usageRecorded: boolean;
  proposal?: AliceStructuredOutput;
  generationFailure?: string;
};

export async function generateAliceAutonomousReply(context: AliceAutonomousContext, fetcher = fetch,
  signal?: AbortSignal): Promise<AutonomousGeneration> {
  if (context.memoryRuntime) {
    const generated = await generateAliceStructuredReply({ scope: context.memoryRuntime.scope, prompt: context.prompt,
      schedulingRetry: context.schedulingRetry }, { fetcher, signal });
    const { model, inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, generationMs, usageRecorded, knownCostMicroUsd } = generated.metrics;
    const metrics = { model, inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens,
      generationMs: Math.ceil(generationMs), usageRecorded, costMicroUsd: knownCostMicroUsd };
    if (generated.status !== "draft") return { ...metrics, messages: [], needsHuman: true, generationFailure: generated.reason };
    try {
      const proposal = generated.proposal;
      const normalized = normalizeAiAssistantMessageLayout({ response: proposal.resposta[0], messages: proposal.resposta,
        confidence: proposal.confidence, needsHuman: proposal.escalarHumano, usedKnowledge: proposal.usedKnowledge }, true, context.prompt);
      const messages = normalized.messages.map((message) => personalizeAiAssistantResponse(message, context.contactName));
      return { ...metrics, messages, needsHuman: normalized.needsHuman,
        proposal: { ...proposal, resposta: messages } };
    } catch { return { ...metrics, messages: [], needsHuman: true, generationFailure: "formatting_requires_review" }; }
  }
  const request = buildClaudeRequest(context.prompt);
  request.system += "\nATENDIMENTO AUTÔNOMO: as mensagens válidas serão enviadas pelo sistema. Use uma ou no máximo duas mensagens, cada uma com até 1.200 caracteres. "
    + "Neste canal a autorização de envio já existe, mas não há revisão humana prévia: as referências anteriores a envio manual pertencem somente ao comparador de sugestões. "
    + "Não repita perguntas já enviadas que ainda aguardam a cliente; nesse caso indique needsHuman=true em vez de enviar uma cobrança ou preencher silêncio. "
    + "Não diga que consultou alguém, encaminhou, anotou ou agendou sem uma confirmação explícita do sistema. "
    + "A agenda só é registrada pelo fluxo do CRM após escolha inequívoca; nunca diga que reservou por conta própria. "
    + "Apresente-se como Alice, assistente virtual da Virtuosa, quando ainda não houver apresentação. Não imite a identidade de uma atendente humana. "
    + "Se não tiver base factual, se houver ambiguidade ou orientação clínica, marque needsHuman=true. Escreva somente a próxima etapa pertinente.";
  if (context.schedulingRetry) request.system += "\nCORRECAO_DE_HORARIOS: a resposta anterior sugeriu uma data ou horário que o sistema não pode enviar. Nesta recuperação, não ofereça data nem horário específico. Responda à dúvida direta com informações já confirmadas no contexto, reconheça a preferência ampla de período informada pela cliente e, se necessário, pergunte qual dia prefere para a equipe confirmar as opções. Não afirme que verificou disponibilidade ou que agendou.";
  const body = JSON.stringify(request);
  if (Buffer.byteLength(body, "utf8") > 80_000) throw new Error("context_too_large");
  const startedAt = Date.now();
  const response = await fetcher("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": process.env.ANTHROPIC_API_KEY?.trim() || "" },
    body, cache: "no-store", signal: signal ? AbortSignal.any([AbortSignal.timeout(48_000), signal]) : AbortSignal.timeout(48_000),
  });
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  const result = await response.json();
  const usageRecorded = result.usage && Number.isInteger(result.usage.input_tokens) && result.usage.input_tokens >= 0
    && Number.isInteger(result.usage.output_tokens) && result.usage.output_tokens >= 0;
  const inputTokens = Number(result.usage?.input_tokens || 0);
  const outputTokens = Number(result.usage?.output_tokens || 0);
  const cacheReadInputTokens = Number(result.usage?.cache_read_input_tokens || 0);
  const cacheCreationInputTokens = Number(result.usage?.cache_creation_input_tokens || 0);
  const metrics = { usageRecorded: Boolean(usageRecorded), model: String(result.model || ALICE_AUTONOMY_MODEL), inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens,
    costMicroUsd: aliceAutonomyCostMicroUsd({ input: inputTokens, output: outputTokens, cacheRead: cacheReadInputTokens, cacheCreation: cacheCreationInputTokens }), generationMs: Date.now() - startedAt };
  if (!usageRecorded || metrics.model !== ALICE_AUTONOMY_MODEL || result.stop_reason !== "end_turn") return { ...metrics, messages: [], needsHuman: true };
  try {
    const text = Array.isArray(result.content) ? result.content.filter((item: { type?: string }) => item.type === "text").map((item: { text?: string }) => item.text || "").join("") : "";
    const parsed = parseGeneration(JSON.parse(text));
    const normalized = normalizeAiAssistantMessageLayout(parsed, isSbcOpeningSequenceContext("SBC", context.prompt), context.prompt);
    const messages = normalized.messages.map((message) => personalizeAiAssistantResponse(message, context.contactName));
    if (messages.some((message) => !message || message.length > 1_200) || messages.length > 2) return { ...metrics, messages: [], needsHuman: true };
    return { ...metrics, messages, needsHuman: normalized.needsHuman || normalized.confidence === "low" || aliceAutonomyResponseClaimsBooking(messages) };
  } catch {
    return { ...metrics, messages: [], needsHuman: true };
  }
}
