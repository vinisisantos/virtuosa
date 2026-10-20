import { isEvaluationGroupJid, isEvaluationGroupName } from "./evaluation-group-notice-config";

export type EvaluationNoticeGroup = { id: string; name: string; size: number | null; announce: boolean };
export type EvaluationGroupDiscoveryDiagnostics = {
  connectedPhone: string | null;
  totalGroups: number;
  groupsWithoutName: number;
  relatedGroups: EvaluationNoticeGroup[];
  phoneUnavailable?: boolean;
};
export type EvaluationGroupDiscoveryResult = {
  groups: EvaluationNoticeGroup[];
  diagnostics?: EvaluationGroupDiscoveryDiagnostics;
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function groupMetadata(id: string, name: string, group: Record<string, unknown>): EvaluationNoticeGroup {
  return {
    id, name,
    size: typeof group.size === "number" && Number.isInteger(group.size) && group.size >= 0 ? group.size : null,
    announce: group.announce === true,
  };
}

export function evaluationNoticeGroups(payload: unknown, unit: string = "SBC"): EvaluationNoticeGroup[] {
  if (!Array.isArray(payload)) throw new Error("Resposta inválida ao consultar o grupo na Evolution.");
  const groups = new Map<string, EvaluationNoticeGroup>();
  for (const value of payload) {
    if (!value || typeof value !== "object") continue;
    const group = value as Record<string, unknown>;
    if (!isEvaluationGroupJid(group.id) || !isEvaluationGroupName(group.subject, unit)) continue;
    // Outros grupos, descrições e participantes nunca são expostos ao navegador.
    groups.set(group.id, groupMetadata(group.id, group.subject.trim(), group));
  }
  return [...groups.values()];
}

async function fetchEvolutionDirectoryJson(path: string, fetcher: typeof fetch, rejectRedirects = false): Promise<unknown> {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!url || !apiKey) throw new Error("A conexão com a Evolution não está configurada neste ambiente.");
  let response: Response;
  try {
    response = await fetcher(`${url}${path}`, {
      method: "GET", headers: { apikey: apiKey }, cache: "no-store", signal: AbortSignal.timeout(12000),
      ...(rejectRedirects ? { redirect: "error" } : {}),
    });
  } catch {
    throw new Error("Não foi possível consultar o grupo agora. Verifique a conexão da caixa e tente novamente.");
  }
  if (!response.ok) throw new Error("A Evolution não confirmou a consulta do grupo. Nenhuma configuração foi alterada.");
  try { return await response.json(); } catch { throw new Error("Resposta inválida ao consultar o grupo na Evolution."); }
}

function groupDirectoryPath(instanceName: string) {
  return `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`;
}

export async function fetchEvaluationNoticeGroups(instanceName: string, fetcher = fetch, unit: string = "SBC") {
  return evaluationNoticeGroups(await fetchEvolutionDirectoryJson(groupDirectoryPath(instanceName), fetcher), unit);
}

function ownerPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const jid = text.match(/^(\d{10,15})(?::\d+)?@(?:s\.whatsapp\.net|c\.us)$/);
  if (!jid && !/^[+\d ().-]+$/.test(text)) return null;
  const digits = (jid?.[1] ?? text).replace(/\D/g, "");
  const national = [12, 13].includes(digits.length) && digits.startsWith("55") ? digits.slice(2) : digits;
  return /^[1-9]\d{9,10}$/.test(national) ? national : null;
}

async function fetchConnectedOwnerPhone(instanceName: string, fetcher: typeof fetch): Promise<string | null> {
  try {
    const payload = await fetchEvolutionDirectoryJson(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, fetcher, true);
    const envelope = recordOf(payload);
    const instances = Array.isArray(payload) ? payload : Array.isArray(envelope?.instances) ? envelope.instances : [payload];
    const matches = instances.map(recordOf).filter(instance => {
      if (!instance) return false;
      const nested = recordOf(instance.instance);
      return (nested?.instanceName ?? nested?.name ?? instance.instanceName ?? instance.name) === instanceName;
    });
    if (matches.length !== 1) return null;
    const instance = matches[0]!;
    const nested = recordOf(instance.instance);
    return [nested?.ownerJid, nested?.owner, instance.ownerJid, instance.owner]
      .map(ownerPhone).find(phone => phone !== null) ?? null;
  } catch { return null; }
}

function relatedOsascoGroups(payload: unknown[], strictGroups: EvaluationNoticeGroup[]): EvaluationNoticeGroup[] {
  const strictIds = new Set(strictGroups.map(group => group.id));
  const related = new Map<string, EvaluationNoticeGroup>();
  for (const value of payload) {
    const group = recordOf(value);
    if (!group || !isEvaluationGroupJid(group.id) || strictIds.has(group.id)
      || typeof group.subject !== "string" || !group.subject.trim() || group.subject.length > 200) continue;
    const compact = group.subject.normalize("NFKC").normalize("NFD").replace(/[\p{Cf}\p{M}]/gu, "")
      .toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (compact !== "leadosasco" && compact !== "leadsosasco") continue;
    // Estes nomes são apenas pistas para conferência; a ativação usa a lista estrita.
    related.set(group.id, groupMetadata(group.id, group.subject, group));
    if (related.size === 10) break;
  }
  return [...related.values()];
}

export async function discoverEvaluationNoticeGroups(instanceName: string, fetcher = fetch, unit: string = "SBC"): Promise<EvaluationGroupDiscoveryResult> {
  if (unit !== "Osasco") return { groups: await fetchEvaluationNoticeGroups(instanceName, fetcher, unit) };
  const [payload, connectedPhone] = await Promise.all([
    fetchEvolutionDirectoryJson(groupDirectoryPath(instanceName), fetcher, true),
    fetchConnectedOwnerPhone(instanceName, fetcher),
  ]);
  const groups = evaluationNoticeGroups(payload, unit);
  // evaluationNoticeGroups rejeita envelopes: somente o array recebido é contado.
  const directory = payload as unknown[];
  return {
    groups,
    diagnostics: {
      connectedPhone,
      totalGroups: directory.length,
      groupsWithoutName: directory.filter(value => {
        const group = recordOf(value);
        return typeof group?.subject !== "string" || !group.subject.trim();
      }).length,
      relatedGroups: relatedOsascoGroups(directory, groups),
      ...(!connectedPhone ? { phoneUnavailable: true } : {}),
    },
  };
}
