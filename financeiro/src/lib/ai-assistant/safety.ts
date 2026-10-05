import type { AliceUnit } from "@/lib/ai-assistant/policy";

export type AliceHandoffReason = "clinical_safety" | "unsupported_procedure";

const CLINICAL_SAFETY_PATTERNS = [
  /\b(?:doenc\w*|diabet\w*|hipertens\w*|tireoid\w*|autoimun\w*|cardiac\w*|pressao alta|epileps\w*|trombos\w*|cancer\w*|convuls\w*)\b/,
  /\b(?:remedi\w*|medicac\w*|medicament\w*|anticoagul\w*|uso [^.!?]{0,40}medic\w*)\b/,
  /\b(?:gravid\w*|gestant\w*|gravidez|amament\w*|lactant\w*)\b/,
  /\b(?:alerg\w*|anafilax\w*|reac\w*|efeito colateral|contraindic\w*|pos[- ]procedimento|complicac\w*|infecc\w*|sangram\w*|febre|cirurg\w*)\b/,
  /\b(?:posso|pode|segur\w*|risc\w*)\b.{0,55}\b(?:doenc\w*|remedi\w*|medic\w*|gravid\w*|amament\w*|alerg\w*|procedimento)\b/,
];

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
  if (CLINICAL_SAFETY_PATTERNS.some((pattern) => pattern.test(text))) return "clinical_safety";
  return null;
}

export function aliceLocalHandoffReply(reason: AliceHandoffReason) {
  if (reason === "unsupported_procedure") {
    return "Obrigada pelo interesse 💛 Vou encaminhar sua pergunta para a equipe da unidade, que poderá orientar você por aqui.";
  }
  return "Obrigada por me contar 💛 Esse ponto precisa ser avaliado por uma profissional habilitada, que poderá conversar com você e orientar com segurança.";
}
