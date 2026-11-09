import { deriveSbcEvaluationChoice } from '#lib/ai-assistant/sbc-scheduling-policy';

type Message = { id: string; body: string; fromMe: boolean; status: string; type?: string; audioTranscribed?: boolean };
const normalize = (text: string) => text.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/gu, ' ').trim();

function isGreeting(text: string) {
  return /^(?:oi|ola|bom dia|boa tarde|boa noite|tudo bem|obrigad[ao]|obg)$/u.test(normalize(text));
}

function isEvaluationCostQuestion(text: string) {
  return /^(?:tem (?:algum )?custo(?: (?:a|na|para a|da) avaliacao)?|a avaliacao (?:tem (?:algum )?custo|e (?:gratuita|paga))|quanto (?:custa|e) a avaliacao)$/u.test(normalize(text));
}

// Só remove justificativas completas sem ressalva; uma pergunta, negação
// ou mudança de plano continua no texto que o parser precisa validar.
function selectionText(body: string) {
  if (/^(?:eu\s+)?trabalho\s+(?:à|a|de)\s+noite[.!]?$/iu.test(body.trim())) return '';
  return body.replace(/[,;.\s]+(?:eu\s+)?saio do trabalho e vou direto[.!]?\s*$/iu, '').trim();
}

/** Mantém a última entrada como âncora da lease, mesmo quando o aceite veio antes da saudação/pergunta. */
export function selectSbcSchedulingExchange<T extends Message>(messages: readonly T[], now = new Date()) {
  const recent = messages.slice(-30);
  const reply = recent.at(-1);
  if (!reply || reply.fromMe) return null;
  const offerIndex = recent.findLastIndex((message) => message.fromMe);
  const offer = recent[offerIndex];
  if (!offer || !/\b\d{1,2}\/\d{1,2}\b/u.test(offer.body) || !/\b\d{1,2}(?:h|:\d{2}|\s+horas?)/iu.test(offer.body)) return null;
  const replies = recent.slice(offerIndex + 1);
  if (replies.length > 8) return null;
  const choices = replies.filter((message) => !isGreeting(message.body) && !isEvaluationCostQuestion(message.body));
  if (!choices.length || !choices.some((message) => /\b(?:sim|pode|ok|certo|combinado|confirmo|fechado|prefiro|quero|primeiro horario|segunda|terca|quarta|quinta|sexta|sabado)\b|\b\d/u.test(normalize(message.body)))) return null;
  const hasUnsupportedContent = replies.some((message) => (message.type && message.type !== 'text' && !message.audioTranscribed) || !message.body.trim());
  const selectionBody = choices.map((message) => selectionText(message.body)).filter(Boolean).join(' ');
  const slot = hasUnsupportedContent ? null : deriveSbcEvaluationChoice({ offer, reply: { ...reply, body: selectionBody }, now });
  // Uma preferência simples sem horário único ainda é diálogo, não uma tentativa de gravar na agenda.
  if (!slot && !hasUnsupportedContent && !selectionBody.includes('?')
    && /^(?:(?:eu )?prefiro |pode ser |(?:para|pra) mim e melhor )?(?:(?:na|no|de|pela|a) )?(?:(?:segunda|terca|quarta|quinta|sexta)(?: ?feira)?|sabado|manha|tarde|noite)$/u.test(normalize(selectionBody))) return null;
  return { offer, reply, replies, slot, asksEvaluationCost: replies.some((message) => isEvaluationCostQuestion(message.body)) };
}
