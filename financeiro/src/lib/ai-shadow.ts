import { prisma } from "@/lib/db";

const PILOT_UNITS = ["Osasco"];
const DEFAULT_MODEL_A = "gemini:gemini-2.5-flash";
const DEFAULT_MODEL_B = "openai:gpt-5.4";
const SYSTEM_PROMPT = `Voce e uma assistente virtual da Clinica Virtuosa.
Atue em modo sombra: gere uma resposta que voce enviaria no WhatsApp, mas ela NAO sera enviada automaticamente.

Regras obrigatorias:
- Responda em portugues do Brasil, com tom acolhedor, humano e curto.
- Use no maximo 3 mensagens curtas.
- Nao invente preco, desconto, endereco, horario, disponibilidade ou promessa de resultado.
- Nao confirme agendamento. Se a pessoa tentar agendar, faca handoff.
- Nao de opiniao medica, diagnostico, orientacao de saude, medicacao, gestacao ou contraindicacao. Faca handoff.
- Reclame/irritacao/reembolso/complicacao/dor forte sempre e handoff.
- Se faltar informacao segura na base, faca handoff ou diga que a equipe confirma no horario comercial.
- Nunca diga que uma pessoa humana respondeu.

Retorne SOMENTE JSON valido:
{
  "decision": "reply" | "handoff" | "no_reply",
  "messages": ["mensagem 1", "mensagem 2"],
  "handoffReason": "motivo se houver",
  "confidence": 0.0,
  "guardrailFlags": ["flag"]
}`;

type ShadowSetting = {
  unit: string;
  enabled: boolean;
  allowedInstanceIds: unknown;
  modelA: string;
  modelB: string;
  onlyAfterHours: boolean;
  timezone: string;
  weekdayStart: string;
  weekdayEnd: string;
  weekendEnabled: boolean;
  maxRunsPerDay: number;
  promptVersion: string;
  knowledgeVersion: string;
};

type EnqueueParams = {
  conversationId: string;
  incomingMessageId: string;
  instanceId: string;
  instanceUnit?: string | null;
  capturesLeads?: boolean | null;
  assignedTo?: string | null;
  contactId?: string | null;
  contactPhone?: string | null;
  contactName?: string | null;
  messageBody: string;
  messageType: string;
  isFromMe: boolean;
  isSendablePhone: boolean;
};

type ModelCallResult = {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
};

function parseAllowedInstanceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseTime(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number.parseInt(part, 10));
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function nowInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const hour = Number.parseInt(get("hour"), 10);
  const minute = Number.parseInt(get("minute"), 10);
  return {
    weekday: get("weekday"),
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

function isOutsideBusinessHours(setting: ShadowSetting) {
  if (!setting.onlyAfterHours) return true;
  const now = nowInTimezone(setting.timezone || "America/Sao_Paulo");
  if (["Sat", "Sun"].includes(now.weekday)) return setting.weekendEnabled;

  const start = parseTime(setting.weekdayStart || "19:00");
  const end = parseTime(setting.weekdayEnd || "08:00");
  if (start === end) return true;
  if (start > end) return now.minutes >= start || now.minutes < end;
  return now.minutes >= start && now.minutes < end;
}

function compactText(value?: string | null, max = 900) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function extractJson(text: string) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(clean);
  } catch {}
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeModelSpec(spec: string) {
  const [provider, ...rest] = spec.split(":");
  const model = rest.join(":");
  return {
    provider: provider || "gemini",
    model: model || spec || DEFAULT_MODEL_A,
  };
}

function guardrailFlagsFor(text: string, decision?: string) {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const flags: string[] = [];
  if (/\b(garantid[ao]|resultado garantido|sem risco|100%)\b/.test(normalized)) flags.push("promise_result");
  if (/\b(diagnostico|remedio|medicacao|gravidez|gestante|contraindicacao|doenca|saude)\b/.test(normalized)) flags.push("medical_advice_risk");
  if (/\b(agendado|confirmado|marcado para|horario confirmado)\b/.test(normalized)) flags.push("confirmed_schedule");
  if (/r\$\s*\d|(?:^|\s)\d{2,5},\d{2}\b/.test(normalized)) flags.push("mentions_price");
  if (!["reply", "handoff", "no_reply"].includes(decision || "")) flags.push("invalid_decision");
  return [...new Set(flags)];
}

function normalizeDraft(rawText: string) {
  const parsed = extractJson(rawText) || {};
  const rawMessages: unknown[] = Array.isArray(parsed.messages) ? parsed.messages : [];
  const messages = rawMessages
    .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item: string) => item.trim())
    .slice(0, 3);
  const decision = ["reply", "handoff", "no_reply"].includes(parsed.decision) ? parsed.decision : "handoff";
  const flags = [
    ...(Array.isArray(parsed.guardrailFlags) ? parsed.guardrailFlags.filter((item: unknown) => typeof item === "string") : []),
    ...guardrailFlagsFor([rawText, ...messages].join("\n"), decision),
  ];

  return {
    decision,
    messages,
    handoffReason: typeof parsed.handoffReason === "string" ? compactText(parsed.handoffReason, 240) : null,
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : null,
    guardrailFlags: [...new Set(flags)],
  };
}

async function loadKnowledge(unit: string) {
  const [services, protocols] = await Promise.all([
    prisma.serviceCatalog.findMany({
      where: { active: true, OR: [{ unit }, { unit: "Todas" }] },
      select: { name: true, category: true, description: true, price: true, duration: true, unit: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 60,
    }),
    prisma.pricingProtocol.findMany({
      where: { OR: [{ unit }, { unit: "Todas" }] },
      select: { name: true, unit: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    unit,
    services: services.map((service) => ({
      name: service.name,
      category: service.category,
      description: compactText(service.description, 160),
      price: service.price,
      duration: service.duration,
      unit: service.unit,
    })),
    pricingProtocols: protocols.map((protocol) => ({
      name: protocol.name,
      unit: protocol.unit,
      updatedAt: protocol.updatedAt,
    })),
  };
}

async function buildRunContext(conversationId: string, unit: string) {
  const [conversation, knowledge] = await Promise.all([
    prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        status: true,
        assignedToName: true,
        contact: { select: { name: true, phone: true } },
        instance: { select: { name: true, unit: true } },
        messages: {
          orderBy: { timestamp: "desc" },
          take: 16,
          select: { body: true, fromMe: true, timestamp: true, respondedByName: true, type: true },
        },
      },
    }),
    loadKnowledge(unit),
  ]);

  if (!conversation) return null;
  return {
    conversation: {
      id: conversation.id,
      status: conversation.status,
      assignedToName: conversation.assignedToName,
      contactName: conversation.contact.name,
      contactPhone: conversation.contact.phone,
      instanceName: conversation.instance.name,
      unit: conversation.instance.unit,
    },
    messages: conversation.messages
      .reverse()
      .map((message) => ({
        role: message.fromMe ? `Clinica${message.respondedByName ? ` (${message.respondedByName})` : ""}` : "Lead",
        body: compactText(message.body, 700),
        type: message.type,
        timestamp: message.timestamp,
      })),
    knowledge,
  };
}

function buildPrompt(context: unknown) {
  return `Contexto real da conversa e base aprovada:
${JSON.stringify(context, null, 2)}

Gere a resposta sombra para o proximo passo da conversa. Lembre: responda somente JSON valido.`;
}

async function callGemini(model: string, prompt: string): Promise<ModelCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY nao configurada");
  const started = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 1200 },
    }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Gemini error ${res.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
  return {
    text,
    provider: "gemini",
    model,
    latencyMs: Date.now() - started,
    promptTokens: data?.usageMetadata?.promptTokenCount,
    completionTokens: data?.usageMetadata?.candidatesTokenCount,
  };
}

async function callOpenAI(model: string, prompt: string): Promise<ModelCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada");
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: SYSTEM_PROMPT,
      input: prompt,
      temperature: 0.35,
      max_output_tokens: 1200,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  const text = data.output_text || data.output?.flatMap((item: any) => item.content || []).map((item: any) => item.text || "").join("") || "";
  return {
    text,
    provider: "openai",
    model,
    latencyMs: Date.now() - started,
    promptTokens: data?.usage?.input_tokens,
    completionTokens: data?.usage?.output_tokens,
  };
}

async function callAnthropic(model: string, prompt: string): Promise<ModelCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nao configurada");
  const started = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.35,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic error ${res.status}`);
  const text = data?.content?.map((item: any) => item.text || "").join("") || "";
  return {
    text,
    provider: "anthropic",
    model,
    latencyMs: Date.now() - started,
    promptTokens: data?.usage?.input_tokens,
    completionTokens: data?.usage?.output_tokens,
  };
}

async function callOpenAiCompatible(provider: string, model: string, prompt: string): Promise<ModelCallResult> {
  const config = provider === "groq"
    ? { url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, label: "GROQ_API_KEY" }
    : { url: "https://api.mistral.ai/v1/chat/completions", key: process.env.MISTRAL_API_KEY, label: "MISTRAL_API_KEY" };
  if (!config.key) throw new Error(`${config.label} nao configurada`);
  const started = Date.now();
  const res = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.35,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `${provider} error ${res.status}`);
  return {
    text: data?.choices?.[0]?.message?.content || "",
    provider,
    model,
    latencyMs: Date.now() - started,
    promptTokens: data?.usage?.prompt_tokens,
    completionTokens: data?.usage?.completion_tokens,
  };
}

async function callShadowModel(spec: string, prompt: string) {
  const { provider, model } = normalizeModelSpec(spec);
  if (provider === "gemini") return callGemini(model, prompt);
  if (provider === "openai") return callOpenAI(model, prompt);
  if (provider === "anthropic" || provider === "claude") return callAnthropic(model, prompt);
  if (provider === "groq" || provider === "mistral") return callOpenAiCompatible(provider, model, prompt);
  throw new Error(`Provedor nao suportado: ${provider}`);
}

export async function ensureAiShadowSettings() {
  await Promise.all(
    PILOT_UNITS.map((unit) =>
      prisma.aiShadowSetting.upsert({
        where: { unit },
        update: {},
        create: { unit, enabled: false, allowedInstanceIds: [] },
      })
    )
  );
}

export async function enqueueAiShadowEvaluation(params: EnqueueParams) {
  try {
    if (params.isFromMe || !params.isSendablePhone) return null;
    if ((params.messageType || "text") !== "text") return null;
    if (!params.messageBody?.trim()) return null;
    if (params.assignedTo) return null;
    if (params.capturesLeads === false) return null;
    if (!params.instanceUnit || !PILOT_UNITS.includes(params.instanceUnit)) return null;

    const setting = await prisma.aiShadowSetting.findUnique({ where: { unit: params.instanceUnit } });
    if (!setting?.enabled) return null;
    const normalizedSetting = setting as ShadowSetting;
    const allowedInstanceIds = parseAllowedInstanceIds(setting.allowedInstanceIds);
    if (!allowedInstanceIds.includes(params.instanceId)) return null;
    if (!isOutsideBusinessHours(normalizedSetting)) return null;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const runsToday = await prisma.aiShadowRun.count({
      where: {
        unit: params.instanceUnit,
        instanceId: params.instanceId,
        createdAt: { gte: startOfDay },
      },
    });
    if (runsToday >= setting.maxRunsPerDay) return null;

    const context = await buildRunContext(params.conversationId, params.instanceUnit);
    if (!context) return null;

    const run = await prisma.aiShadowRun.upsert({
      where: { incomingMessageId: params.incomingMessageId },
      update: {},
      create: {
        conversationId: params.conversationId,
        incomingMessageId: params.incomingMessageId,
        unit: params.instanceUnit,
        instanceId: params.instanceId,
        contactId: params.contactId || null,
        contactPhone: params.contactPhone || null,
        contactName: params.contactName || null,
        status: "pending",
        triggerReason: "after_hours_inbound",
        promptVersion: setting.promptVersion,
        knowledgeVersion: setting.knowledgeVersion,
        context,
      },
    });

    await prisma.aiShadowDraft.createMany({
      data: [
        {
          runId: run.id,
          modelKey: "modelA",
          provider: normalizeModelSpec(setting.modelA || DEFAULT_MODEL_A).provider,
          model: normalizeModelSpec(setting.modelA || DEFAULT_MODEL_A).model,
          status: "pending",
        },
        {
          runId: run.id,
          modelKey: "modelB",
          provider: normalizeModelSpec(setting.modelB || DEFAULT_MODEL_B).provider,
          model: normalizeModelSpec(setting.modelB || DEFAULT_MODEL_B).model,
          status: "pending",
        },
      ],
      skipDuplicates: true,
    });

    return run;
  } catch (error) {
    console.error("[AI Shadow] Falha ao enfileirar", error);
    return null;
  }
}

export async function processAiShadowRuns(limit = 10) {
  await ensureAiShadowSettings();
  const runs = await prisma.aiShadowRun.findMany({
    where: { status: { in: ["pending", "failed"] } },
    include: { drafts: true },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 25)),
  });

  let processed = 0;
  for (const run of runs) {
    try {
      const setting = await prisma.aiShadowSetting.findUnique({ where: { unit: run.unit } });
      if (!setting?.enabled) continue;
      const prompt = buildPrompt(run.context);
      const labels = Math.random() > 0.5
        ? { modelA: "A", modelB: "B" }
        : { modelA: "B", modelB: "A" };
      const models = [
        { key: "modelA", spec: setting.modelA || DEFAULT_MODEL_A, label: labels.modelA },
        { key: "modelB", spec: setting.modelB || DEFAULT_MODEL_B, label: labels.modelB },
      ];

      const results = await Promise.allSettled(models.map(async (item) => {
        const modelResult = await callShadowModel(item.spec, prompt);
        const draft = normalizeDraft(modelResult.text);
        await prisma.aiShadowDraft.upsert({
          where: { runId_modelKey: { runId: run.id, modelKey: item.key } },
          update: {
            blindLabel: item.label,
            provider: modelResult.provider,
            model: modelResult.model,
            status: "generated",
            decision: draft.decision,
            messages: draft.messages,
            handoffReason: draft.handoffReason,
            confidence: draft.confidence,
            guardrailFlags: draft.guardrailFlags,
            rawText: modelResult.text,
            error: null,
            latencyMs: modelResult.latencyMs,
            promptTokens: modelResult.promptTokens,
            completionTokens: modelResult.completionTokens,
          },
          create: {
            runId: run.id,
            modelKey: item.key,
            blindLabel: item.label,
            provider: modelResult.provider,
            model: modelResult.model,
            status: "generated",
            decision: draft.decision,
            messages: draft.messages,
            handoffReason: draft.handoffReason,
            confidence: draft.confidence,
            guardrailFlags: draft.guardrailFlags,
            rawText: modelResult.text,
            latencyMs: modelResult.latencyMs,
            promptTokens: modelResult.promptTokens,
            completionTokens: modelResult.completionTokens,
          },
        });
      }));

      const errors = results
        .map((result, index) => result.status === "rejected" ? `${models[index].key}: ${result.reason?.message || result.reason}` : null)
        .filter(Boolean);

      if (errors.length) {
        await Promise.all(errors.map(async (message) => {
          const key = message?.startsWith("modelB") ? "modelB" : "modelA";
          const spec = models.find((item) => item.key === key)?.spec || DEFAULT_MODEL_A;
          const parsed = normalizeModelSpec(spec);
          await prisma.aiShadowDraft.upsert({
            where: { runId_modelKey: { runId: run.id, modelKey: key } },
            update: { status: "error", error: message, provider: parsed.provider, model: parsed.model },
            create: { runId: run.id, modelKey: key, status: "error", error: message, provider: parsed.provider, model: parsed.model },
          });
        }));
      }

      await prisma.aiShadowRun.update({
        where: { id: run.id },
        data: {
          status: errors.length === models.length ? "failed" : "ready",
          error: errors.length ? errors.join(" | ") : null,
          processedAt: new Date(),
        },
      });
      processed += 1;
    } catch (error: any) {
      await prisma.aiShadowRun.update({
        where: { id: run.id },
        data: { status: "failed", error: error?.message || String(error), processedAt: new Date() },
      });
    }
  }

  return { processed, scanned: runs.length };
}
