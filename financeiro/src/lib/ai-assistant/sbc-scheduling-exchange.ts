import { buildSbcEvaluationOptions, deriveSbcEvaluationChoice } from '#lib/ai-assistant/sbc-scheduling-policy';
import { chooseRequestedEvaluationSlot } from '#lib/ai-assistant/evaluation-choice-parser';
import { saoPauloDateKey } from '#lib/date-filter';
import { evaluationReplyBlocksBooking, evaluationTemporalReference, splitEvaluationReply } from '#lib/ai-assistant/evaluation-reply-segments';
import { aliceAutonomyResponseClaimsBooking } from '#lib/ai-assistant/autonomy/policy';
import { evaluationRequestedPeriod } from '#lib/ai-assistant/evaluation-offer-policy';

type Message = { id: string; body: string; fromMe: boolean; status: string; type?: string; audioTranscribed?: boolean;
  respondedBy?: string | null; respondedByName?: string | null; timestamp?: Date; createdAt?: Date };
const normalize = (text: string) => text.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/gu, ' ').trim();

export const SBC_BOOKING_CHOICE_CLARIFICATION = 'Para concluir sua avaliação, me confirme o dia e um único horário das opções que te enviei 😊';

const day = /(?:(?:na|no|de|neste|nesta|nesse|nessa|este|esta|esse|essa) )?(?:(?:segunda|terca|quarta|quinta|sexta)(?: ?feira)?|sabado)/u.source;
const period = /(?:(?:(?:no|nesse|neste) periodo (?:da|de)|durante a|de|da|pela|a) )?(?:manha|tarde|noite)/u.source;
const preference = /(?:(?:eu )?(?:prefiro|nao (?:posso|consigo|da)|so posso)|pode ser|(?:para|pra) mim e melhor)/u.source;
const periodPreference = `(?:${preference} )?${period}`;
const negotiating = new RegExp(`^(?:(?:${preference} )?${day}|${periodPreference}(?: ${day})?|${day} ${periodPreference})$`, 'u');
const dateAndTime = (text: string) => /\b\d{1,2}\/\d{1,2}\b/u.test(text) && /\b\d{1,2}(?:h|:\d{2}|\s+horas?)/iu.test(text);
const withdrewOffer = (text: string) => /\b(?:nao (?:tenho|temos|ha|existe\w*) mais|nao (?:esta|estao|e|sera).{0,20}disponiv\w*|indisponiv\w*|ja (?:foi preenchid\w*|preencheram)|cancelad\w*|fech(?:ou|ad\w*)|outro dia|outro horario|alterad\w*)\b/u.test(normalize(text));

const unreadVisualAttachment = (message: Message) => !message.fromMe && !message.body.trim()
  && ['image', 'associatedChildMessage'].includes(message.type || '');

function changesOffer(message: Message, offer: Message) {
  if (aliceAutonomyResponseClaimsBooking([message.body])) return true;
  if (withdrewOffer(message.body)) return true;
  const text = normalize(message.body);
  if (/\b\d{1,2}(?:\/\d{1,2}|h(?:\d{2})?|:\d{2}|\s+horas?)\b/u.test(text)) return true;
  const labels = (body: string) => [...body.matchAll(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado|manha|tarde|noite)(?: ?feira)?\b/gu)].map((match) => match[1]);
  const offeredLabels = new Set(labels(normalize(offer.body)));
  return labels(text).some((reference) => !offeredLabels.has(reference));
}

function authoredByAlice(message: Message): boolean | null {
  if (message.respondedBy) return false;
  if (!message.respondedByName) return null;
  return /^alice(?: automacao)?$/u.test(normalize(message.respondedByName));
}

function offerExpired(offer: Message, reply: Message, now: Date) {
  if (!offer.timestamp) return false;
  const from = offer.timestamp.getTime();
  const until = (reply.timestamp || now).getTime();
  return !Number.isFinite(from) || !Number.isFinite(until) || from > now.getTime() || until < from
    || until - from >= 24 * 60 * 60_000 || now.getTime() - from >= 24 * 60 * 60_000;
}

type ExchangeOptions = { allowHumanOffer?: boolean; allowDirectRequest?: boolean };

/**
 * Escolha de uma oferta da Alice; sem escolha válida e com `allowDirectRequest`,
 * aceita o dia e horário pedidos diretamente pela cliente nas últimas mensagens.
 */
export function selectSbcSchedulingExchange<T extends Message>(messages: readonly T[], now = new Date(), options: ExchangeOptions = {}) {
  const offered = selectOfferedExchange(messages, now, options);
  if (offered?.slot || !options.allowDirectRequest) return offered;
  return selectDirectRequestExchange(messages, now) || offered;
}

/** A primeira mensagem do pedido ocupa o lugar da oferta na lease e no registro da reserva. */
function selectDirectRequestExchange<T extends Message>(messages: readonly T[], now: Date) {
  const recent = messages.slice(-30);
  const reply = recent.at(-1);
  if (!reply || reply.fromMe) return null;
  const lastTeamIndex = recent.findLastIndex((message) => message.fromMe);
  const lastTeam = recent[lastTeamIndex];
  const burst = recent.slice(lastTeamIndex + 1);
  if (burst.length > 8 || burst.some((message) => !unreadVisualAttachment(message)
    && ((message.type && message.type !== 'text' && !message.audioTranscribed) || !message.body.trim()))) return null;
  const replies = burst.filter((message) => message.body.trim());
  const parsed = replies.map((message) => ({ message, segments: splitEvaluationReply(message.body) }));
  if (!replies.length || parsed.some(({ segments }) => segments.blocked)) return null;
  const offeredDays = lastTeam && authoredByAlice(lastTeam) === true && !offerExpired(lastTeam, reply, now)
    ? [...new Set([...lastTeam.body.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/gu)]
      .map(([, day, month, year]) => `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`))] : [];
  const offeredDayKey = offeredDays.length === 1 ? offeredDays[0] : null;
  const slot = chooseRequestedEvaluationSlot(parsed.flatMap(({ segments }) => segments.selections),
    buildSbcEvaluationOptions(now), saoPauloDateKey(now), offeredDayKey);
  if (!slot) return null;
  return { offer: replies[0], reply, replies, slot, continuationMessages: [] as T[],
    pendingQuestions: parsed.flatMap(({ segments }) => segments.questions),
    asksEvaluationCost: parsed.some(({ segments }) => segments.asksEvaluationCost) };
}

/** Mantém a última entrada como âncora da lease, mesmo quando o aceite veio antes da saudação/pergunta. */
function selectOfferedExchange<T extends Message>(messages: readonly T[], now: Date, options: ExchangeOptions) {
  const recent = messages.slice(-30);
  const reply = recent.at(-1);
  if (!reply || reply.fromMe) return null;
  const offerIndex = recent.findLastIndex((message) => message.fromMe && dateAndTime(message.body)
    && !aliceAutonomyResponseClaimsBooking([message.body]));
  const offer = recent[offerIndex];
  if (!offer || (!options.allowHumanOffer && authoredByAlice(offer) !== true) || offerExpired(offer, reply, now)) return null;
  const continuation = recent.slice(offerIndex + 1);
  const continuationOutputs = continuation.filter((message) => message.fromMe);
  if (continuationOutputs.some((message) => authoredByAlice(message) !== true || changesOffer(message, offer)
    || !['sent', 'delivered', 'read', 'played'].includes(message.status))) return null;
  const lastTeamIndex = recent.findLastIndex((message) => message.fromMe);
  const continuationMessages = recent.slice(offerIndex + 1, lastTeamIndex + 1);
  const clarificationIndex = recent.findLastIndex((message, index) => index > offerIndex && message.fromMe
    && authoredByAlice(message) === true && message.body === SBC_BOOKING_CHOICE_CLARIFICATION);
  // O esclarecimento encerra o aceite ambíguo, sem renovar a oferta, sua validade ou sua autoria.
  const replyStart = Math.max(offerIndex + 1, clarificationIndex + 1);
  // Uma pergunta sobre fotos não invalida a oferta; renegociar o período antes
  // de uma resposta da Alice exige que ela envie uma nova oferta inequívoca.
  if (recent.slice(replyStart, lastTeamIndex).some((message) => !message.fromMe
    && (evaluationTemporalReference.test(normalize(message.body)) || evaluationReplyBlocksBooking(message.body)))) return null;
  const replies = recent.slice(replyStart).filter((message) => !message.fromMe);
  if (replies.length > 8) return null;
  // Foto sem legenda não muda a escolha; a Alice não a interpreta e a dúvida em texto segue para depois da reserva.
  const hasUnsupportedContent = replies.some((message) => !unreadVisualAttachment(message)
    && ((message.type && message.type !== 'text' && !message.audioTranscribed) || !message.body.trim()));
  const parsed = replies.map((message) => ({ message, segments: splitEvaluationReply(message.body) }));
  const selectionBody = parsed.flatMap(({ segments }) => segments.selections).join(' ');
  if (!selectionBody && !replies.some((message) => /\b(?:sim|pode|ok|certo|combinado|confirmo|fechado|prefiro|quero|primeiro horario|segunda|terca|quarta|quinta|sexta|sabado)\b|\b\d/u.test(normalize(message.body)))) return null;
  const slot = hasUnsupportedContent || parsed.some(({ segments }) => segments.blocked) ? null
    : deriveSbcEvaluationChoice({ offer, reply: { ...reply, body: selectionBody }, now });
  // Escolher um dia ou recusar um período pede opções, não revisão de uma reserva.
  const currentText = recent.slice(lastTeamIndex + 1).map((message) => message.body).join(' ');
  if (!slot && !hasUnsupportedContent && (evaluationRequestedPeriod(currentText)
    || !currentText.includes('?') && negotiating.test(normalize(currentText)))) return null;
  const currentIds = new Set(recent.slice(lastTeamIndex + 1).map((message) => message.id));
  const currentParsed = parsed.filter(({ message }) => currentIds.has(message.id));
  return { offer, reply, replies, slot, continuationMessages,
    pendingQuestions: currentParsed.flatMap(({ segments }) => segments.questions),
    asksEvaluationCost: currentParsed.some(({ segments }) => segments.asksEvaluationCost) };
}
