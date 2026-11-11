import { sbcAttendanceHours, SBC_SATURDAY_ATTENDANCE, SBC_WEEKDAY_ATTENDANCE } from "@/lib/ai-assistant/sbc-attendance-hours";
import type { AliceAutonomousContext } from "@/lib/ai-assistant/autonomy/context";
import { saoPauloDateKey } from "@/lib/date-filter";

const normalize = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}|\p{Cf}/gu, "").toLowerCase();
const clockPattern = /\b(\d{1,2})(?:h(\d{2})?|:(\d{2})|\s+horas?)(?![\p{L}\p{N}])/gu;
const weekdays = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const dayPattern = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[ -]feira)?\b/gu;
const datePattern = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/gu;

function onlyAvailability(text: string) {
  const remaining = normalize(text).replace(clockPattern, "").replace(datePattern, "").replace(dayPattern, "")
    .replace(/\b(?:eu|so|somente|apenas|posso|consigo|prefiro|quero|pode|ser|seria|melhor|para|pra|mim|as|a|de|da|do|no|na|neste|nesse|nesta|nessa|dia|feira|semana|manha|tarde|noite|trabalho|durante|pela|pelo|periodo|tenho|disponibilidade|disponivel|horario|horarios|sim|ok|certo)\b/gu, "")
    .replace(/[\s,.!?;:()\-]+/gu, "");
  return !remaining;
}

/** Responde somente à negociação textual inequívoca; dúvidas e conteúdo desconhecido continuam com o modelo. */
export function sbcOutOfHoursReply(context: AliceAutonomousContext, now = new Date()) {
  if (context.prompt.UNIDADE !== "SBC" || context.source.type !== "text") return null;
  const history = context.messages;
  const teamIndex = history.findLastIndex((message) => message.fromMe);
  const team = history[teamIndex];
  if (team && (team.respondedBy || !/^alice(?: \(automação\))?$/iu.test(team.respondedByName || ""))) return null;
  const pending = history.slice(teamIndex + 1).filter((message) => !message.fromMe);
  if (pending.at(-1)?.id !== context.source.id || !pending.length || !pending.every((message) => onlyAvailability(message.body))) return null;
  const text = normalize(pending.map((message) => message.body).join(" "));
  const clocks = [...text.matchAll(clockPattern)];
  if (clocks.length !== 1) return null;
  const hour = Number(clocks[0][1]);
  const minute = Number(clocks[0][2] || clocks[0][3] || 0);
  if (hour > 23 || minute > 59) return null;
  const requested = hour * 60 + minute;
  const daysIn = (value: string): number[] | null => {
    const days = [...value.matchAll(dayPattern)].map((match) => weekdays.indexOf(match[1]));
    for (const date of value.matchAll(datePattern)) {
      const key = `${date[3] || saoPauloDateKey(now).slice(0, 4)}-${date[2].padStart(2, "0")}-${date[1].padStart(2, "0")}`;
      const parsed = new Date(`${key}T12:00:00-03:00`);
      if (!Number.isFinite(parsed.getTime()) || saoPauloDateKey(parsed) !== key || key < saoPauloDateKey(now)) return null;
      days.push(parsed.getUTCDay());
    }
    return [...new Set(days)];
  };
  const explicitDays = daysIn(text);
  const offeredDays = daysIn(normalize(team?.body || ""));
  if (!explicitDays || !offeredDays) return null;
  if (explicitDays.length > 1 || (!explicitDays.length && offeredDays.length > 1)) return null;
  if (!explicitDays.length && team?.timestamp && now.getTime() - team.timestamp.getTime() >= 86_400_000) return null;
  const weekday = explicitDays[0] ?? offeredDays[0];
  const fits = (day: number) => {
    const hours = sbcAttendanceHours(day);
    return Boolean(hours && requested >= hours.firstMinute && requested <= hours.lastMinute && requested % 30 === 0);
  };
  if (weekday === undefined ? fits(1) || fits(6) : fits(weekday)) return null;
  const descriptions = weekday === 6 ? [SBC_SATURDAY_ATTENDANCE, SBC_WEEKDAY_ATTENDANCE]
    : [SBC_WEEKDAY_ATTENDANCE, SBC_SATURDAY_ATTENDANCE];
  const period = hour < 12 ? "de manhã" : hour < 18 ? "à tarde" : "à noite";
  const question = fits(1) ? `Você teria disponibilidade durante a semana ${period}?`
    : "Você conseguiria vir em algum horário dentro desses períodos?";
  const interval = requested % 30 ? " Os inícios de avaliação são de 30 em 30 minutos." : "";
  const closed = weekday === 0 ? "Aos domingos não realizamos avaliações. " : "";
  return `${closed}${descriptions.join(" ")} Só conseguimos agendar dentro desses períodos.${interval}\n\n${question}`;
}
