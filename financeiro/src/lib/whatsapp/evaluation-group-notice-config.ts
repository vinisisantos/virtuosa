export const EVALUATION_GROUP_SETTING_KEY = "whatsapp_evaluation_group_sbc_v1";
export const EVALUATION_GROUP_INSTANCE_ID = "a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3";
export const EVALUATION_GROUP_NAME = "AVALIAÇOES SBC";

export type EvaluationGroupConfig = {
  enabled: boolean;
  instanceId: string;
  groupJid: string;
  groupName: string;
  activatedAt: string;
  approvedBy: string;
};

function normalizedKey(value: string) {
  return value.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function isEvaluationGroupName(value: unknown): value is string {
  return typeof value === "string" && normalizedKey(value) === normalizedKey(EVALUATION_GROUP_NAME);
}

export function isEvaluationGroupJid(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && /^\d+(?:-\d+)?@g\.us$/.test(value);
}

export function normalizeEvaluationGroupText(value: unknown, maxLength = 160): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  return text && text.length <= maxLength ? text : null;
}

export function normalizeEvaluationGroupProcedure(value: unknown): string | null {
  const text = normalizeEvaluationGroupText(value);
  return text && !["avaliacao", "avaliacao gratuita"].includes(normalizedKey(text)) ? text : null;
}

export function normalizeEvaluationGroupPhone(value: unknown): string | null {
  if (typeof value !== "string" || /@/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

export function parseEvaluationGroupConfig(raw: unknown): EvaluationGroupConfig | null {
  try {
    const config = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!config || typeof config !== "object" || Array.isArray(config)) return null;
    if (typeof config.enabled !== "boolean" || config.instanceId !== EVALUATION_GROUP_INSTANCE_ID
      || !isEvaluationGroupJid(config.groupJid) || !isEvaluationGroupName(config.groupName)
      || typeof config.activatedAt !== "string" || !Number.isFinite(Date.parse(config.activatedAt))
      || !normalizeEvaluationGroupText(config.approvedBy, 200)) return null;
    return {
      enabled: config.enabled,
      instanceId: EVALUATION_GROUP_INSTANCE_ID,
      groupJid: config.groupJid,
      groupName: EVALUATION_GROUP_NAME,
      activatedAt: new Date(config.activatedAt).toISOString(),
      approvedBy: config.approvedBy.trim(),
    };
  } catch {
    return null;
  }
}
