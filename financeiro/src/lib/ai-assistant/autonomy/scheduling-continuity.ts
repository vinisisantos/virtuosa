import type { AliceAutonomousContext } from "@/lib/ai-assistant/autonomy/context";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { getEvaluationScheduleUnitConfig } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";

const normalize = (text: string) => text.normalize("NFKD").replace(/\p{Diacritic}|\p{Cf}/gu, "").toLowerCase();

/** Continuidade sem opções numéricas; nunca interpreta mídia nem substitui atendimento clínico ou agenda existente. */
export function sbcSchedulingContinuityReply(context: AliceAutonomousContext) {
  if (context.prompt.UNIDADE !== "SBC" || context.conversation.instance.id !== ALICE_AUTONOMY_INSTANCE_ID
    || context.handoffReason || context.bookingFollowup || context.memoryRuntime?.guard.fear
    || context.memoryRuntime?.guard.appointment || context.prompt.DADOS_AGENDA_ATUAIS) return null;
  const lastTeam = context.messages.findLastIndex((message) => message.fromMe);
  const pending = context.messages.slice(lastTeam + 1).filter((message) => !message.fromMe);
  if (!pending.length || pending.at(-1)?.id !== context.source.id
    || pending.some((message) => message.type !== "text" || !message.body.trim())) return null;
  const text = normalize(pending.map((message) => message.body).join("\n"));
  const clinic = getEvaluationScheduleUnitConfig({ unit: "SBC", instanceId: context.conversation.instance.id });
  if (!clinic) return null;
  const wantsAddress = /\b(?:endereco|localizacao|onde fica|(?:fica|ficam) (?:onde|aonde))\b/u.test(text);
  const question = /\b(?:durante a semana|dias uteis|segunda a sexta)\b/u.test(text)
    ? "Qual dia da semana e período ficam melhores para você fazer sua avaliação?"
    : /\bsabado\b/u.test(text) ? "Qual período do sábado fica melhor para você fazer sua avaliação?"
      : /\b(?:segunda|terca|quarta|quinta|sexta)(?:[ -]feira)?\b/u.test(text)
        ? "Qual período fica melhor para você fazer sua avaliação nesse dia?"
        : "Qual dia e período ficam melhores para você fazer sua avaliação?";
  return wantsAddress ? `Ficamos na ${clinic.address}.\n\n${question}` : question;
}
