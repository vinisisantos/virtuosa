import type { AiAssistantGeneration } from "@/lib/ai-assistant/provider";
import { classifyAliceHandoff } from "@/lib/ai-assistant/safety";

export const SBC_PROMOTION_VALIDITY_INSTRUCTIONS = "VALIDADE_PROMOCIONAL_SBC, política comercial confirmada pela clínica. Quando perguntarem até quando uma promoção, preço ou condição promocional continuará disponível, explique que não temos data de término confirmada: a duração depende do marketing e pode mudar de um dia para outro. Incentive aproveitar e fechar o pacote enquanto a condição estiver disponível, sem pressão, contagem regressiva ou falsa escassez. Não afirme que acaba hoje, amanhã ou em uma data específica. Não prometa manter preço por agendar ou fazer reserva. Esta regra responde à validade mesmo sem data na base; quando a pergunta for apenas essa, não marque needsHuman nem prometa consultar a equipe. Se houver outras dúvidas, responda com a base aprovada e preserve os encaminhamentos necessários. Não acrescente preço, explicação de procedimento ou pergunta de descoberta que a pessoa não pediu.";

const deadlineReply = "Não temos uma data de término confirmada para essa promoção. A duração depende do marketing, então ela pode ser encerrada de um dia para outro.\n\nSe o pacote faz sentido para você, vale aproveitar para fechar enquanto essa condição estiver disponível 😊";
const price = "(?:valor|preco)(?: promocional)?(?: de (?:r\\$ ?)?\\d+(?: \\d{2})?)?";
const subject = `(?:(?:essa|esse|esta|este|a|o) )?(?:promocao|oferta|condicao(?: promocional)?|${price}|pacote)`;
const duration = "(?:ate quando|ate que dia|por quanto tempo|quanto tempo)";
const status = "(?:ativa|ativo|disponivel|valendo|vigente)";
const time = "(?:hoje|amanha|segunda(?: feira)?|terca(?: feira)?|quarta(?: feira)?|quinta(?: feira)?|sexta(?: feira)?|sabado|domingo|fim do mes|final do mes|semana que vem|dia \\d{1,2}(?:/\\d{1,2}(?:/\\d{4})?)?)";
const deadlineOnlyPatterns = [
  new RegExp(`^${subject} (?:(?:vai|fica|vale|dura|permanece|estara|ficara|continua) )?(?:${status} )?${duration}$`, "u"),
  new RegExp(`^${duration} (?:(?:vai|fica|vale|dura|permanece|estara|ficara|continua) (?:(?:durar|valer|ficar|${status}) )?)?${subject}(?: ${status})?$`, "u"),
  new RegExp(`^(?:qual(?: e)?|tem) (?:a |o )?(?:prazo|validade|duracao|data de termino)(?: de termino)? (?:da|do|para) ${subject}$`, "u"),
  new RegExp(`^quando (?:acaba|termina|encerra) ${subject}$`, "u"),
  new RegExp(`^${subject} (?:vai )?(?:acabar|terminar|encerrar|durar|acaba|termina|encerra) (?:quando|${duration}|${time})$`, "u"),
  new RegExp(`^${subject} (?:vale|vai|fica|continua|estara disponivel) ate (?:o |a )?${time}$`, "u"),
];
const contextualDeadline = new RegExp(`^(?:(?:e |mas )?${duration}|tem prazo|e por tempo limitado|(?:vai )?(?:acabar|terminar|encerrar) ${time})$`, "u");
const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  .replace(/^(?:(?:oi|ola|bom dia|boa tarde|boa noite|tudo bem)(?:[,!?.\s]+|$))+/u, "")
  .replace(/\b(dessa|desta)\b/gu, "da essa").replace(/\b(desse|deste)\b/gu, "do esse")
  .replace(/[,;.!?]+/gu, " ").replace(/\s+/gu, " ").trim().replace(/ (?:por favor|pfv)$/u, "");

function questionTexts(input: Record<string, unknown>) {
  const pending = Array.isArray(input.MENSAGENS_RECENTES_SEM_RESPOSTA) ? input.MENSAGENS_RECENTES_SEM_RESPOSTA : [];
  const target = input.MENSAGEM_ALVO && typeof input.MENSAGEM_ALVO === "object" ? [input.MENSAGEM_ALVO] : [];
  const messages = [...pending, ...target].map((message) => typeof message?.text === "string" ? message.text : "").filter(Boolean);
  if (messages.length) return messages;
  const conversation = Array.isArray(input.CONVERSA) ? input.CONVERSA : [];
  const last = conversation.findLast((message) => message?.role === "cliente" && typeof message.text === "string");
  return last ? [last.text as string] : [];
}

export function applySbcPromotionValidity(value: AiAssistantGeneration, input: unknown): AiAssistantGeneration {
  if (!input || typeof input !== "object" || Array.isArray(input)) return value;
  const prompt = input as Record<string, unknown>;
  if (prompt.UNIDADE !== "SBC") return value;
  const messages = questionTexts(prompt);
  const campaignName = typeof prompt.CAMPANHA === "string" ? prompt.CAMPANHA : "";
  if (!messages.length || classifyAliceHandoff({ unit: "SBC", campaignName, incomingMessages: messages })) return value;
  const context = JSON.stringify(prompt.CONVERSA || []);
  const hasPromotion = /\b(?:promocao|oferta|condicao promocional|valor promocional|preco promocional)\b/u.test(normalize(`${campaignName} ${context}`));
  const questions = messages.map(normalize).filter(Boolean);
  if (!questions.length || !questions.every((text) => deadlineOnlyPatterns.some((pattern) => pattern.test(text)) || (hasPromotion && contextualDeadline.test(text)))) return value;
  return { ...value, response: deadlineReply, messages: [deadlineReply], needsHuman: false, confidence: "high", usedKnowledge: [...value.usedKnowledge, "business:promotion-validity-sbc-v1"].slice(-12) };
}
