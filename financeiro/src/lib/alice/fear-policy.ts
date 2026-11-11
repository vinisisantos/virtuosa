import { readAliceContextDialogue } from "@/lib/alice/context-controls";
import { stripRepeatedPresentation } from "@/lib/alice/presentation-filter";
import { classifyAliceHandoff } from "@/lib/ai-assistant/safety";

export type AliceFearPolicy = { kind: "general" | "reaction" | "needles" | "result" | "health" | "previous_problem" | "thinking";
  requiresHuman: boolean; generalInformationOnly: boolean };
const normalize = (text: string) => text.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  .replace(/\p{Cf}/gu, "").replace(/\s+/gu, " ").trim();
const personalHealth = /\b(?:diabet\w*|doenc\w*|hipertens\w*|tireoid\w*|autoimun\w*|cardiac\w*|epileps\w*|trombos\w*|cancer\w*|convuls\w*|remedi\w*|medicac\w*|medicament\w*|anticoagul\w*|gravid\w*|gestant\w*|gravidez|amament\w*|lactant\w*|alerg\w*|febre|infecc\w*|sangram\w*|falta de ar)\b/u;
const previousProblem = /\b(?:(?:ja )?(?:tive|teve|fiquei|deu|fiz|passei|aconteceu comigo).{0,75}(?:problema|reac\w*|rejeic\w*|complicac\w*|internad\w*|cirurg\w*)|problema.{0,40}(?:outro lugar|outra clinica))\b/u;
const clinicalHistory = /\b(?:cirurg\w*|operad\w*|internad\w*|complicac\w*|reac\w*|rejeic\w*)\b/u;
const fear = /\b(?:medo|receio|insegur\w*|preocup\w*|apreensiv\w*|rejeic\w*|reac\w*|contraindic\w*|exagerad\w*|estranh\w*|artificial)\b/u;

export function aliceHealthHistoryRequiresHuman(value: string | null | undefined) {
  const text = normalize(value || "");
  return Boolean(text && (personalHealth.test(text) || clinicalHistory.test(text) || previousProblem.test(text)));
}

export function aliceCanResumeGeneralFear(dialogue: readonly { role: string; text: string }[], healthNotes: string | null | undefined) {
  const incoming = dialogue.filter((message) => message.role === "cliente").map((message) => message.text).filter(Boolean);
  if (!incoming.length || aliceHealthHistoryRequiresHuman(healthNotes)) return false;
  const input = { UNIDADE: "SBC", CONVERSA: dialogue,
    MENSAGENS_RECENTES_SEM_RESPOSTA: incoming.map((text) => ({ text })) };
  const fear = aliceFearPolicy(input);
  return Boolean(fear && !fear.requiresHuman && classifyAliceHandoff({ unit: "SBC", incomingMessages: incoming }) === null);
}

export function aliceFearPolicy(input: unknown): AliceFearPolicy | null {
  if (!input || typeof input !== "object" || (input as Record<string, unknown>).UNIDADE !== "SBC") return null;
  const incoming = readAliceContextDialogue(input).filter((item) => item.role === "cliente").map((item) => normalize(item.text));
  const text = incoming.at(-1) || "";
  const pending = (input as Record<string, unknown>).MENSAGENS_RECENTES_SEM_RESPOSTA;
  const current = Array.isArray(pending) && pending.length ? pending.map((item) => normalize(typeof item?.text === "string" ? item.text : "")).join(" ") : text;
  if (personalHealth.test(current)) return { kind: "health", requiresHuman: true, generalInformationOnly: false };
  if (previousProblem.test(current)) return { kind: "previous_problem", requiresHuman: true, generalInformationOnly: false };
  if (/\b(?:vou pensar|pensar um pouco|pensar melhor|nao quero decidir agora)\b/u.test(text) && incoming.some((item) => fear.test(item))) {
    return { kind: "thinking", requiresHuman: false, generalInformationOnly: false };
  }
  if (!fear.test(text)) return null;
  const kind = /agulha|\bdor\b|\bdoi\b/u.test(text) ? "needles" : /reac\w*|rejeic\w*|contraindic\w*/u.test(text) ? "reaction"
    : /exagerad\w*|estranh\w*|artificial|resultado/u.test(text) ? "result" : "general";
  // Só frases gerais e explícitas podem contornar a triagem lexical antiga; nunca histórico de saúde.
  const generalInformationOnly = kind === "needles" || (kind === "reaction"
    && /\b(?:e se|se der|medo|receio|vi noticias|tem (?:alguma )?contraindic\w*|quais (?:as )?contraindic\w*)\b/u.test(text));
  return { kind, requiresHuman: false, generalInformationOnly };
}

export type AliceFearViolation = "fear_unsafe_claim" | "fear_pressure" | "fear_format" | "fear_requires_human";
const graphemes = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });

export function validateAliceFearReply(messages: readonly string[], policy: AliceFearPolicy | null,
  contactName: string | null): AliceFearViolation | null {
  if (!policy) return null;
  if (policy.requiresHuman) return "fear_requires_human";
  const text = normalize(messages.join(" "));
  if (/\b(?:nao (?:tem|ha) risco|zero risco|100\s*%\s*segur\w*|nao (?:da|causa) rea\w*|nao rejeita|nunca tivemos|99\s*%|nao doi|certamente vai ficar lindo|nao vai se arrepender|e bobagem|nao precisa ter medo)/u.test(text)) return "fear_unsafe_claim";
  if (/\b(?:so hoje|ultimas vagas|vale aproveitar|aproveit\w* enquanto|corra|garanta (?:ja|agora)|outra clinica.{0,50}(?:infecc\w*|complicac\w*|hospital)|ficar sem (?:a |essa )?(?:promocao|condicao))\b/u.test(text)) return "fear_pressure";
  const emojis = [...graphemes.segment(messages.join(" "))].filter(({ segment }) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segment)).length;
  const contentParts = messages.map((message) => {
    const stripped = stripRepeatedPresentation(message, contactName);
    return stripped.ambiguous ? message : stripped.text;
  }).filter(Boolean);
  const content = contentParts.join("\n\n");
  const paragraphs = content.split(/\n\s*\n/u).filter((value) => value.trim()).length;
  // A divisão em caixas insere separadores; conteúdo e pressão continuam verificados no lote inteiro.
  const boxBoundaries = Math.max(0, contentParts.length - 1);
  if (emojis > 1 || (policy.kind === "thinking" ? paragraphs > 2 + boxBoundaries || /\b(?:prefere vir|vamos agendar|vamos marcar|fechar o pacote)\b/u.test(text)
    : paragraphs < 3 || paragraphs > 4 + boxBoundaries)) return "fear_format";
  return null;
}

export function aliceFearInstructions(input: unknown): string | null {
  const policy = aliceFearPolicy(input);
  if (!policy) return null;
  return [
    "ACOLHIMENTO_SEM_PRESSAO_SBC_V1. Medo não se vence com pressão nem garantia. Esta orientação tem prioridade sobre promoção, qualificação comercial e convite insistente.",
    "Siga a ordem: acolha com naturalidade; responda a dúvida com honestidade e a base aprovada; explique a avaliação prévia/anamnese, produto adequado, profissional habilitada (biomédica especializada) e orientação de pós, sem prometer segurança individual; devolva o controle; só então faça convite leve se apropriado.",
    "Use 3 a 4 parágrafos curtos na resposta de acolhimento, tom calmo e no máximo um emoji no conjunto. A apresentação pessoal, se ainda necessária, fica separada. Não invente procedimentos, credenciais, anestesia ou protocolos ausentes da base.",
    "Reconheça riscos e possíveis reações sem exagerar nem minimizá-los. Só descreva como injetável o procedimento que a base realmente classificar assim; não confunda Lipo Laser com preenchimento. Dor pode envolver algum desconforto que varia por pessoa; não prometa ausência de dor.",
    "Nunca afirme zero risco, 100% seguro, não dá reação, não rejeita, nunca tivemos casos, estatísticas inventadas, resultado garantido ou arrependimento impossível. Não minimize o medo nem conte complicações de outras clínicas para convencer.",
    "A avaliação é gratuita e sem compromisso. A cliente não precisa decidir agora; conversa com a especialista e decide apenas se se sentir segura. Se couber, pergunte se prefere durante a semana ou no sábado, sem urgência, contagem regressiva, últimas vagas ou pressão para aproveitar a promoção.",
    "Condição de saúde, medicação, gestação/amamentação ou problema anterior exigem avaliação da profissional; nunca libere nem proíba o procedimento. Intercorrência atual não é oportunidade comercial e não deve receber convite de venda.",
    ...(policy.kind === "thinking" ? ["A cliente quer pensar depois de expressar medo: respeite em um parágrafo curto, sem novo convite para avaliar ou fechar. Pode pedir consentimento para um contato futuro; não prometa nem programe rechamada por conta própria."] : []),
    ...(policy.requiresHuman ? ["Este caso exige equipe habilitada. Marque escalonamento e não forneça elegibilidade ou orientação clínica individual."] : []),
  ].join("\n");
}
