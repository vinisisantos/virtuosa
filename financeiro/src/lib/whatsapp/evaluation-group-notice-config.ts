export const EVALUATION_GROUP_SETTING_KEY = "whatsapp_evaluation_group_sbc_v1";
export const EVALUATION_GROUP_INSTANCE_ID = "a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3";
export const EVALUATION_GROUP_NAME = "AVALIAÇOES SBC";

export type EvaluationGroupUnit = "SBC" | "Osasco";
export const EVALUATION_GROUP_UNIT_CONFIGS = [
  { unit: "SBC", settingKey: EVALUATION_GROUP_SETTING_KEY, instanceId: EVALUATION_GROUP_INSTANCE_ID,
    instanceDisplayName: "Leads - Paloma", groupName: EVALUATION_GROUP_NAME },
  { unit: "Osasco", settingKey: "whatsapp_evaluation_group_osasco_v1", instanceId: "d1385a2c-e4e9-4822-8125-c693edf9ef3d",
    instanceDisplayName: "Leads Osasco", groupName: "Lead Osasco" },
] as const;
export type EvaluationGroupUnitConfig = (typeof EVALUATION_GROUP_UNIT_CONFIGS)[number];

export function getEvaluationGroupUnitConfig(unit?: string | null): EvaluationGroupUnitConfig | null {
  return EVALUATION_GROUP_UNIT_CONFIGS.find(config => config.unit === unit) ?? null;
}

export function getEvaluationGroupUnitConfigByInstance(instanceId?: string | null): EvaluationGroupUnitConfig | null {
  return EVALUATION_GROUP_UNIT_CONFIGS.find(config => config.instanceId === instanceId) ?? null;
}

export type EvaluationGroupConfig = {
  enabled: boolean;
  instanceId: string;
  groupJid: string;
  groupName: string;
  activatedAt: string;
  approvedBy: string;
  confirmationsActivatedAt?: string;
  cancellationsActivatedAt?: string;
  reschedulesActivatedAt?: string;
};

function normalizedKey(value: string) {
  return value.trim().replace(/\s+/g, " ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function isEvaluationGroupName(value: unknown, unit: string = "SBC"): value is string {
  const scope = getEvaluationGroupUnitConfig(unit);
  return !!scope && typeof value === "string" && normalizedKey(value) === normalizedKey(scope.groupName);
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

export function parseEvaluationGroupConfig(raw: unknown, unit: string = "SBC"): EvaluationGroupConfig | null {
  try {
    const scope = getEvaluationGroupUnitConfig(unit);
    if (!scope) return null;
    const config = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!config || typeof config !== "object" || Array.isArray(config)) return null;
    if (typeof config.enabled !== "boolean" || config.instanceId !== scope.instanceId
      || !isEvaluationGroupJid(config.groupJid) || !isEvaluationGroupName(config.groupName, scope.unit)
      || typeof config.activatedAt !== "string" || !Number.isFinite(Date.parse(config.activatedAt))
      || !normalizeEvaluationGroupText(config.approvedBy, 200)) return null;
    if (config.confirmationsActivatedAt !== undefined
      && (typeof config.confirmationsActivatedAt !== "string"
        || !Number.isFinite(Date.parse(config.confirmationsActivatedAt)))) return null;
    if (config.cancellationsActivatedAt !== undefined
      && (typeof config.cancellationsActivatedAt !== "string"
        || !Number.isFinite(Date.parse(config.cancellationsActivatedAt)))) return null;
    if (config.reschedulesActivatedAt !== undefined
      && (typeof config.reschedulesActivatedAt !== "string"
        || !Number.isFinite(Date.parse(config.reschedulesActivatedAt)))) return null;
    return {
      enabled: config.enabled,
      instanceId: scope.instanceId,
      groupJid: config.groupJid,
      groupName: scope.groupName,
      activatedAt: new Date(config.activatedAt).toISOString(),
      approvedBy: config.approvedBy.trim(),
      ...(config.confirmationsActivatedAt ? { confirmationsActivatedAt: new Date(config.confirmationsActivatedAt).toISOString() } : {}),
      ...(config.cancellationsActivatedAt ? { cancellationsActivatedAt: new Date(config.cancellationsActivatedAt).toISOString() } : {}),
      ...(config.reschedulesActivatedAt ? { reschedulesActivatedAt: new Date(config.reschedulesActivatedAt).toISOString() } : {}),
    };
  } catch {
    return null;
  }
}
