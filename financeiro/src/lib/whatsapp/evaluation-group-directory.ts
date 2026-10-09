import { isEvaluationGroupJid, isEvaluationGroupName } from "./evaluation-group-notice-config";

export type EvaluationNoticeGroup = { id: string; name: string; size: number | null; announce: boolean };

export function evaluationNoticeGroups(payload: unknown): EvaluationNoticeGroup[] {
  if (!Array.isArray(payload)) throw new Error("Resposta inválida ao consultar o grupo na Evolution.");
  const groups = new Map<string, EvaluationNoticeGroup>();
  for (const value of payload) {
    if (!value || typeof value !== "object") continue;
    const group = value as Record<string, unknown>;
    if (!isEvaluationGroupJid(group.id) || !isEvaluationGroupName(group.subject)) continue;
    // Outros grupos, descrições e participantes nunca são expostos ao navegador.
    groups.set(group.id, {
      id: group.id, name: group.subject.trim(),
      size: typeof group.size === "number" && Number.isInteger(group.size) && group.size >= 0 ? group.size : null,
      announce: group.announce === true,
    });
  }
  return [...groups.values()];
}

export async function fetchEvaluationNoticeGroups(instanceName: string, fetcher = fetch) {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!url || !apiKey) throw new Error("A conexão com a Evolution não está configurada neste ambiente.");
  let response: Response;
  try {
    response = await fetcher(`${url}/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`, {
      headers: { apikey: apiKey }, cache: "no-store", signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error("Não foi possível consultar o grupo agora. Verifique a conexão da Leads - Paloma e tente novamente.");
  }
  if (!response.ok) throw new Error("A Evolution não confirmou a consulta do grupo. Nenhuma configuração foi alterada.");
  return evaluationNoticeGroups(await response.json());
}
