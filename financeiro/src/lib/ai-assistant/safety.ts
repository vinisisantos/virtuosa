import type { AliceUnit } from "@/lib/ai-assistant/policy";

export type AliceHandoffReason = "clinical_safety" | "unsupported_procedure";

const CLINICAL_SAFETY_PATTERNS = [
  /\b(?:doenc\w*|diabet\w*|hipertens\w*|tireoid\w*|autoimun\w*|cardiac\w*|pressao alta|epileps\w*|trombos\w*|cancer\w*|convuls\w*)\b/,
  /\b(?:remedi\w*|medicac\w*|medicament\w*|anticoagul\w*|uso [^.!?]{0,40}medic\w*)\b/,
  /\b(?:gravid\w*|gestant\w*|gravidez|amament\w*|lactant\w*)\b/,
  /\b(?:alerg\w*|anafilax\w*|reac\w*|efeito colateral|contraindic\w*|pos[- ]procedimento|complicac\w*|infecc\w*|sangram\w*|febre|cirurg\w*)\b/,
  /\b(?:posso|pode|segur\w*|risc\w*)\b.{0,55}\b(?:doenc\w*|remedi\w*|medic\w*|gravid\w*|amament\w*|alerg\w*)\b/,
];

const PROCEDURE_ELIGIBILITY = /\b(?:posso|pode|segur\w*|risc\w*)\b.{0,55}\bprocedimento\b/;
const MINOR_ADMINISTRATIVE_CONTEXT = /\b(?:menor(?:es)? de (?:idade|18 anos)|adolescentes?)\b|\b(?:tenho|tem|com|idade de)\s+(?:[1-9]|1[0-7])\s+anos\b/;
const MINOR_INDIVIDUAL_SAFETY = /\b(?:segur\w*|risc\w*|indicad\w*|indicac\w*|adequad\w*|recomend\w*|contraindic\w*|complicac\w*)\b/;
// "Posso ter informações" pede uma explicação, não autorização para fazer o
// procedimento. A exceção só neutraliza o verbo desse pedido, não o restante da fala.
const informationRequest = /(?:ter|receber|pedir|passar|mandar|enviar|dar|obter)\s+(?:(?:mais|algumas?|alguns)\s+)?(?:informac(?:ao|oes)|detalhes?)/;
const commercialQuestion = /(?:saber|informar|dizer)\s+o\s+(?:preco|valor|nome)/;
const offerReference = /(?:sobre\s+(?:isso|(?:esse|este|o)\s+(?:procedimento|tratamento|anuncio))|(?:desse|deste|do)\s+(?:procedimento|tratamento|anuncio))/;
const INFORMATION_REQUEST_VERB = new RegExp(
  String.raw`\b(?:posso|pode)\b(?=\s+(?:(?:me|nos)\s+)?(?:${informationRequest.source}|${commercialQuestion.source})(?:\s+${offerReference.source})?\s*(?:[?!.]|$))`, "g",
);

const UNSUPPORTED_PROCEDURE_PATTERNS = [
  /\bharmonizacao\s+de\s+mamas?\b/,
  /\bpreenchimento\s+facial\b/i,
];

function normalizeForSafety(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function classifyAliceHandoff(params: {
  unit: AliceUnit;
  campaignName?: string | null;
  incomingMessages: string[];
}): AliceHandoffReason | null {
  const text = normalizeForSafety([...params.incomingMessages, params.campaignName || ""].join(" "));
  if (UNSUPPORTED_PROCEDURE_PATTERNS.some((pattern) => pattern.test(text))) return "unsupported_procedure";
  const incoming = normalizeForSafety(params.incomingMessages.join(" "));
  if (params.unit === "SBC" && /\b(?:doi|dor|riscos?|anestesi\w*|anvisa)\b/.test(incoming)) return "clinical_safety";
  if (CLINICAL_SAFETY_PATTERNS.some((pattern) => pattern.test(text))) return "clinical_safety";
  if (params.unit === "SBC") {
    if (MINOR_ADMINISTRATIVE_CONTEXT.test(incoming) && MINOR_INDIVIDUAL_SAFETY.test(incoming)) return "clinical_safety";
    const eligibilityText = params.incomingMessages.map((message) => {
      const normalized = normalizeForSafety(message).replace(INFORMATION_REQUEST_VERB, "");
      // A política aprovada permite informar autorização/termos; a especialista continua decidindo a indicação.
      return MINOR_ADMINISTRATIVE_CONTEXT.test(normalized) ? normalized.replace(/\b(?:posso|pode)\b/gu, "") : normalized;
    }).join(" ");
    if (PROCEDURE_ELIGIBILITY.test(eligibilityText)) return "clinical_safety";
  } else if (PROCEDURE_ELIGIBILITY.test(text)) return "clinical_safety";
  return null;
}

export function aliceLocalHandoffReply(reason: AliceHandoffReason) {
  if (reason === "unsupported_procedure") {
    return "Obrigada pelo interesse 💛 Vou encaminhar sua pergunta para a equipe da unidade, que poderá orientar você por aqui.";
  }
  return "Obrigada por me contar 💛 Esse ponto precisa ser avaliado por uma profissional habilitada, que poderá conversar com você e orientar com segurança.";
}
