import { readAliceContextDialogue } from "@/lib/alice/context-controls";

export const ALICE_MAX_OFFERED_SLOTS = 4;
export const SBC_VARIABLE_OFFER_INSTRUCTIONS = "OFERTAS_ENXUTAS_VARIAVEIS_SBC. Escolha com autonomia um pequeno conjunto de horários de HORARIOS_SBC conforme a conversa: em geral duas, três ou quatro opções, sem quantidade fixa por cliente nem obrigação de alternar quantidades. Não liste a grade inteira. Separe o período de funcionamento das opções concretas: não misture uma faixa como “das 8h às 13h” com uma lista de horários na mesma oferta. Se houver somente uma opção compatível ou estiver esclarecendo uma opção exata já mencionada, apresente só essa. Respeite primeiro o dia, período e restrições já informados. Sem preferência de período, pode distribuir opções entre manhã, tarde e noite somente quando o dia comportar esses períodos. Com preferência por um período, escolha dentro dele. Se recusarem as opções, ofereça outras compatíveis ou esclareça outro dia. Apresente cada data completa antes de seus horários, com dia da semana coerente. Oferecer poucas opções não comprova escassez: não afirme últimas vagas, agenda quase cheia ou contagem de vagas restantes a partir dessa grade. Uma oferta não é reserva; só o CRM confirma o agendamento após escolha inequívoca.";

type Period = "morning" | "afternoon" | "evening";
const periods: readonly Period[] = ["morning", "afternoon", "evening"];
const labels: Record<string, Period> = { manha: "morning", tarde: "afternoon", noite: "evening" };
const normalize = (text: string) => text.normalize("NFKD").replace(/\p{Diacritic}|\p{Cf}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
const requestDay = String.raw`(?:(?:no|na|de|neste|nesta|nesse|nessa|para|pra) )?(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[ -]feira)?`;
const requestQuery = String.raw`(?:(?:voces )?(?:tem|teria|teriam|ha|existe|existem)(?: (?:algum|alguns|outro|outros|mais))?(?: (?:horarios?|vagas?|disponibilidade))?|(?:eu )?(?:prefiro|quero|posso|consigo)|pode ser|poderia ser)`;
const requestPeriod = String.raw`(?:(?:na parte da|no periodo da|durante a|pela|a|de|da|na|no|para a|pra|para) )?(manha|tarde|noite)`;
const periodRequest = new RegExp(`^(?:e )?(?:${requestDay} )?(?:${requestQuery} )?(?:${requestDay} )?${requestPeriod}(?: ${requestDay})?(?: ${requestQuery})?(?: por favor)?$`, "u");

/** Pedido puro de período é negociação, mesmo em forma de pergunta; relógios, ressalvas e dúvidas extras não são apagados. */
export function evaluationRequestedPeriod(value: string): Period | null {
  const text = normalize(value).replace(/[.!?]+$/u, "").trim();
  const match = text.match(periodRequest);
  if (!match || [...text.matchAll(/\b(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/gu)].length > 1) return null;
  return labels[match[1]] || null;
}

export function evaluationSlotPeriod(time: string): Period {
  const hour = Number(time.slice(0, 2));
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

/** Só limita por preferências explícitas recentes da cliente, nunca por uma oferta da equipe ou pelo resumo. */
export function aliceEvaluationAllowedPeriods(input: unknown, now: Date): ReadonlySet<Period> {
  if (!input || typeof input !== "object" || (input as Record<string, unknown>).UNIDADE !== "SBC") return new Set(periods);
  const prompt = input as Record<string, unknown>;
  const dialogue = readAliceContextDialogue(input).slice(-30).filter((message) => message.role === "cliente");
  const fallback = Array.isArray(prompt.MENSAGENS_RECENTES_SEM_RESPOSTA) ? prompt.MENSAGENS_RECENTES_SEM_RESPOSTA : [];
  const messages = dialogue.length ? dialogue : fallback.filter((value): value is { text: string } => Boolean(value
    && typeof value === "object" && typeof (value as { text?: unknown }).text === "string"));
  let preferred: Set<Period> | null = null;
  const excluded = new Set<Period>();
  for (const message of messages) {
    if ("timestamp" in message && typeof message.timestamp === "string") {
      const at = Date.parse(message.timestamp);
      if (!Number.isFinite(at) || at > now.getTime() || now.getTime() - at > 86_400_000) continue;
    }
    const text = normalize(message.text);
    const requestedPeriod = evaluationRequestedPeriod(text);
    if (requestedPeriod) {
      preferred = new Set([requestedPeriod]);
      excluded.delete(requestedPeriod);
      continue;
    }
    const mentions = [...text.matchAll(/\b(manha|tarde|noite)\b/gu)];
    if (!mentions.length) {
      const requestedTime = text.match(/\b(?:so|somente|apenas|prefiro|consigo|posso)(?:\s+(?:as|a|ser|ir|vir|agendar|marcar))?\s+(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?![\p{L}\p{N}])/u);
      if (requestedTime && !/\bnao\s+(?:posso|consigo)\b/u.test(text) && Number(requestedTime[1]) <= 23
        && Number(requestedTime[2] || requestedTime[3] || 0) < 60) {
        const period = evaluationSlotPeriod(`${requestedTime[1].padStart(2, "0")}:${requestedTime[2] || requestedTime[3] || "00"}`);
        preferred = new Set([period]); excluded.delete(period);
      }
      if (/\b(?:qualquer (?:horario|periodo)|tanto faz|sou flexivel)\b/u.test(text)) { preferred = null; excluded.clear(); }
      continue;
    }
    const positive = new Set<Period>();
    const negative = new Set<Period>();
    const direct = text.replace(/\b(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[ -]feira)?\b/gu, "")
      .replace(/\b(?:neste|nesse|nesta|nessa|no|na)\b/gu, "").replace(/\s+/gu, " ").trim();
    for (const mention of mentions) {
      const before = text.slice(Math.max(0, mention.index! - 90), mention.index);
      const after = text.slice(mention.index! + mention[0].length);
      const denied = /\b(?:nao (?:posso|consigo|quero|da)|sem disponibilidade)(?:\s+[^,.!?;]*)?$/u.test(before)
        || /\bnao(?: (?:de|da|pela|a|no periodo da))?\s*$/u.test(before)
        || /^\s+(?:nao(?: posso| consigo| da)?|fica ruim|nao funciona)\b/u.test(after);
      if (denied) { negative.add(labels[mention[1]]); continue; }
      if (/^(?:(?:de|da|pela|a|durante a|no periodo da|periodo da) )?(?:manha|tarde|noite)$/u.test(direct)
        || /\b(?:prefiro|preferencia|melhor|pode ser|consigo|posso|quero|somente|apenas|so|disponibilidade|disponivel|tem)(?:\s+[^,.!?;]*)?$/u.test(before)
        || /^\s+(?:tambem )?(?:pode|serve|funciona|e melhor)\b/u.test(after)) positive.add(labels[mention[1]]);
    }
    if (positive.size) {
      preferred = positive;
      for (const period of positive) excluded.delete(period);
    }
    for (const period of negative) excluded.add(period);
    if (preferred && [...preferred].every((period) => excluded.has(period))) preferred = null;
  }
  return new Set([...(preferred || periods)].filter((period) => !excluded.has(period)));
}

export function aliceOfferClaimsUnsupportedScarcity(value: string): boolean {
  const text = normalize(value);
  for (const claim of text.matchAll(/\b(?:ultimas? vagas?|ultimos? horarios?|so (?:restam?|ha|temos) (?:\d+|uma|duas|tres|quatro) (?:vagas?|horarios?))\b/gu)) {
    const before = text.slice(Math.max(0, claim.index! - 90), claim.index);
    const after = text.slice(claim.index! + claim[0].length);
    if (/\b(?:nao (?:sao|temos|ha)(?: as| os)?|nao (?:posso|podemos) (?:afirmar|dizer|garantir)(?: que (?:sao|sejam)(?: as| os)?)?|sem (?:afirmar|dizer))\s*$/u.test(before)
      || /^\s*\?/u.test(after)) continue;
    if (claim[0].startsWith("so ") || !/[\p{L}\p{N}]/u.test(before)
      || /[.!?:]\s*$/u.test(before) || /\b(?:sao|temos|tenho(?: uma)?|restam|aproveite|garanta)(?: as| os)?\s*$/u.test(before)) return true;
  }
  return false;
}
