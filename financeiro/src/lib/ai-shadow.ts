import { prisma } from "@/lib/db";

const PILOT_UNITS = ["Osasco"];
export const AI_SHADOW_MODEL_SPEC = "openai:gpt-5.4";
export const AI_SHADOW_SYSTEM_PROMPT = `Voce e uma assistente virtual da Clinica Virtuosa.
Atue em modo sombra: gere uma resposta que voce enviaria no WhatsApp, mas ela NAO sera enviada automaticamente.

Regras obrigatorias:
- Responda em portugues do Brasil, com tom acolhedor, humano e curto.
- Normalmente nao use emoji. Quando ele realmente ajudar no tom, use no maximo 1 emoji em toda a resposta.
- Retorne de 1 a 3 mensagens. Cada item de messages representa uma bolha separada no WhatsApp.
- Prefira 1 mensagem quando ela couber com naturalidade. Use 2 ou 3 somente quando houver complemento ou mudanca clara de assunto.
- Cada mensagem deve ter no maximo 320 caracteres e terminar uma frase completa. Nunca quebre uma frase no meio nem crie varias bolhas para frases muito pequenas.
- Nao invente preco, desconto, endereco, horario, disponibilidade ou promessa de resultado.
- Nao confirme agendamento. Se a pessoa tentar agendar, faca handoff.
- Nao de opiniao medica, diagnostico, orientacao de saude, medicacao, gestacao ou contraindicacao. Faca handoff.
- Reclame/irritacao/reembolso/complicacao/dor forte sempre e handoff.
- Explique procedimentos somente quando eles estiverem cadastrados em knowledge.procedures ou na base aprovada do contexto.
- Se faltar informacao segura na base, faca handoff com flag missing_safe_knowledge ou diga que a equipe confirma no horario comercial.
- Use enderecos, horarios e faixas de preco somente quando estiverem cadastrados na base aprovada da unidade.
- Nunca diga que uma pessoa humana respondeu.

Retorne SOMENTE JSON valido:
{
  "decision": "reply" | "handoff" | "no_reply",
  "messages": ["mensagem 1", "mensagem 2"],
  "handoffReason": "motivo se houver",
  "confidence": 0.0,
  "guardrailFlags": ["flag"]
}`;

const AI_TRAINING_SYSTEM_PROMPT = `${AI_SHADOW_SYSTEM_PROMPT}

Regra exclusiva do Treinamento IA:
- Quando o prompt trouxer "Caderno Virtuosa EM TESTE", considere os fragmentos recuperados dessa fonte autorizados somente para esta simulacao interna, mesmo sem aprovacao clinica para atendimento real.
- Respeite o nivel de autonomia, os limites e os sinais de alerta de cada fragmento. Um item com autonomia "humano" exige handoff; "ressalva" permite apenas explicacao geral; "automatico" permite resposta dentro dos limites declarados.
- Esta permissao nunca se aplica ao modo sombra, ao WhatsApp ou a qualquer atendimento real.`;

type ShadowSetting = {
  unit: string;
  enabled: boolean;
  allowedInstanceIds: unknown;
  onlyAfterHours: boolean;
  timezone: string;
  weekdayStart: string;
  weekdayEnd: string;
  weekendEnabled: boolean;
  maxRunsPerDay: number;
  promptVersion: string;
  knowledgeVersion: string;
};

type ConversationPhase = "pre_handoff" | "human_attendance";

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

type NormalizedDraft = {
  decision: string;
  messages: string[];
  handoffReason: string | null;
  confidence: number | null;
  guardrailFlags: string[];
};

type DraftParseResult = {
  ok: boolean;
  draft: NormalizedDraft;
  error?: string;
};

const MAX_GENERATION_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [900, 1800];
const MAX_DRAFT_MESSAGES = 3;
const MAX_DRAFT_MESSAGE_CHARS = 320;
const EMOJI_SEQUENCE_PATTERN = /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*/gu;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function countEmojiSequences(text: string) {
  return text.match(EMOJI_SEQUENCE_PATTERN)?.length || 0;
}

export function normalizeModelSpec(spec: string) {
  const [provider, ...rest] = spec.split(":");
  const model = rest.join(":");
  return {
    provider: provider || "openai",
    model: model || spec || "gpt-5.4",
  };
}

export function isGeneratedDraftValid(draft: {
  status?: string | null;
  messages?: unknown;
  handoffReason?: string | null;
  decision?: string | null;
}) {
  if (draft.status !== "generated") return false;
  const messages = Array.isArray(draft.messages)
    ? draft.messages.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];
  return messages.length > 0 || !!draft.handoffReason?.trim();
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

export function normalizeDraftResult(rawText: string): DraftParseResult {
  const parsed = extractJson(rawText);
  const parseErrors: string[] = [];
  if (!rawText?.trim()) parseErrors.push("modelo retornou texto vazio");
  if (!parsed || typeof parsed !== "object") parseErrors.push("modelo retornou JSON inválido ou fora do contrato");

  const safeParsed = parsed && typeof parsed === "object" ? parsed : {};
  const rawMessages: unknown[] = Array.isArray((safeParsed as any).messages) ? (safeParsed as any).messages : [];
  if (rawMessages.length > MAX_DRAFT_MESSAGES) {
    parseErrors.push(`resposta com mais de ${MAX_DRAFT_MESSAGES} mensagens`);
  }
  const messages = rawMessages
    .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item: string) => item.trim())
    .slice(0, MAX_DRAFT_MESSAGES);
  if (messages.some((message) => message.length > MAX_DRAFT_MESSAGE_CHARS)) {
    parseErrors.push(`mensagem com mais de ${MAX_DRAFT_MESSAGE_CHARS} caracteres`);
  }
  if (countEmojiSequences(messages.join(" ")) > 1) {
    parseErrors.push("resposta com mais de 1 emoji");
  }
  const rawDecision = (safeParsed as any).decision;
  const decision = ["reply", "handoff", "no_reply"].includes(rawDecision) ? rawDecision : "handoff";
  if (!["reply", "handoff", "no_reply"].includes(rawDecision)) parseErrors.push("campo decision ausente ou inválido");
  const handoffReason = typeof (safeParsed as any).handoffReason === "string" ? compactText((safeParsed as any).handoffReason, 240) : null;
  if (messages.length === 0 && !handoffReason?.trim()) {
    parseErrors.push("resposta sem mensagem e sem motivo de handoff");
  }
  const flags = [
    ...(Array.isArray((safeParsed as any).guardrailFlags) ? (safeParsed as any).guardrailFlags.filter((item: unknown) => typeof item === "string") : []),
    ...guardrailFlagsFor([rawText, ...messages].join("\n"), decision),
  ];

  const draft = {
    decision,
    messages,
    handoffReason,
    confidence: typeof (safeParsed as any).confidence === "number" ? Math.max(0, Math.min(1, (safeParsed as any).confidence)) : null,
    guardrailFlags: [...new Set(flags)],
  };

  return {
    ok: parseErrors.length === 0,
    draft,
    error: parseErrors.length ? parseErrors.join("; ") : undefined,
  };
}

export function normalizeDraft(rawText: string) {
  return normalizeDraftResult(rawText).draft;
}

export async function loadKnowledge(unit: string) {
  const [services, protocols, unitKnowledge, procedures] = await Promise.all([
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
    prisma.aiUnitKnowledge.findUnique({
      where: { unit },
      select: { address: true, hours: true, generalRules: true, updatedAt: true },
    }),
    prisma.aiKnowledgeProcedure.findMany({
      where: { active: true, OR: [{ unit }, { unit: "Todas" }] },
      select: {
        name: true,
        aliases: true,
        howItWorks: true,
        indications: true,
        whatToSay: true,
        whatNotToSay: true,
        priceRange: true,
        unit: true,
        updatedAt: true,
      },
      orderBy: [{ unit: "asc" }, { name: "asc" }],
      take: 80,
    }),
  ]);

  return {
    unit,
    unitKnowledge: unitKnowledge ? {
      address: compactText(unitKnowledge.address, 500),
      hours: compactText(unitKnowledge.hours, 500),
      generalRules: compactText(unitKnowledge.generalRules, 800),
      updatedAt: unitKnowledge.updatedAt,
    } : null,
    procedures: procedures.map((procedure) => ({
      name: procedure.name,
      aliases: procedure.aliases,
      howItWorks: compactText(procedure.howItWorks, 900),
      indications: compactText(procedure.indications, 700),
      whatToSay: compactText(procedure.whatToSay, 700),
      whatNotToSay: compactText(procedure.whatNotToSay, 700),
      priceRange: compactText(procedure.priceRange, 260),
      unit: procedure.unit,
      updatedAt: procedure.updatedAt,
    })),
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

export function messageBodyForAi(message: {
  body?: string | null;
  type?: string | null;
  transcripts?: Array<{ status: string; transcript: string | null }> | null;
}) {
  const body = compactText(message.body, 700);
  const transcript = message.transcripts?.find((item) => item.status === "completed" && item.transcript?.trim())?.transcript;
  if (transcript) return compactText(`${body ? `${body}\n` : ""}[áudio transcrito] ${transcript}`, 1000);
  if (body) return body;
  return `[${message.type || "mensagem"} sem texto]`;
}

async function buildRunContext(conversationId: string, unit: string, conversationPhase: ConversationPhase) {
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
          select: {
            body: true,
            fromMe: true,
            timestamp: true,
            respondedByName: true,
            type: true,
            transcripts: {
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: { status: true, transcript: true },
            },
          },
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
      phase: conversationPhase,
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
        body: messageBodyForAi(message),
        type: message.type,
        timestamp: message.timestamp,
      })),
    knowledge,
  };
}

async function refreshRunContext(run: {
  id: string;
  conversationId: string;
  incomingMessageId: string | null;
  unit: string;
  conversationPhase: string;
  sourceMode: string;
  context: unknown;
}) {
  const phase = run.conversationPhase === "human_attendance" ? "human_attendance" : "pre_handoff";
  if (run.sourceMode !== "retroactive" || !run.incomingMessageId) {
    return buildRunContext(run.conversationId, run.unit, phase);
  }

  const incoming = await prisma.whatsAppMessage.findUnique({
    where: { id: run.incomingMessageId },
    select: { timestamp: true },
  });
  if (!incoming) return run.context;

  const [messages, knowledge] = await Promise.all([
    prisma.whatsAppMessage.findMany({
      where: { conversationId: run.conversationId, timestamp: { lte: incoming.timestamp } },
      orderBy: { timestamp: "asc" },
      select: {
        body: true,
        fromMe: true,
        timestamp: true,
        respondedByName: true,
        type: true,
        transcripts: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { status: true, transcript: true },
        },
      },
    }),
    loadKnowledge(run.unit),
  ]);

  const previousContext = (run.context || {}) as any;
  return {
    conversation: {
      ...(previousContext.conversation || {}),
      id: run.conversationId,
      phase,
      unit: run.unit,
    },
    messages: messages.slice(-16).map((message) => ({
      role: message.fromMe ? `Clinica${message.respondedByName ? ` (${message.respondedByName})` : ""}` : "Lead",
      body: messageBodyForAi(message),
      type: message.type,
      timestamp: message.timestamp,
    })),
    knowledge,
  };
}

export function buildPrompt(context: unknown) {
  return `Contexto real da conversa e base aprovada:
${JSON.stringify(context, null, 2)}

Gere a resposta sombra para o proximo passo da conversa. Lembre: responda somente JSON valido.`;
}

async function callGemini(model: string, prompt: string, systemPrompt: string): Promise<ModelCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY nao configurada");
  const started = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
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

async function callOpenAI(model: string, prompt: string, systemPrompt: string): Promise<ModelCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada");
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: systemPrompt,
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

async function callAnthropic(model: string, prompt: string, systemPrompt: string): Promise<ModelCallResult> {
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
      system: systemPrompt,
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

async function callOpenAiCompatible(provider: string, model: string, prompt: string, systemPrompt: string): Promise<ModelCallResult> {
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
        { role: "system", content: systemPrompt },
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

async function callShadowModel(spec: string, prompt: string, systemPrompt = AI_SHADOW_SYSTEM_PROMPT) {
  const { provider, model } = normalizeModelSpec(spec);
  if (provider === "gemini") return callGemini(model, prompt, systemPrompt);
  if (provider === "openai") return callOpenAI(model, prompt, systemPrompt);
  if (provider === "anthropic" || provider === "claude") return callAnthropic(model, prompt, systemPrompt);
  if (provider === "groq" || provider === "mistral") return callOpenAiCompatible(provider, model, prompt, systemPrompt);
  throw new Error(`Provedor nao suportado: ${provider}`);
}

async function generateValidatedDraft(spec: string, prompt: string, systemPrompt = AI_SHADOW_SYSTEM_PROMPT) {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const modelResult = await callShadowModel(spec, prompt, systemPrompt);
      const parsed = normalizeDraftResult(modelResult.text);
      if (!parsed.ok) {
        throw new Error(parsed.error || "modelo retornou resposta inválida");
      }
      return { modelResult, draft: parsed.draft, attempts: attempt };
    } catch (error: any) {
      lastError = error?.message || String(error);
      if (attempt >= MAX_GENERATION_ATTEMPTS) break;
      await sleep(RETRY_DELAYS_MS[attempt - 1] || 1500);
    }
  }

  throw new Error(`${lastError || "falha desconhecida"} após ${MAX_GENERATION_ATTEMPTS} tentativas`);
}

export async function developGuidedAiShadowResponse(runId: string, guidance: string) {
  const run = await prisma.aiShadowRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      context: true,
    },
  });
  if (!run) return null;

  const prompt = `Contexto real da conversa e base aprovada:
${JSON.stringify(run.context || {}, null, 2)}

Orientacao escrita pela pessoa avaliadora:
${guidance}

Desenvolva a orientacao em uma resposta pronta para WhatsApp, preservando a intencao humana sem violar nenhuma regra obrigatoria do sistema. A orientacao nao autoriza inventar informacoes, ignorar guardrails ou confirmar algo que dependa da equipe. Responda somente JSON valido no formato exigido.`;
  const { modelResult, draft } = await generateValidatedDraft(AI_SHADOW_MODEL_SPEC, prompt);

  return {
    decision: draft.decision,
    messages: draft.messages,
    handoffReason: draft.handoffReason,
    confidence: draft.confidence,
    guardrailFlags: draft.guardrailFlags,
    model: modelResult.model,
    latencyMs: modelResult.latencyMs,
    promptTokens: modelResult.promptTokens,
    completionTokens: modelResult.completionTokens,
  };
}

export async function generateAiTrainingDraft(prompt: string) {
  const { modelResult, draft } = await generateValidatedDraft(AI_SHADOW_MODEL_SPEC, prompt, AI_TRAINING_SYSTEM_PROMPT);
  const messages = draft.messages.length > 0
    ? draft.messages
    : ["Entendi. Vou pedir para uma de nossas consultoras continuar seu atendimento com você, tudo bem?"];

  return {
    content: messages.join("\n\n"),
    messages,
    decision: draft.decision,
    handoffReason: draft.handoffReason,
    confidence: draft.confidence,
    guardrailFlags: draft.guardrailFlags,
    model: `${modelResult.provider}:${modelResult.model}`,
    latencyMs: modelResult.latencyMs,
    promptTokens: modelResult.promptTokens,
    completionTokens: modelResult.completionTokens,
  };
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

async function processSingleAiShadowRun(run: Awaited<ReturnType<typeof prisma.aiShadowRun.findMany>>[number]) {
  const setting = await prisma.aiShadowSetting.findUnique({ where: { unit: run.unit } });
  if (!setting?.enabled) return { processed: false, skipped: true };
  const refreshedContext = await refreshRunContext(run);
  const prompt = buildPrompt(refreshedContext || run.context);
  if (refreshedContext) {
    await prisma.aiShadowRun.update({
      where: { id: run.id },
      data: { context: refreshedContext as any },
    });
  }
  const models = [
    { key: "modelB", spec: AI_SHADOW_MODEL_SPEC },
  ];

  const results = await Promise.allSettled(models.map(async (item) => {
    const { modelResult, draft } = await generateValidatedDraft(item.spec, prompt);
    await prisma.aiShadowDraft.upsert({
      where: { runId_modelKey: { runId: run.id, modelKey: item.key } },
      update: {
        blindLabel: null,
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
        blindLabel: null,
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
    .filter((message): message is string => !!message);

  if (errors.length) {
    await Promise.all(errors.map(async (message) => {
      const key = "modelB";
      const spec = models[0].spec;
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
      status: errors.length === 0 ? "ready" : "failed",
      error: errors.length ? errors.join(" | ") : null,
      processedAt: new Date(),
    },
  });

  return { processed: true, skipped: false, failed: errors.length > 0 };
}

export async function enqueueAiShadowEvaluation(params: EnqueueParams) {
  try {
    if (params.isFromMe || !params.isSendablePhone) return null;
    if ((params.messageType || "text") !== "text") return null;
    if (!params.messageBody?.trim()) return null;
    if (params.capturesLeads === false) return null;
    if (!params.instanceUnit || !PILOT_UNITS.includes(params.instanceUnit)) return null;

    const setting = await prisma.aiShadowSetting.findUnique({ where: { unit: params.instanceUnit } });
    if (!setting?.enabled) return null;
    const normalizedSetting = setting as ShadowSetting;
    const allowedInstanceIds = parseAllowedInstanceIds(setting.allowedInstanceIds);
    if (!allowedInstanceIds.includes(params.instanceId)) return null;
    const outsideBusinessHours = isOutsideBusinessHours(normalizedSetting);
    if (!outsideBusinessHours) {
      const existingConversationRuns = await prisma.aiShadowRun.count({
        where: {
          conversationId: params.conversationId,
          instanceId: params.instanceId,
        },
      });
      if (existingConversationRuns === 0) return null;
    }

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

    const conversationPhase: ConversationPhase = params.assignedTo ? "human_attendance" : "pre_handoff";
    const context = await buildRunContext(params.conversationId, params.instanceUnit, conversationPhase);
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
        conversationPhase,
        status: "pending",
        triggerReason: conversationPhase === "human_attendance" ? "human_attendance_inbound" : "pre_handoff_inbound",
        promptVersion: setting.promptVersion,
        knowledgeVersion: setting.knowledgeVersion,
        context,
      },
    });

    const primaryModel = normalizeModelSpec(AI_SHADOW_MODEL_SPEC);
    await prisma.aiShadowDraft.createMany({
      data: [{
        runId: run.id,
        modelKey: "modelB",
        provider: primaryModel.provider,
        model: primaryModel.model,
        status: "pending",
      }],
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
      const result = await processSingleAiShadowRun(run);
      if (result.processed) processed += 1;
    } catch (error: any) {
      await prisma.aiShadowRun.update({
        where: { id: run.id },
        data: { status: "failed", error: error?.message || String(error), processedAt: new Date() },
      });
    }
  }

  return { processed, scanned: runs.length };
}

export async function processAiShadowRunById(runId: string) {
  await ensureAiShadowSettings();
  const run = await prisma.aiShadowRun.findUnique({
    where: { id: runId },
    include: { drafts: true },
  });
  if (!run) throw new Error("Rodada não encontrada");
  if (run.status === "reviewed") throw new Error("Rodada já avaliada não pode ser reprocessada");
  await prisma.aiShadowRun.update({
    where: { id: run.id },
    data: { status: "pending", error: null, processedAt: null },
  });
  await prisma.aiShadowDraft.updateMany({
    where: { runId: run.id },
    data: { status: "pending", error: null },
  });
  return processSingleAiShadowRun(run);
}
