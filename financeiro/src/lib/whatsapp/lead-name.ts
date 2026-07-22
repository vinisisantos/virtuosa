const LEAD_NAME_PREFIXES = [
  /^(?:(?:eu\s+)?(?:me|mim)\s+cham(?:o|ou)|meu\s+nome\s+[eé]|pode\s+me\s+chamar\s+de)\s+/i,
  /^sou\s+(?:(?:o|a)\s+)?/i,
  /^(?:nome\s*:)\s*/i,
];

const GREETING_PREFIX_PATTERN = /^(?:(?:oi+|ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite)[,!;.\s]*)+/i;
const NON_NAME_REPLY_PATTERN = /^(?:oiola|qual(?:\s+o)?\s+endereco|onde\s+fica(?:\s+.+)?|como\s+funciona(?:\s+.+)?|(?:oi\s+)?preciso\s+de\s+.+|oi\s+(?:sim|nao))$/;
const BODY_AREA_PATTERN = /\b(?:abdome(?:n)?|abdominal|barriga|bracos?|busto|coxas?|culote|costas?|face|flancos?|gluteos?|joelhos?|lombar|papada|pescoco|pernas?|quadril|rosto|seios?|umbigo)\b/;

export function isValidLeadName(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (text.length < 2 || text.length > 50) return false;
  if (/\d|https?:\/\/|www\.|@/.test(text)) return false;
  if (/[?!]{2,}/.test(text)) return false;
  const blocked = /^(oi|ola|olá|bom dia|boa tarde|boa noite|sim|nao|não|ok|tudo bem|obrigado|obrigada|quero|gostaria|preco|preço|valor|endereco|endereço|tenho interesse)$/i;
  if (blocked.test(text)) return false;
  if (NON_NAME_REPLY_PATTERN.test(normalized)) return false;
  if (BODY_AREA_PATTERN.test(normalized)) return false;
  if (/^(?:oi+|ola|bom dia|boa tarde|boa noite)\b/.test(normalized)) return false;

  const intentPattern = /\b(vcs?|voces?|voce|faz(?:em)?|tem|atende|trabalha|vende|quero|queria|gostaria|saber|informacoes?|informacao|preco|valor|quanto|custa|agenda(?:r)?|marcar|consulta|avaliacao|procedimento|tratamento|promocao|cham(?:o|ou)|mim|endolaser|endolift|botox|crio|criolipolise|corrente|russa|lipo|barriga|hyper\s*slim|hyperslim|monji|monjifast|celulite|flacidez|gordura|emagrecimento)\b/;
  if (intentPattern.test(normalized)) return false;

  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 1 && text.length > 18) return false;
  if (words.length > 4) return false;

  return /^[\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,5}$/u.test(text);
}

function formatLeadName(value: string) {
  const formatted = value
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)([\p{L}\p{M}])/gu, (_, space, letter) => `${space}${letter.toLocaleUpperCase("pt-BR")}`);
  return formatted
    .split(" ")
    .map((word, index) => index > 0 && /^(?:Da|Das|De|Do|Dos|E)$/.test(word) ? word.toLocaleLowerCase("pt-BR") : word)
    .join(" ");
}

export function extractLeadName(value: string, options?: { allowBareName?: boolean }) {
  const raw = value.trim();
  const withoutGreeting = raw.replace(GREETING_PREFIX_PATTERN, "").trim();
  let candidate: string | null = null;

  for (const pattern of LEAD_NAME_PREFIXES) {
    if (!pattern.test(withoutGreeting)) continue;
    candidate = withoutGreeting.replace(pattern, "").trim();
    break;
  }

  if (!candidate && options?.allowBareName) candidate = raw;
  if (!candidate) return null;

  candidate = candidate.split(/[,.!?;:\n]/)[0]?.trim() || "";
  candidate = candidate.replace(/\s+(?:tudo\s+bem|prazer|obrigad[ao]|por\s+favor)$/i, "").trim();
  if (!isValidLeadName(candidate)) return null;
  return formatLeadName(candidate);
}

export function isInsideLeadNameReplyWindow(params: {
  waitingSince: Date;
  replyAt: Date;
  maxHours?: number;
}) {
  const elapsed = params.replyAt.getTime() - params.waitingSince.getTime();
  const maxElapsed = (params.maxHours ?? 24) * 60 * 60 * 1000;
  return elapsed >= 0 && elapsed <= maxElapsed;
}
