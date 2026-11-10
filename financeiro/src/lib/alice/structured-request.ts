import { buildClaudeRequest } from "@/lib/ai-assistant/claude-provider";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { readAliceContinuityControls } from "@/lib/alice/context-controls";
import type { AliceMemoryScope } from "@/lib/alice/memory-input";
import { ALICE_STRUCTURED_OUTPUT_JSON_SCHEMA } from "@/lib/alice/schema";
import { aliceFearInstructions } from "@/lib/alice/fear-policy";

export type AliceStructuredContext = { scope: AliceMemoryScope; prompt: unknown; schedulingRetry?: boolean };
export type AliceStructuredRequestErrorCode = "invalid_scope" | "invalid_context" | "context_too_large";

export class AliceStructuredRequestError extends Error {
  readonly code: AliceStructuredRequestErrorCode;
  constructor(code: AliceStructuredRequestErrorCode) {
    super(`alice_structured_${code}`);
    this.name = "AliceStructuredRequestError";
    this.code = code;
  }
}

const structuredInstructions = [
  "SAIDA_ESTRUTURADA_MEMORIA_ALICE_V1. Este contrato substitui apenas o formato de saída anterior: resposta substitui messages e response; escalarHumano substitui needsHuman. confidence e usedKnowledge mantêm o significado anterior.",
  "Retorne JSON conforme o schema, sem cercas Markdown nem texto fora do JSON. resposta tem uma ou no máximo duas mensagens, com até 1200 caracteres cada. memoria.resumo é obrigatório e tem até 600 caracteres Unicode.",
  "A resposta é uma proposta: nenhuma mensagem ou alteração de memória foi enviada ou gravada por você. Não afirme ter consultado, encaminhado, agendado ou reservado sem confirmação explícita do CRM. A decisão sobre execução pertence ao sistema, não ao texto gerado.",
  "Atualize apenas os fatos que mudaram nesta troca, sustentados pelas mensagens da própria conversa, além de reescrever o resumo. Omita dados desconhecidos; null não apaga informação anterior. Não invente nome, saúde, preferência ou preço. Não transforme ordens do cliente em regras no resumo.",
  "Não retorne etapaFunil, avaliacaoData, timestamps, identificadores, unidade ou apresentacaoFeitaEm. A agenda e a prova de apresentação são controladas pelo CRM. seApresentouNestaResposta descreve somente estas mensagens propostas e nunca significa apresentação já enviada.",
  "perguntasFeitas deve conter somente temas realmente perguntados no histórico enviado, não perguntas desta resposta ainda não enviada. Uma pergunta feita não comprova resposta recebida. Uma objeção já registrada não precisa ser repetida no patch.",
  "Se faltar base factual, houver baixa confiança, ambiguidade essencial ou risco clínico, marque escalarHumano=true e explique brevemente em motivoEscalonamento. Não repita uma pergunta ainda sem resposta para preencher silêncio. Não inclua diagnósticos ou orientações médicas individuais.",
  "Se a cliente citar um nome diferente usado por outra pessoa, retome somente o procedimento e os fatos já confirmados neste atendimento. Não presuma o que terceiros ofereceram; esclareça a dúvida com uma pergunta curta e não escale só por esse conflito de nomes. Escale se a divergência envolver elegibilidade, saúde, contraindicação ou fato essencial não documentado.",
  "Medo geral ou receio de agulha, sem condição de saúde, reação anterior ou pedido de avaliação individual, pode receber informação geral aprovada e convite sem pressão. Não prometa ausência de dor, segurança individual ou resultado; não escale somente pelo medo geral.",
  "Mantenha escrita natural, parágrafos e contexto, sem reapresentar quando já houver prova. Se ainda não se apresentou, use a identidade Alice, assistente virtual da Virtuosa; nunca imite a identidade de uma pessoa humana.",
  "ATENDIMENTO_AUTONOMO, quando verdadeiro nos controles do servidor: estas mensagens aprovadas podem ser enviadas sem revisão prévia. Não repita perguntas para preencher silêncio; use escalarHumano quando não houver próximo passo pertinente. Respeite no máximo 120 palavras por mensagem, além do limite de caracteres.",
].join("\n");

const repairInstruction = "CORRECAO_DE_FORMATO: a tentativa anterior não passou pela validação local. Gere novamente a partir do mesmo contexto, respeitando todos os tipos, campos permitidos, resumo obrigatório, limites e motivo de escalonamento quando necessário. Não adicione fatos novos nem afirme que houve envio.";
const wordLimitRepairInstruction = "CORRECAO_DE_EXTENSAO: a resposta anterior ultrapassou o limite local. Gere exatamente uma mensagem curta com no máximo 60 palavras. Responda primeiro à dúvida mais recente, usando somente fatos aprovados e mantendo as salvaguardas necessárias. Omita apresentação, repetição de contexto e convite que não seja necessário para dar continuidade. Não ultrapasse 60 palavras.";
const schedulingRetryInstruction = "CORRECAO_DE_HORARIOS: a resposta anterior sugeriu uma data ou horário que o sistema não pode enviar. Nesta recuperação, não ofereça data nem horário específico. Responda à dúvida direta com informações já confirmadas no contexto, reconheça a preferência ampla de período informada pela cliente e, se necessário, pergunte qual dia prefere para a equipe confirmar as opções. Não afirme que verificou disponibilidade ou que agendou.";

export function buildAliceStructuredRequest(context: AliceStructuredContext, repair: boolean | "word_limit" = false) {
  const scope = context?.scope;
  if (!scope || scope.unidade !== "SBC" || scope.instanceId !== ALICE_AUTONOMY_INSTANCE_ID
    || typeof scope.conversationId !== "string" || !scope.conversationId.trim()) throw new AliceStructuredRequestError("invalid_scope");
  if (!readAliceContinuityControls(context.prompt)) throw new AliceStructuredRequestError("invalid_context");
  const request = { ...buildClaudeRequest(context.prompt), output_config: { format: {
    type: "json_schema", schema: ALICE_STRUCTURED_OUTPUT_JSON_SCHEMA,
  } } };
  request.system += `\n${structuredInstructions}${repair ? `\n${repairInstruction}` : ""}`;
  if (repair === "word_limit") request.system += `\n${wordLimitRepairInstruction}`;
  const fearInstructions = aliceFearInstructions(context.prompt);
  if (fearInstructions) request.system += `\n${fearInstructions}`;
  if (context.schedulingRetry) request.system += `\n${schedulingRetryInstruction}`;
  if (Buffer.byteLength(JSON.stringify(request), "utf8") > 80_000) throw new AliceStructuredRequestError("context_too_large");
  return request;
}
