export const AI_WHATSAPP_CANARY_RESPONDER = "IA Virtuosa";
export const AI_WHATSAPP_CANARY_RESET_TRIGGER_REASON = "authorized_private_whatsapp_reset";

export type AiWhatsAppCanaryConfig = {
  enabled: boolean;
  instanceId: string;
  phone: string;
  jid: string | null;
  knowledgeUnit: string;
  includeExperimentalCaderno: boolean;
  debounceMs: number;
};

export type AiWhatsAppCanaryTarget = {
  instanceId: string | null | undefined;
  contactPhone: string | null | undefined;
  lastKnownJid: string | null | undefined;
};

export type AiWhatsAppCanaryMessageActivity = {
  fromMe: boolean;
  respondedByName: string | null;
};

export type AiWhatsAppCanaryPriorRun<TContext> = {
  status: string;
  triggerReason: string | null;
  context: TContext;
  createdAt: Date;
};

export function normalizeAiWhatsAppCanaryPhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

export function isAiWhatsAppCanaryResetCommand(value: string | null | undefined) {
  return /^\{\{\s*reiniciar\s*\}\}?$/i.test(String(value || "").trim());
}

export function aiWhatsAppCanaryContextAfterLatestReset<TContext>(
  priorRuns: AiWhatsAppCanaryPriorRun<TContext>[],
) {
  const latestReset = priorRuns.find((priorRun) => (
    priorRun.triggerReason === AI_WHATSAPP_CANARY_RESET_TRIGGER_REASON
  ));
  const previousRun = priorRuns.find((priorRun) => (
    priorRun.status === "sent"
    && (!latestReset || priorRun.createdAt > latestReset.createdAt)
  ));
  return { latestReset, previousRun };
}

export function readAiWhatsAppCanaryConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AiWhatsAppCanaryConfig {
  const phone = normalizeAiWhatsAppCanaryPhone(environment.AI_WHATSAPP_CANARY_PHONE);
  const rawJid = environment.AI_WHATSAPP_CANARY_JID?.trim().toLowerCase() || null;
  const jidPhone = rawJid ? normalizeAiWhatsAppCanaryPhone(rawJid.split("@")[0]) : "";
  const requestedDebounce = Number(environment.AI_WHATSAPP_CANARY_DEBOUNCE_MS || "10000");
  const configurationIsConsistent = Boolean(
    environment.AI_WHATSAPP_CANARY_INSTANCE_ID?.trim()
      && phone
      && (!rawJid || jidPhone === phone),
  );

  return {
    enabled: environment.AI_WHATSAPP_CANARY_ENABLED === "true" && configurationIsConsistent,
    instanceId: environment.AI_WHATSAPP_CANARY_INSTANCE_ID?.trim() || "",
    phone,
    jid: rawJid,
    knowledgeUnit: environment.AI_WHATSAPP_CANARY_KNOWLEDGE_UNIT?.trim() || "Osasco",
    includeExperimentalCaderno: environment.AI_WHATSAPP_CANARY_INCLUDE_CADERNO === "true",
    debounceMs: Number.isFinite(requestedDebounce)
      ? Math.max(0, Math.min(requestedDebounce, 20_000))
      : 10_000,
  };
}

export function matchesAiWhatsAppCanaryTarget(
  config: AiWhatsAppCanaryConfig,
  target: AiWhatsAppCanaryTarget,
) {
  if (!config.enabled) return false;
  if (target.instanceId !== config.instanceId) return false;
  if (normalizeAiWhatsAppCanaryPhone(target.contactPhone) !== config.phone) return false;
  if (config.jid && target.lastKnownJid?.trim().toLowerCase() !== config.jid) return false;
  return true;
}

export function aiWhatsAppCanaryActivityBlockReason(
  newerMessages: AiWhatsAppCanaryMessageActivity[],
) {
  if (newerMessages.some((message) => !message.fromMe)) return "newer_inbound" as const;
  if (newerMessages.some((message) => (
    message.fromMe && message.respondedByName !== AI_WHATSAPP_CANARY_RESPONDER
  ))) {
    return "human_takeover" as const;
  }
  return null;
}
