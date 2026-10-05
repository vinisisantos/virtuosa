import type { AliceUnit } from "@/lib/ai-assistant/policy";

export type AliceHandoffReason = "clinical_safety" | "unsupported_procedure";

const CLINICAL_SAFETY_PATTERNS = [
  /\b(?:doen[cç]a|diabetes|hipertens[aã]o|tireoide|autoimun|card[ií]ac|press[aã]o alta|epilepsia|trombose|c[aâ]ncer|cancer|convuls[aã]o)\b/i,
  /\b(?:rem[eé]dio|medica[cç][aã]o|medicamento|anticoagulante|uso [^.!?]{0,40}medic)\b/i,
  /\b(?:gr[aá]vida|gestante|gravidez|amament|lactante|amamenta[cç][aã]o)\b/i,
  /\b(?:alergia|al[eé]rgic|anafilaxia|re[aç][aã]o|efeito colateral|contraindica[cç][aã]o|p[oó]s[- ]procedimento|complica[cç][aã]o|infec[cç][aã]o|sangramento|febre)\b/i,
  /\b(?:posso|pode|seguro|risco)\b.{0,55}\b(?:doen[cç]a|rem[eé]dio|medica[cç][aã]o|gr[aá]vida|amament|alergia|procedimento)\b/i,
];

const UNSUPPORTED_PROCEDURE_PATTERNS = [
  /\bharmoniza[cç][aã]o\s+de\s+mamas?\b/i,
  /\bpreenchimento\s+facial\b/i,
];

export function classifyAliceHandoff(params: {
  unit: AliceUnit;
  campaignName?: string | null;
  incomingMessages: string[];
}): AliceHandoffReason | null {
  const text = [...params.incomingMessages, params.campaignName || ""].join(" ");
  if (UNSUPPORTED_PROCEDURE_PATTERNS.some((pattern) => pattern.test(text))) return "unsupported_procedure";
  if (CLINICAL_SAFETY_PATTERNS.some((pattern) => pattern.test(text))) return "clinical_safety";
  return null;
}

export function aliceLocalHandoffReply(reason: AliceHandoffReason) {
  if (reason === "unsupported_procedure") {
    return "Esse assunto ainda não faz parte do escopo ativo da Alice. A equipe da unidade poderá orientar você por aqui. 💛";
  }
  return "Obrigada por me contar 💛 Esse ponto precisa ser avaliado por uma profissional habilitada, que poderá conversar com você e orientar com segurança.";
}
