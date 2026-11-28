import { aliceHealthHistoryRequiresHuman } from '#lib/alice/fear-policy';
import { evaluationReplyAffirms } from '#lib/ai-assistant/evaluation-confirmation';

const normalize = (text: string) => text.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  .replace(/\p{Cf}/gu, '').replace(/\s+/gu, ' ').trim();

export const evaluationTemporalReference = /\b\d{1,2}(?:\/\d{1,2}|h(?:\d{2})?|:\d{2}|\s+horas?)\b|\b(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?: ?feira)?\b|\b(?:manha|tarde|noite|primeiro horario|hoje|amanha)\b/u;
// Resposta curta a uma oferta, como "11" ou "ss, sexta 11"; o horário só vale se coincidir com a oferta.
const bareHourSelection = /^(?:(?:ss|sim|ok|pode ser|pode)[,\s]+)?(?:(?:(?:na|no)\s+)?(?:segunda|terca|quarta|quinta|sexta|sabado)(?: ?feira)?[,\s]+)?(?:(?:as|a)\s+)?\d{1,2}$/u;
const blocker = /\b(?:nao|nunca|talvez|caso|se|depend\w*|preciso|pensar|espera|aguard\w*|deixa|desisti|cancel\w*|mudei|retrata\w*|te aviso|eu aviso|vou ver|vou confirmar|depois (?:eu )?confirmo|outro horario|outro dia)\b/u;
const greeting = /^(?:oi|ola|bom dia|boa tarde|boa noite|tudo bem|obrigad[ao]|obg(?:d[ao]?)?)$/u;
const costQuestion = /^(?:tem (?:algum )?custo(?: (?:a|na|para a|da) avaliacao)?|a avaliacao (?:tem (?:algum )?custo|e (?:gratuita|paga))|quanto (?:custa|e) a avaliacao)$/u;
const addressQuestion = /^(?:(?:qual (?:e )?(?:o )?|(?:me )?(?:manda|mande|envia|envie|pode mandar|pode enviar) (?:o )?)(?:endereco|localizacao)(?: (?:da clinica|pra mim|para mim|por favor))*|onde (?:fica|e) (?:a clinica|a virtuosa|o endereco))$/u;
const generalFear = /^(?:(?:eu )?(?:tenho|morro de|estou com|to com) (?:muito )?(?:medo|receio)(?: (?:de|da|do|das|dos|desse|dessa) (?:agulhas?|injecao|dor|doer|procedimento|tratamento|resultado)(?: demais)?)?|(?:mas )?doi(?: muito)?|e doloroso)$/u;
const supplementaryQuestion = /^(?:mas )?(?:como funciona(?: (?:isso|o procedimento|o tratamento))?|como (?:e feit[oa]|e aplicad[oa])(?: (?:o procedimento|o tratamento))?|o que (?:e|seria)(?: (?:isso|o procedimento|o tratamento))?|e injetavel|tem agulha|usa agulha|tem anestesia|usa anestesia|qual (?:e )?(?:o |a )?(?:produto|marca|valor|preco)|quais (?:sao )?os valores|quanto custa(?: (?:isso|o procedimento|o tratamento))?|quanto tempo dura(?: (?:o procedimento|o tratamento|a sessao|a avaliacao|o efeito))?|como (?:ficou|fica|ficam|vai ficar)(?: o resultado)?(?: (?:apos|depois) (?:d?o|de) (?:procedimento|tratamento))?|qual (?:e )?o resultado|fica natural|tem (?:mais )?fotos(?: (?:pra|para) ver)?|pode (?:me )?(?:mandar|enviar) (?:mais )?fotos(?: por favor)?)$/u;
const schedulingQuestion = /\b(?:horarios?|vagas?|data|dia|agend\w*|marcar|confirm\w*|disponiv\w*)\b/u;

export type EvaluationReplySegments = {
  selections: string[];
  questions: string[];
  asksEvaluationCost: boolean;
  blocked: boolean;
};

export function evaluationReplyBlocksBooking(body: string) {
  const text = normalize(body);
  return blocker.test(text) || aliceHealthHistoryRequiresHuman(body);
}

/** Separa apenas fronteiras claras; conteúdo desconhecido continua bloqueando a reserva. */
export function splitEvaluationReply(body: string): EvaluationReplySegments {
  const result: EvaluationReplySegments = { selections: [], questions: [], asksEvaluationCost: false, blocked: false };
  if (evaluationReplyBlocksBooking(body)) return { ...result, blocked: true };
  const boundaries = body
    .replace(/,\s*(?=(?:(?:qual|quais|como|quanto|onde|tem|pode|posso|d[oó]i|morro|tenho medo|a avalia[çc][aã]o)\b))/giu, '\n')
    .replace(/\s+(?=(?:qual (?:o |[eé] )?endere[çc]o|manda o endere[çc]o|d[oó]i muito|morro de medo|tenho medo|tem algum custo|a avalia[çc][aã]o [eé])\b)/giu, '\n');
  const clauses = boundaries.match(/[^.!?\n]+[.!?]?/gu) || [];
  for (const raw of clauses) {
    const clause = raw.trim();
    const text = normalize(clause).replace(/[.!?]+$/gu, '').trim();
    if (!text || greeting.test(text)) continue;
    if (/^(?:eu )?trabalho (?:a|de) noite$/u.test(text)) continue;
    const selection = clause.replace(/[,;.\s]+(?:eu\s+)?saio do trabalho e vou direto[.!]?\s*$/iu, '').trim();
    if (costQuestion.test(text)) { result.asksEvaluationCost = true; continue; }
    if (addressQuestion.test(text)) continue;
    if (evaluationTemporalReference.test(text) || evaluationReplyAffirms(text) || bareHourSelection.test(text)) {
      result.selections.push(selection);
      continue;
    }
    if (generalFear.test(text) || supplementaryQuestion.test(text)) {
      if (schedulingQuestion.test(text)) { result.blocked = true; continue; }
      result.questions.push(clause);
      continue;
    }
    result.blocked = true;
  }
  return result;
}

/** Preserva o pedido de agendamento quando a cliente explica o deslocamento ou recusa uma opção anterior. */
export function splitDirectEvaluationReplies(bodies: readonly string[]) {
  const lines = bodies.flatMap((body) => body.split(/\r?\n|(?<=[.!?])[ \t]+/u)).map((line) => line.trim()
    .replace(/\b(\d{1,2});(\d{2})\b/gu, '$1:$2')
    .replace(/\bdia[ \t]+(\d{1,2})[ \t]+(\d{1,2})[ \t]+(\d{2}|\d{4})\b/giu,
      (_, day, month, year) => `${day}/${month}/${year.length === 2 ? `20${year}` : year}`)
    .replace(/\b(\d{1,2}\/\d{1,2}\/)\s?(\d{2})\b/gu, (_date, prefix, year) => `${prefix}20${year}`)
    .replace(/^no caso\s+(?=[aà]s\s+\d)/iu, '')
    .replace(/(?<![\p{L}\p{N}])([aà]s\s+\d{1,2})(?=[.!?]*$)/iu, '$1h')
    .replace(/^([aà]s\s+\d{1,2}(?:h\d{0,2}|:\d{2})?),?\s+(?=n[aã]o consigo chegar[.!]*$)/iu, '$1\n'))
    .flatMap((line) => line.split('\n')).filter(Boolean);

  let rejectedTime: string | null = null;
  if (/^nao consigo chegar[.!]*$/u.test(normalize(lines.at(-1) || ''))) {
    const rejection = normalize(lines.at(-2) || '').match(/^as (\d{1,2})(?:[h:](\d{2})?| horas?)?[.!]*$/u);
    if (rejection) {
      rejectedTime = `${rejection[1].padStart(2, '0')}:${rejection[2] || '00'}`;
      lines.splice(-2);
    }
  }
  const relevant = lines.filter((line) => !/^(?:(?:eu )?(?:saio|saiu) do trabalho as \d{1,2}(?:h\d{0,2}|:\d{2})?(?: e (?:vou|iria) direto)?|(?:eu )?(?:vou|iria) direto)[.!]*$/u.test(normalize(line)));
  return { ...splitEvaluationReply(relevant.join('\n')), rejectedTime };
}
