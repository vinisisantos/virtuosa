import type { AiAssistantGeneration } from "@/lib/ai-assistant/provider";
import { classifyAliceHandoff } from "@/lib/ai-assistant/safety";
import { pinkFridaySbcPromptOffer, pinkFridaySbcActive, pinkFridaySbcPromptNow } from "@/lib/pink-friday-sbc";
import { isGenericCampaignName } from "@/lib/campaign-labels";
import { saoPauloDateKey } from "@/lib/date-filter";

export function arrivedFromIdentifiedAdToday(
  lead: { campaignAttribution?: string | null; arrivedAt?: Date | null } | undefined,
  campaignName: string,
  now: Date,
) {
  const arrivedAt = lead?.arrivedAt;
  return lead?.campaignAttribution === "automatic_meta" && !isGenericCampaignName(campaignName)
    && campaignName !== "Não identificada" && arrivedAt instanceof Date && arrivedAt.getTime() <= now.getTime()
    && saoPauloDateKey(arrivedAt) === saoPauloDateKey(now);
}

const adTodayInstructions = "ANUNCIO_DE_ORIGEM_RECEBIDO_HOJE foi confirmado pelo CRM. Se perguntarem se a promoção do anúncio de origem está ativa, confirme que a oferta está vigente hoje e continue o atendimento. Responda também às outras partes com informações aprovadas da mesma oferta. Se faltar só um detalhe comercial, confirme a vigência e explique qual detalhe ainda requer confirmação, sem encerrar a resposta nem pedir revisão apenas pela vigência. Não aplique a regra a outra oferta citada pela cliente, não deduza valores ou detalhes de imagens e não prometa vigência futura. Respeite o prazo explícito da oferta e as regras clínicas.";

function adReceivedToday(input: unknown) {
  return Boolean(input && typeof input === "object"
    && (input as Record<string, unknown>).ANUNCIO_DE_ORIGEM_RECEBIDO_HOJE === true);
}

export const SBC_PROMOTION_VALIDITY_INSTRUCTIONS = "VALIDADE_PROMOCIONAL_SBC, política comercial confirmada pela clínica. Quando perguntarem até quando uma promoção, preço ou condição promocional continuará disponível, explique que não temos data de término confirmada: a duração depende do marketing e pode mudar de um dia para outro. Incentive aproveitar e fechar o pacote enquanto a condição estiver disponível, sem pressão, contagem regressiva ou falsa escassez. Não afirme que acaba hoje, amanhã ou em uma data específica. Não prometa manter preço por agendar ou fazer reserva. Esta regra responde à validade mesmo sem data na base; quando a pergunta for apenas essa, não marque needsHuman nem prometa consultar a equipe. Se houver outras dúvidas, responda com a base aprovada e preserve os encaminhamentos necessários. Não acrescente preço, explicação de procedimento ou pergunta de descoberta que a pessoa não pediu.";

const deadlineReply = "Não temos uma data de término confirmada para essa promoção. A duração depende do marketing, então ela pode ser encerrada de um dia para outro.\n\nSe o pacote faz sentido para você, vale aproveitar para fechar enquanto essa condição estiver disponível 😊";

export function sbcPromotionValidityInstructions(input: unknown) {
  const promotion = pinkFridaySbcPromptOffer(input);
  const sameDayAd = adReceivedToday(input) && (!promotion || pinkFridaySbcActive(pinkFridaySbcPromptNow(input)));
  const arrivalRule = sameDayAd ? "\n" + adTodayInstructions : "";
  if (!promotion) return SBC_PROMOTION_VALIDITY_INSTRUCTIONS + arrivalRule;
  return "VALIDADE_PROMOCIONAL_PINK_FRIDAY_SBC: esta oferta específica é exclusiva de SBC e válida até domingo, 29/11/2026, inclusive. Esta data substitui a regra genérica sem término confirmado somente nesta campanha. Não invente hora de encerramento, desconto, pacote mínimo ou manutenção de preço por agendamento. Após 29/11/2026, não afirme que a promoção está vigente ou prorrogada: condições atuais precisam de confirmação. Use o agora do servidor. Nenhuma outra campanha herda preço, produto, validade ou condições desta oferta." + arrivalRule;
}
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
const activeOnly = new RegExp(`^(?:${subject} (?:(?:ainda |continua )?(?:esta |e )?)?(?:valid[ao]|ativ[ao]|disponivel|valendo|vigente)(?: hoje)?|(?:ainda )?(?:esta |continua )?(?:valid[ao]|ativ[ao]|disponivel|valendo|vigente)(?: hoje)?)$`, "u");
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

function promotionQuestionReply(input: unknown, requireSameDayAd = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const prompt = input as Record<string, unknown>;
  if (prompt.UNIDADE !== "SBC") return null;
  const messages = questionTexts(prompt);
  const campaignName = typeof prompt.CAMPANHA === "string" ? prompt.CAMPANHA : "";
  if (!messages.length || classifyAliceHandoff({ unit: "SBC", campaignName, incomingMessages: messages })) return null;
  const promotion = pinkFridaySbcPromptOffer(prompt);
  const promotionActive = promotion && pinkFridaySbcActive(pinkFridaySbcPromptNow(prompt));
  const sameDayAd = adReceivedToday(prompt) && (!promotion || promotionActive);
  if (requireSameDayAd && !sameDayAd) return null;
  const context = JSON.stringify(prompt.CONVERSA || []);
  const hasPromotion = /\b(?:promocao|oferta|condicao promocional|valor promocional|preco promocional)\b/u.test(normalize(`${campaignName} ${context}`));
  const questions = messages.map(normalize).filter(Boolean);
  if (!questions.length || !questions.every((text) => deadlineOnlyPatterns.some((pattern) => pattern.test(text))
    || (hasPromotion && contextualDeadline.test(text)) || ((sameDayAd || promotion) && activeOnly.test(text)))) return null;
  const reply = promotion ? promotionActive
    ? "Essa condição da Pink Friday é válida até domingo, 29/11/2026. O agendamento por si só não garante a manutenção do preço após esse prazo."
    : "Essa condição da Pink Friday terminou em 29/11/2026. Para uma nova contratação, as condições atuais precisam ser confirmadas com a equipe."
    : sameDayAd ? "Sim, a condição do anúncio pelo qual você chegou está vigente hoje. Não temos uma data de término confirmada."
      : deadlineReply;
  return { reply, promotion };
}

export function sameDayAdPromotionReply(input: unknown) {
  return promotionQuestionReply(input, true)?.reply || null;
}

export function applySbcPromotionValidity(value: AiAssistantGeneration, input: unknown): AiAssistantGeneration {
  const answer = promotionQuestionReply(input);
  if (!answer) return value;
  const { reply, promotion } = answer;
  return { ...value, response: reply, messages: [reply], needsHuman: false, confidence: "high", usedKnowledge: [...value.usedKnowledge,
    promotion ? "business:pink-friday-sbc-2026" : "business:promotion-validity-sbc-v1"].slice(-12) };
}
