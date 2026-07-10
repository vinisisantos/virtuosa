import { prisma } from "@/lib/db";
import { displayCampaignName } from "@/lib/campaign-labels";
import { phoneLookupKey } from "@/lib/phone";
import {
  AI_SHADOW_MODEL_SPEC,
  AI_SHADOW_SYSTEM_PROMPT,
  buildPrompt,
  loadKnowledge,
  messageBodyForAi,
  normalizeDraftResult,
  normalizeModelSpec,
} from "@/lib/ai-shadow";

const TARGET_SAMPLE_SIZE = 180;
const MAX_CANDIDATE_CONVERSATIONS = 1600;
const MAX_OUTPUT_TOKENS = 1200;
const ESTIMATED_OUTPUT_TOKENS_PER_DRAFT = 260;
const APPROX_BRL_PER_USD = 5.6;
const GEMINI_INLINE_BATCH_MAX_BYTES = 18 * 1024 * 1024;
const GEMINI_MISSING_OUTPUT_ERROR = "Gemini batch concluido sem respostas inline ou arquivo de saida.";

type ConversationPhase = "pre_handoff" | "human_attendance";
type Outcome = "converted" | "not_converted";
type ModelKey = "modelA" | "modelB";

type ModelSpec = {
  key: ModelKey;
  spec: string;
  provider: string;
  model: string;
};

type CandidateConversation = {
  id: string;
  instanceId: string;
  createdAt: Date;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  instanceName: string;
  campaignName: string;
  campaignId: string | null;
  outcome: Outcome;
  converted: boolean;
};

type RetroactiveMessageItem = {
  conversation: CandidateConversation;
  message: {
    id: string;
    body: string;
    type: string;
    timestamp: Date;
  };
  conversationPhase: ConversationPhase;
  context: unknown;
  prompt: string;
  inputTokens: number;
};

type EstimateParams = {
  unit?: string;
  sampleSize?: number;
  instanceIds?: string[];
};

type SubmitParams = EstimateParams & {
  confirmedEstimatedCostUsd?: number;
  submittedBy?: string | null;
};

function estimateTokens(text: string) {
  return Math.ceil((text || "").length / 4);
}

function costUsd(inputTokens: number, outputTokens: number, inputPerMTok: number, outputPerMTok: number) {
  return (inputTokens / 1_000_000) * inputPerMTok + (outputTokens / 1_000_000) * outputPerMTok;
}

function batchPricing(provider: string, model: string) {
  if (provider === "gemini" && model === "gemini-2.5-flash") {
    return { inputPerMTok: 0.15, outputPerMTok: 1.25, label: "Gemini Batch 2.5 Flash" };
  }
  if (provider === "openai" && model === "gpt-5.4") {
    return { inputPerMTok: 1.25, outputPerMTok: 7.5, label: "OpenAI Batch GPT-5.4" };
  }
  if ((provider === "anthropic" || provider === "claude") && model === "claude-sonnet-5") {
    return { inputPerMTok: 1, outputPerMTok: 5, label: "Anthropic Message Batches Claude Sonnet 5" };
  }
  if ((provider === "anthropic" || provider === "claude") && model.includes("sonnet")) {
    return { inputPerMTok: 1.5, outputPerMTok: 7.5, label: "Anthropic Message Batches Sonnet" };
  }
  return null;
}

function normalizeBatchProvider(provider: string) {
  return provider === "claude" ? "anthropic" : provider;
}

function ensureBatchCapableModels(models: ModelSpec[]) {
  const unsupported = models.filter((model) => {
    const provider = normalizeBatchProvider(model.provider);
    return provider !== "openai" && provider !== "anthropic" && provider !== "gemini";
  });
  if (unsupported.length > 0) {
    throw new Error(`Modelo(s) sem batch nativo: ${unsupported.map((item) => item.spec).join(", ")}`);
  }
}

function ensureBatchApiKeys(models: ModelSpec[]) {
  const providers = new Set(models.map((model) => normalizeBatchProvider(model.provider)));
  if (providers.has("gemini") && !process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY nao configurada");
  }
  if (providers.has("openai") && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY nao configurada");
  }
  if (providers.has("anthropic") && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY nao configurada");
  }
}

function leadWasBornInsideSystem(firstMessage?: { fromMe: boolean; timestamp: Date; body: string | null }, createdAt?: Date) {
  if (!firstMessage || firstMessage.fromMe || !firstMessage.body?.trim() || !createdAt) return false;
  const driftMs = firstMessage.timestamp.getTime() - createdAt.getTime();
  return driftMs >= -30 * 60 * 1000;
}

function isConverted(client: any, deals: Array<{ stage: string | null }>) {
  return (
    client?.stage === "venda" ||
    Number(client?.totalSpent || 0) > 0 ||
    Number(client?.packageValue || 0) > 0 ||
    deals.some((deal) => deal.stage === "fechado")
  );
}

function pickBestClient(clients: any[]) {
  return [...clients].sort((a, b) => {
    const aScore = (a.campaignName ? 20 : 0) + (a.source === "facebook_ad" ? 10 : 0) + (a.stage === "venda" ? 5 : 0);
    const bScore = (b.campaignName ? 20 : 0) + (b.source === "facebook_ad" ? 10 : 0) + (b.stage === "venda" ? 5 : 0);
    return bScore - aScore;
  })[0] || null;
}

function roundRobinByCampaign(candidates: CandidateConversation[], target: number) {
  const groups = new Map<string, CandidateConversation[]>();
  for (const candidate of candidates) {
    const list = groups.get(candidate.campaignName) || [];
    list.push(candidate);
    groups.set(candidate.campaignName, list);
  }

  const selected: CandidateConversation[] = [];
  const campaignNames = [...groups.keys()].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length);
  let keepGoing = true;
  while (selected.length < target && keepGoing) {
    keepGoing = false;
    for (const campaignName of campaignNames) {
      const list = groups.get(campaignName) || [];
      const next = list.shift();
      if (!next) continue;
      selected.push(next);
      keepGoing = true;
      if (selected.length >= target) break;
    }
  }

  return selected;
}

function stratifiedConversationSample(candidates: CandidateConversation[], sampleSize: number) {
  const converted = candidates.filter((item) => item.converted);
  const notConverted = candidates.filter((item) => !item.converted);
  const perOutcome = Math.floor(sampleSize / 2);
  const selected = [
    ...roundRobinByCampaign(converted, perOutcome),
    ...roundRobinByCampaign(notConverted, sampleSize - perOutcome),
  ];

  if (selected.length < sampleSize) {
    const selectedIds = new Set(selected.map((item) => item.id));
    for (const candidate of candidates) {
      if (selectedIds.has(candidate.id)) continue;
      selected.push(candidate);
      if (selected.length >= sampleSize) break;
    }
  }

  return selected.slice(0, sampleSize);
}

async function getSettingModels(unit: string): Promise<ModelSpec[]> {
  const setting = await prisma.aiShadowSetting.findUnique({ where: { unit } });
  if (!setting) throw new Error(`Configuração IA não encontrada para ${unit}`);
  const specs = [
    { key: "modelB" as const, spec: AI_SHADOW_MODEL_SPEC },
  ];
  return specs.map((item) => {
    const parsed = normalizeModelSpec(item.spec);
    return { ...item, provider: normalizeBatchProvider(parsed.provider), model: parsed.model };
  });
}

async function resolveInstanceIds(unit: string, requestedInstanceIds?: string[]) {
  const setting = await prisma.aiShadowSetting.findUnique({ where: { unit } });
  const allowed = Array.isArray(setting?.allowedInstanceIds)
    ? setting.allowedInstanceIds.filter((id): id is string => typeof id === "string")
    : [];
  const instanceIds = requestedInstanceIds?.length ? requestedInstanceIds : allowed;
  if (!instanceIds.length) throw new Error("Selecione a instância da Thais antes de estimar o retroativo.");

  const instances = await prisma.whatsAppInstance.findMany({
    where: {
      id: { in: instanceIds },
      unit,
      capturesLeads: true,
      status: { not: "archived" },
    },
    select: { id: true, name: true, phoneNumber: true, unit: true },
  });
  if (instances.length !== instanceIds.length) {
    throw new Error("Amostra retroativa permitida apenas para instâncias comerciais da unidade selecionada.");
  }
  return instances;
}

async function loadCandidateConversations(unit: string, instanceIds: string[], sampleSize: number) {
  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      instanceId: { in: instanceIds },
      instance: { unit, capturesLeads: true },
      messages: { some: { type: "text", body: { not: "" } } },
    },
    select: {
      id: true,
      instanceId: true,
      contactId: true,
      createdAt: true,
      contact: { select: { name: true, phone: true } },
      instance: { select: { name: true } },
      messages: {
        orderBy: { timestamp: "asc" },
        take: 1,
        select: { fromMe: true, timestamp: true, body: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(sampleSize * 8, 600), MAX_CANDIDATE_CONVERSATIONS),
  });

  const bornInside = conversations.filter((conversation) =>
    leadWasBornInsideSystem(conversation.messages[0], conversation.createdAt)
  );
  const phoneKeys = [...new Set(bornInside.map((conversation) => phoneLookupKey(conversation.contact.phone)).filter(Boolean) as string[])];
  if (phoneKeys.length === 0) return [];

  const clients = await prisma.client.findMany({
    where: {
      OR: [{ unit }, { originUnit: unit }],
      phone: { not: null },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      source: true,
      unit: true,
      originUnit: true,
      campaignName: true,
      campaignId: true,
      stage: true,
      totalSpent: true,
      packageValue: true,
      createdAt: true,
    },
    take: 8000,
  });

  const clientsByPhone = new Map<string, typeof clients>();
  for (const client of clients) {
    const key = phoneLookupKey(client.phone);
    if (!key || !phoneKeys.includes(key)) continue;
    const list = clientsByPhone.get(key) || [];
    list.push(client);
    clientsByPhone.set(key, list);
  }

  const clientIds = [...new Set([...clientsByPhone.values()].flat().map((client) => client.id))];
  const deals = clientIds.length
    ? await prisma.salesPipeline.findMany({
        where: { clientId: { in: clientIds }, unit },
        select: { clientId: true, stage: true },
      })
    : [];
  const dealsByClientId = new Map<string, typeof deals>();
  for (const deal of deals) {
    const list = dealsByClientId.get(deal.clientId) || [];
    list.push(deal);
    dealsByClientId.set(deal.clientId, list);
  }

  return bornInside
    .map((conversation) => {
      const key = phoneLookupKey(conversation.contact.phone);
      const client = key ? pickBestClient(clientsByPhone.get(key) || []) : null;
      if (!client) return null;
      const clientDeals = dealsByClientId.get(client.id) || [];
      if (clientDeals.length === 0) return null;
      const converted = isConverted(client, clientDeals);
      return {
        id: conversation.id,
        instanceId: conversation.instanceId,
        createdAt: conversation.createdAt,
        contactId: conversation.contactId,
        contactName: conversation.contact.name,
        contactPhone: conversation.contact.phone,
        instanceName: conversation.instance.name,
        campaignName: displayCampaignName(client.campaignName),
        campaignId: client.campaignId,
        outcome: converted ? "converted" : "not_converted",
        converted,
      } satisfies CandidateConversation;
    })
    .filter((item): item is CandidateConversation => !!item);
}

async function buildRetroactiveItems(conversations: CandidateConversation[], unit: string) {
  if (conversations.length === 0) return [];
  const knowledge = await loadKnowledge(unit);
  const conversationIds = conversations.map((conversation) => conversation.id);
  const allMessages = await prisma.whatsAppMessage.findMany({
    where: { conversationId: { in: conversationIds } },
    orderBy: [{ conversationId: "asc" }, { timestamp: "asc" }],
    select: {
      id: true,
      conversationId: true,
      body: true,
      type: true,
      fromMe: true,
      timestamp: true,
      respondedByName: true,
      transcripts: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { status: true, transcript: true },
      },
    },
  });
  const messagesByConversation = new Map<string, typeof allMessages>();
  for (const message of allMessages) {
    const list = messagesByConversation.get(message.conversationId) || [];
    list.push(message);
    messagesByConversation.set(message.conversationId, list);
  }

  const items: RetroactiveMessageItem[] = [];
  for (const conversation of conversations) {
    const messages = messagesByConversation.get(conversation.id) || [];
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.fromMe || message.type !== "text" || !message.body?.trim()) continue;
      const previousMessages = messages.slice(0, index + 1);
      const hasHumanReplyBefore = previousMessages.some((item) => item.fromMe && item.respondedByName !== "Automação");
      const conversationPhase: ConversationPhase = hasHumanReplyBefore ? "human_attendance" : "pre_handoff";
      const context = {
        conversation: {
          id: conversation.id,
          status: "historical",
          phase: conversationPhase,
          outcome: conversation.outcome,
          campaignName: conversation.campaignName,
          contactName: conversation.contactName,
          contactPhone: conversation.contactPhone,
          instanceName: conversation.instanceName,
          unit,
        },
        messages: previousMessages.slice(-16).map((item) => ({
          role: item.fromMe ? `Clinica${item.respondedByName ? ` (${item.respondedByName})` : ""}` : "Lead",
          body: messageBodyForAi(item),
          type: item.type,
          timestamp: item.timestamp,
        })),
        knowledge,
      };
      const prompt = buildPrompt(context);
      items.push({
        conversation,
        message: {
          id: message.id,
          body: message.body,
          type: message.type,
          timestamp: message.timestamp,
        },
        conversationPhase,
        context,
        prompt,
        inputTokens: estimateTokens(`${AI_SHADOW_SYSTEM_PROMPT}\n\n${prompt}`),
      });
    }
  }

  return items;
}

function summarizeCosts(items: RetroactiveMessageItem[], models: ModelSpec[]) {
  const inputTokens = items.reduce((sum, item) => sum + item.inputTokens, 0);
  const outputTokens = items.length * ESTIMATED_OUTPUT_TOKENS_PER_DRAFT;
  const byModel = models.map((model) => {
    const pricing = batchPricing(model.provider, model.model);
    const estimatedCostUsd = pricing ? costUsd(inputTokens, outputTokens, pricing.inputPerMTok, pricing.outputPerMTok) : null;
    return {
      modelKey: model.key,
      provider: model.provider,
      model: model.model,
      pricingLabel: pricing?.label || "Sem preço batch configurado",
      requestCount: items.length,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      estimatedCostUsd,
      estimatedCostBrl: estimatedCostUsd === null ? null : estimatedCostUsd * APPROX_BRL_PER_USD,
    };
  });
  const totalUsd = byModel.reduce((sum, item) => sum + (item.estimatedCostUsd || 0), 0);
  return {
    byModel,
    totalUsd,
    totalBrl: totalUsd * APPROX_BRL_PER_USD,
  };
}

export async function estimateRetroactiveAiShadow(params: EstimateParams = {}) {
  const unit = params.unit || "Osasco";
  if (unit !== "Osasco") throw new Error("Modo retroativo habilitado apenas para Osasco nesta fase.");
  const sampleSize = Math.max(20, Math.min(220, Number(params.sampleSize || TARGET_SAMPLE_SIZE)));
  const instances = await resolveInstanceIds(unit, params.instanceIds);
  const models = await getSettingModels(unit);
  ensureBatchCapableModels(models);

  const candidates = await loadCandidateConversations(unit, instances.map((item) => item.id), sampleSize);
  const selectedConversations = stratifiedConversationSample(candidates, sampleSize);
  const items = await buildRetroactiveItems(selectedConversations, unit);
  const costs = summarizeCosts(items, models);
  const byOutcome = selectedConversations.reduce<Record<string, number>>((acc, item) => {
    acc[item.outcome] = (acc[item.outcome] || 0) + 1;
    return acc;
  }, {});
  const byCampaign = selectedConversations.reduce<Record<string, number>>((acc, item) => {
    acc[item.campaignName] = (acc[item.campaignName] || 0) + 1;
    return acc;
  }, {});

  return {
    unit,
    sampleSize,
    instances,
    candidateConversations: candidates.length,
    selectedConversations: selectedConversations.length,
    selectedLeadMessages: items.length,
    byOutcome,
    byCampaign,
    costs,
    preview: selectedConversations.slice(0, 12).map((conversation) => ({
      conversationId: conversation.id,
      contactName: conversation.contactName,
      contactPhone: conversation.contactPhone,
      campaignName: conversation.campaignName,
      outcome: conversation.outcome,
      instanceName: conversation.instanceName,
    })),
  };
}

function makeBatchCustomId(draftId: string) {
  return `d_${draftId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}`;
}

async function prepareRetroactiveRuns(params: EstimateParams) {
  const unit = params.unit || "Osasco";
  const sampleSize = Math.max(20, Math.min(220, Number(params.sampleSize || TARGET_SAMPLE_SIZE)));
  const instances = await resolveInstanceIds(unit, params.instanceIds);
  const models = await getSettingModels(unit);
  ensureBatchCapableModels(models);
  ensureBatchApiKeys(models);
  const candidates = await loadCandidateConversations(unit, instances.map((item) => item.id), sampleSize);
  const selectedConversations = stratifiedConversationSample(candidates, sampleSize);
  const items = await buildRetroactiveItems(selectedConversations, unit);
  const costs = summarizeCosts(items, models);

  const createdRuns = [];
  for (const item of items) {
    const run = await prisma.aiShadowRun.upsert({
      where: { incomingMessageId: item.message.id },
      update: {},
      create: {
        conversationId: item.conversation.id,
        incomingMessageId: item.message.id,
        unit,
        instanceId: item.conversation.instanceId,
        contactId: item.conversation.contactId,
        contactPhone: item.conversation.contactPhone,
        contactName: item.conversation.contactName,
        sourceMode: "retroactive",
        outcome: item.conversation.outcome,
        campaignName: item.conversation.campaignName,
        campaignId: item.conversation.campaignId,
        conversationPhase: item.conversationPhase,
        status: "batch_queued",
        triggerReason: "retroactive_batch",
        promptVersion: "virt-ai-shadow-v1",
        knowledgeVersion: "crm-live-v1",
        context: item.context as any,
      },
    });
    if (run.sourceMode !== "retroactive") continue;

    await prisma.aiShadowDraft.createMany({
      data: models.map((model) => ({
        runId: run.id,
        modelKey: model.key,
        blindLabel: null,
        provider: model.provider,
        model: model.model,
        status: "batch_queued",
      })),
      skipDuplicates: true,
    });
    createdRuns.push({ run, item });
  }

  const runIds = createdRuns.map(({ run }) => run.id);
  const drafts = await prisma.aiShadowDraft.findMany({
    where: {
      runId: { in: runIds },
      status: "batch_queued",
      batchJobId: null,
    },
    select: { id: true, runId: true, modelKey: true, provider: true, model: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const itemByRunId = new Map(createdRuns.map(({ run, item }) => [run.id, item]));

  return { unit, models, costs, items, drafts, itemByRunId };
}

async function submitOpenAiBatch(jobId: string, model: string, requests: Array<{ customId: string; prompt: string }>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada");
  const jsonl = requests.map((request) => JSON.stringify({
    custom_id: request.customId,
    method: "POST",
    url: "/v1/responses",
    body: {
      model,
      instructions: AI_SHADOW_SYSTEM_PROMPT,
      input: request.prompt,
      temperature: 0.35,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    },
  })).join("\n");

  const form = new FormData();
  form.append("purpose", "batch");
  form.append("file", new Blob([jsonl], { type: "application/jsonl" }), `ai-shadow-${jobId}.jsonl`);
  const fileRes = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const file = await fileRes.json().catch(() => ({}));
  if (!fileRes.ok) throw new Error(file?.error?.message || `OpenAI file upload ${fileRes.status}`);

  const batchRes = await fetch("https://api.openai.com/v1/batches", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
      metadata: { jobId, feature: "ai-shadow-retroactive" },
    }),
  });
  const batch = await batchRes.json().catch(() => ({}));
  if (!batchRes.ok) throw new Error(batch?.error?.message || `OpenAI batch ${batchRes.status}`);
  return { providerBatchId: batch.id, inputFileId: file.id };
}

async function submitAnthropicBatch(model: string, requests: Array<{ customId: string; prompt: string }>): Promise<{ providerBatchId: string; inputFileId?: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nao configurada");
  const res = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      requests: requests.map((request) => ({
        custom_id: request.customId,
        params: {
          model,
          system: AI_SHADOW_SYSTEM_PROMPT,
          messages: [{ role: "user", content: request.prompt }],
          temperature: 0.35,
          max_tokens: MAX_OUTPUT_TOKENS,
        },
      })),
    }),
  });
  const batch = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(batch?.error?.message || `Anthropic batch ${res.status}`);
  return { providerBatchId: batch.id, inputFileId: null };
}

async function submitGeminiBatch(jobId: string, model: string, requests: Array<{ customId: string; prompt: string }>): Promise<{ providerBatchId: string; inputFileId?: string | null }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY nao configurada");
  const body = {
    batch: {
      display_name: `ai-shadow-retroactive-${jobId}`,
      input_config: {
        requests: {
          requests: requests.map((request) => ({
            request: {
              contents: [
                {
                  role: "user",
                  parts: [{ text: `${AI_SHADOW_SYSTEM_PROMPT}\n\n${request.prompt}` }],
                },
              ],
              generation_config: { temperature: 0.35, maxOutputTokens: MAX_OUTPUT_TOKENS },
            },
            metadata: { key: request.customId },
          })),
        },
      },
    },
  };
  const bodyText = JSON.stringify(body);
  const bodyBytes = Buffer.byteLength(bodyText, "utf8");
  if (bodyBytes > GEMINI_INLINE_BATCH_MAX_BYTES) {
    throw new Error("Lote Gemini acima do limite inline seguro. Reduza a amostra ou use input file.");
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: bodyText,
  });
  const batch = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(batch?.error?.message || `Gemini batch ${res.status}`);
  if (!batch?.name) throw new Error("Gemini batch nao retornou identificador do job.");
  return { providerBatchId: batch.name, inputFileId: null };
}

export async function submitRetroactiveAiShadowBatch(params: SubmitParams = {}) {
  const prepared = await prepareRetroactiveRuns(params);
  if (prepared.costs.totalUsd > Number(params.confirmedEstimatedCostUsd || 0) * 1.25 + 0.01) {
    throw new Error("Estimativa mudou. Refaça a prévia antes de submeter o lote.");
  }

  const results = [];
  for (const model of prepared.models) {
    const modelDrafts = prepared.drafts.filter((draft) => draft.modelKey === model.key);
    if (modelDrafts.length === 0) continue;
    const pricing = batchPricing(model.provider, model.model);
    const estimatedInputTokens = modelDrafts.reduce((sum, draft) => sum + (prepared.itemByRunId.get(draft.runId)?.inputTokens || 0), 0);
    const estimatedOutputTokens = modelDrafts.length * ESTIMATED_OUTPUT_TOKENS_PER_DRAFT;
    const estimatedCostUsd = pricing
      ? costUsd(estimatedInputTokens, estimatedOutputTokens, pricing.inputPerMTok, pricing.outputPerMTok)
      : 0;

    const job = await prisma.aiShadowBatchJob.create({
      data: {
        unit: prepared.unit,
        sourceMode: "retroactive",
        provider: model.provider,
        model: model.model,
        modelKey: model.key,
        status: "submitting",
        requestCount: modelDrafts.length,
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedCostUsd,
        submittedBy: params.submittedBy || null,
        metadata: {
          sampleSize: params.sampleSize || TARGET_SAMPLE_SIZE,
          confirmedEstimatedCostUsd: params.confirmedEstimatedCostUsd || null,
        },
      },
    });

    const requests = modelDrafts.map((draft) => {
      const item = prepared.itemByRunId.get(draft.runId)!;
      return { draft, customId: makeBatchCustomId(draft.id), prompt: item.prompt };
    });

    try {
      await prisma.aiShadowBatchJob.update({
        where: { id: job.id },
        data: {
          metadata: {
            sampleSize: params.sampleSize || TARGET_SAMPLE_SIZE,
            confirmedEstimatedCostUsd: params.confirmedEstimatedCostUsd || null,
            customIds: requests.map((request) => request.customId),
          },
        },
      });

      const submitted = model.provider === "openai"
        ? await submitOpenAiBatch(job.id, model.model, requests)
        : model.provider === "gemini"
          ? await submitGeminiBatch(job.id, model.model, requests)
          : await submitAnthropicBatch(model.model, requests);

      await prisma.aiShadowDraft.updateMany({
        where: { id: { in: requests.map((request) => request.draft.id) } },
        data: { batchJobId: job.id },
      });
      for (const request of requests) {
        await prisma.aiShadowDraft.update({
          where: { id: request.draft.id },
          data: { batchCustomId: request.customId },
        });
      }

      await prisma.aiShadowBatchJob.update({
        where: { id: job.id },
        data: {
          status: "submitted",
          providerBatchId: submitted.providerBatchId,
          inputFileId: submitted.inputFileId || null,
        },
      });
      results.push({ jobId: job.id, provider: model.provider, model: model.model, providerBatchId: submitted.providerBatchId, requestCount: requests.length });
    } catch (error: any) {
      await prisma.aiShadowBatchJob.update({
        where: { id: job.id },
        data: { status: "failed", error: error?.message || String(error) },
      });
      throw error;
    }
  }

  return {
    submittedJobs: results,
    selectedLeadMessages: prepared.items.length,
    estimatedCostUsd: prepared.costs.totalUsd,
    estimatedCostBrl: prepared.costs.totalBrl,
  };
}

function openAiText(body: any) {
  return body?.output_text || body?.output?.flatMap((item: any) => item.content || []).map((item: any) => item.text || "").join("") || "";
}

function anthropicText(message: any) {
  return message?.content?.map((item: any) => item.text || "").join("") || "";
}

function geminiText(response: any) {
  if (typeof response?.text === "string") return response.text;
  return response?.candidates?.flatMap((candidate: any) => candidate?.content?.parts || []).map((part: any) => part.text || "").join("") || "";
}

function geminiPromptTokens(response: any) {
  return response?.usageMetadata?.promptTokenCount || response?.usage_metadata?.prompt_token_count;
}

function geminiCompletionTokens(response: any) {
  return response?.usageMetadata?.candidatesTokenCount || response?.usage_metadata?.candidates_token_count;
}

async function updateRunStatusForDrafts(draftIds: string[]) {
  const drafts = await prisma.aiShadowDraft.findMany({
    where: { id: { in: draftIds } },
    select: { runId: true },
  });
  const runIds = [...new Set(drafts.map((draft) => draft.runId))];
  for (const runId of runIds) {
    const runDrafts = await prisma.aiShadowDraft.findMany({
      where: { runId },
      select: { status: true, error: true },
    });
    const ready = runDrafts.every((draft) => draft.status === "generated");
    const terminal = runDrafts.every((draft) => draft.status === "generated" || draft.status === "error");
    if (!terminal) continue;
    const failed = !ready;
    await prisma.aiShadowRun.update({
      where: { id: runId },
      data: {
        status: ready ? "ready" : "failed",
        error: failed ? runDrafts.map((draft) => draft.error).filter(Boolean).join(" | ") : null,
        processedAt: new Date(),
      },
    });
  }
}

async function saveBatchTextDraft(
  draftId: string,
  text: string,
  usage?: { promptTokens?: number | null; completionTokens?: number | null }
) {
  const normalized = normalizeDraftResult(text);
  if (!normalized.ok) {
    await prisma.aiShadowDraft.update({
      where: { id: draftId },
      data: {
        status: "error",
        rawText: text,
        error: normalized.error || "Resposta inválida do modelo",
        promptTokens: usage?.promptTokens ?? undefined,
        completionTokens: usage?.completionTokens ?? undefined,
      },
    });
    return;
  }

  await prisma.aiShadowDraft.update({
    where: { id: draftId },
    data: {
      status: "generated",
      decision: normalized.draft.decision,
      messages: normalized.draft.messages,
      handoffReason: normalized.draft.handoffReason,
      confidence: normalized.draft.confidence,
      guardrailFlags: normalized.draft.guardrailFlags,
      rawText: text,
      error: null,
      promptTokens: usage?.promptTokens ?? undefined,
      completionTokens: usage?.completionTokens ?? undefined,
    },
  });
}

async function importBatchLine(job: any, line: any) {
  const customId = line.custom_id || line.key || line.metadata?.key || line.inlineResponse?.metadata?.key || line.inline_response?.metadata?.key;
  if (!customId) return null;
  const draft = await prisma.aiShadowDraft.findFirst({ where: { batchJobId: job.id, batchCustomId: customId } });
  if (!draft) return null;

  if (job.provider === "openai") {
    const body = line?.response?.body;
    if (line?.error || !body) {
      await prisma.aiShadowDraft.update({ where: { id: draft.id }, data: { status: "error", error: JSON.stringify(line.error || line) } });
      return draft.id;
    }
    const text = openAiText(body);
    await saveBatchTextDraft(draft.id, text, {
      promptTokens: body?.usage?.input_tokens,
      completionTokens: body?.usage?.output_tokens,
    });
    return draft.id;
  }

  if (job.provider === "gemini") {
    const response = line?.response || line?.inlineResponse?.response || line?.inline_response?.response;
    const error = line?.error || line?.inlineResponse?.error || line?.inline_response?.error;
    if (error || !response) {
      await prisma.aiShadowDraft.update({
        where: { id: draft.id },
        data: { status: "error", error: JSON.stringify(error || line) },
      });
      return draft.id;
    }
    const text = geminiText(response);
    await saveBatchTextDraft(draft.id, text, {
      promptTokens: geminiPromptTokens(response),
      completionTokens: geminiCompletionTokens(response),
    });
    return draft.id;
  }

  const result = line?.result;
  if (result?.type !== "succeeded") {
    await prisma.aiShadowDraft.update({
      where: { id: draft.id },
      data: { status: "error", error: JSON.stringify(result?.error || result || line) },
    });
    return draft.id;
  }
  const text = anthropicText(result.message);
  await saveBatchTextDraft(draft.id, text, {
    promptTokens: result.message?.usage?.input_tokens,
    completionTokens: result.message?.usage?.output_tokens,
  });
  return draft.id;
}

async function syncOpenAiJob(job: any) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada");
  const res = await fetch(`https://api.openai.com/v1/batches/${job.providerBatchId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const batch = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(batch?.error?.message || `OpenAI batch retrieve ${res.status}`);
  if (batch.status !== "completed") {
    await prisma.aiShadowBatchJob.update({ where: { id: job.id }, data: { status: batch.status || "submitted" } });
    return { jobId: job.id, status: batch.status, imported: 0 };
  }
  const contentRes = await fetch(`https://api.openai.com/v1/files/${batch.output_file_id}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const content = await contentRes.text();
  if (!contentRes.ok) throw new Error(content || `OpenAI file content ${contentRes.status}`);
  const importedDraftIds = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    const imported = await importBatchLine(job, JSON.parse(line));
    if (imported) importedDraftIds.push(imported);
  }
  await updateRunStatusForDrafts(importedDraftIds);
  await prisma.aiShadowBatchJob.update({
    where: { id: job.id },
    data: { status: "completed", outputFileId: batch.output_file_id || null },
  });
  return { jobId: job.id, status: "completed", imported: importedDraftIds.length };
}

async function syncAnthropicJob(job: any) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nao configurada");
  const headers = { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${job.providerBatchId}`, { headers });
  const batch = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(batch?.error?.message || `Anthropic batch retrieve ${res.status}`);
  if (batch.processing_status !== "ended") {
    await prisma.aiShadowBatchJob.update({ where: { id: job.id }, data: { status: batch.processing_status || "submitted" } });
    return { jobId: job.id, status: batch.processing_status, imported: 0 };
  }
  const contentRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${job.providerBatchId}/results`, { headers });
  const content = await contentRes.text();
  if (!contentRes.ok) throw new Error(content || `Anthropic batch results ${contentRes.status}`);
  const importedDraftIds = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    const imported = await importBatchLine(job, JSON.parse(line));
    if (imported) importedDraftIds.push(imported);
  }
  await updateRunStatusForDrafts(importedDraftIds);
  await prisma.aiShadowBatchJob.update({ where: { id: job.id }, data: { status: "completed" } });
  return { jobId: job.id, status: "completed", imported: importedDraftIds.length };
}

function geminiBatchState(batch: any) {
  return batch?.metadata?.state || batch?.state || (batch?.done === false ? "JOB_STATE_RUNNING" : null);
}

function geminiBatchSucceeded(state?: string | null) {
  return state === "JOB_STATE_SUCCEEDED" || state === "BATCH_STATE_SUCCEEDED";
}

function geminiBatchFailed(state?: string | null) {
  return ["JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED", "BATCH_STATE_FAILED", "BATCH_STATE_CANCELLED", "BATCH_STATE_EXPIRED"].includes(state || "");
}

function findGeminiValue(batch: any, keys: string[], predicate: (value: any) => boolean): any {
  const seen = new Set<any>();
  const stack = [batch];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    for (const key of keys) {
      if (predicate(current[key])) return current[key];
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return null;
}

function geminiInlineResponses(batch: any) {
  return findGeminiValue(batch, ["inlinedResponses", "inlined_responses"], Array.isArray) || [];
}

function geminiResponsesFile(batch: any) {
  return findGeminiValue(
    batch,
    ["responsesFile", "responses_file", "fileName", "file_name"],
    (value) => typeof value === "string" && value.length > 0
  );
}

function geminiBatchDebugShape(batch: any) {
  return JSON.stringify({
    topKeys: Object.keys(batch || {}),
    state: geminiBatchState(batch),
    responseKeys: Object.keys(batch?.response || {}),
    responseDestKeys: Object.keys(batch?.response?.dest || {}),
    responseBatchKeys: Object.keys(batch?.response?.batch || {}),
    responseBatchDestKeys: Object.keys(batch?.response?.batch?.dest || {}),
    destKeys: Object.keys(batch?.dest || {}),
    hasInlineResponses: geminiInlineResponses(batch).length,
    responsesFile: geminiResponsesFile(batch),
  });
}

function metadataCustomIds(job: any) {
  const customIds = job?.metadata?.customIds;
  return Array.isArray(customIds) ? customIds.filter((item): item is string => typeof item === "string") : [];
}

function normalizeGeminiFileName(fileName: string) {
  return fileName
    .replace(/^https:\/\/generativelanguage\.googleapis\.com\/(?:download\/)?v1beta\//, "")
    .replace(/^\/+/, "");
}

async function downloadGeminiBatchFile(fileName: string, apiKey: string) {
  const normalizedFileName = normalizeGeminiFileName(fileName);
  const urls = [
    `https://generativelanguage.googleapis.com/download/v1beta/${normalizedFileName}:download?alt=media`,
    `https://generativelanguage.googleapis.com/v1beta/${normalizedFileName}:download?alt=media`,
    `https://generativelanguage.googleapis.com/v1beta/${normalizedFileName}?alt=media`,
  ];

  const errors = [];
  for (const url of urls) {
    const res = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
    const content = await res.text();
    if (res.ok) return content;
    errors.push(`${res.status}: ${content.slice(0, 240)}`);
  }

  throw new Error(`Gemini batch download falhou para ${normalizedFileName}: ${errors.join(" | ")}`);
}

async function syncGeminiJob(job: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY nao configurada");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${job.providerBatchId}`, {
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });
  const batch = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(batch?.error?.message || `Gemini batch retrieve ${res.status}`);

  const state = geminiBatchState(batch);
  if (!geminiBatchSucceeded(state)) {
    const failed = geminiBatchFailed(state);
    await prisma.aiShadowBatchJob.update({
      where: { id: job.id },
      data: {
        status: failed ? "failed" : state || "submitted",
        error: failed ? JSON.stringify(batch?.error || batch) : null,
      },
    });
    return { jobId: job.id, status: state || "submitted", imported: 0 };
  }

  const importedDraftIds = [];
  const inlineResponses = geminiInlineResponses(batch);
  if (inlineResponses.length > 0) {
    const customIds = metadataCustomIds(job);
    for (let index = 0; index < inlineResponses.length; index += 1) {
      const line = inlineResponses[index] || {};
      const hasKey = line.key || line.metadata?.key || line.inlineResponse?.metadata?.key || line.inline_response?.metadata?.key;
      const lineWithKey = hasKey
        ? line
        : { ...line, metadata: { ...(line.metadata || {}), key: customIds[index] } };
      const imported = await importBatchLine(job, lineWithKey);
      if (imported) importedDraftIds.push(imported);
    }
  } else {
    const responsesFile = geminiResponsesFile(batch);
    if (!responsesFile) throw new Error(`${GEMINI_MISSING_OUTPUT_ERROR} Shape: ${geminiBatchDebugShape(batch)}`);
    const content = await downloadGeminiBatchFile(String(responsesFile), apiKey);
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      const imported = await importBatchLine(job, JSON.parse(line));
      if (imported) importedDraftIds.push(imported);
    }
  }

  await updateRunStatusForDrafts(importedDraftIds);
  await prisma.aiShadowBatchJob.update({ where: { id: job.id }, data: { status: "completed" } });
  return { jobId: job.id, status: "completed", imported: importedDraftIds.length };
}

export async function syncRetroactiveAiShadowBatches(limit = 5) {
  const jobs = await prisma.aiShadowBatchJob.findMany({
    where: {
      sourceMode: "retroactive",
      providerBatchId: { not: null },
      OR: [
        { status: { notIn: ["completed", "failed", "canceled", "cancelled"] } },
        { provider: "gemini", status: "failed", error: { contains: GEMINI_MISSING_OUTPUT_ERROR } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 10)),
  });

  const results = [];
  for (const job of jobs) {
    try {
      const result = job.provider === "openai"
        ? await syncOpenAiJob(job)
        : job.provider === "gemini"
          ? await syncGeminiJob(job)
          : await syncAnthropicJob(job);
      results.push(result);
    } catch (error: any) {
      await prisma.aiShadowBatchJob.update({
        where: { id: job.id },
        data: { status: "failed", error: error?.message || String(error) },
      });
      results.push({ jobId: job.id, status: "failed", imported: 0, error: error?.message || String(error) });
    }
  }

  return { scanned: jobs.length, results };
}
