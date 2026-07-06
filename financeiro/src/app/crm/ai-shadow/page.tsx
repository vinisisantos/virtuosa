"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/auth-guard";
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, Loader2, MessageCircle, RefreshCw, Save, ShieldCheck, SlidersHorizontal, UserCheck, WandSparkles, XCircle } from "lucide-react";

type ShadowSetting = {
  id: string;
  unit: string;
  enabled: boolean;
  allowedInstanceIds?: string[];
  modelA: string;
  modelB: string;
  onlyAfterHours: boolean;
  weekdayStart: string;
  weekdayEnd: string;
  weekendEnabled: boolean;
  maxRunsPerDay: number;
};

type InstanceOption = {
  id: string;
  name: string;
  phoneNumber?: string | null;
  unit?: string | null;
  status: string;
  user?: { id: string; name: string; email: string } | null;
};

type ShadowDraft = {
  id: string;
  blindLabel: "A" | "B" | null;
  status: string;
  decision?: string | null;
  messages?: string[] | null;
  handoffReason?: string | null;
  confidence?: number | null;
  guardrailFlags?: string[] | null;
  error?: string | null;
  latencyMs?: number | null;
};

type ShadowRun = {
  id: string;
  status: string;
  error?: string | null;
  unit: string;
  conversationId?: string;
  incomingMessageId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  sourceMode?: "live" | "retroactive" | string | null;
  outcome?: "converted" | "not_converted" | string | null;
  campaignName?: string | null;
  conversationPhase?: "pre_handoff" | "human_attendance" | string | null;
  createdAt: string;
  processedAt?: string | null;
  humanReply?: {
    body: string;
    type: string;
    timestamp: string;
    respondedByName?: string | null;
  } | null;
  context: {
    conversation?: {
      contactName?: string | null;
      contactPhone?: string | null;
      instanceName?: string | null;
      assignedToName?: string | null;
      phase?: string | null;
    } | null;
    messages?: Array<{ role: string; body: string; timestamp: string; type: string }>;
  };
  drafts: ShadowDraft[];
  review?: { selectedOption: string; humanScore?: number | null } | null;
};

type ConversationMessage = {
  id: string;
  body: string;
  type: string;
  mediaUrl?: string | null;
  fromMe: boolean;
  timestamp: string;
  respondedByName?: string | null;
  transcripts?: Array<{
    status: string;
    transcript?: string | null;
    provider?: string | null;
    model?: string | null;
    error?: string | null;
  }>;
};

type ShadowConversation = {
  id: string;
  status: string;
  assignedToName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  instanceName?: string | null;
  instancePhone?: string | null;
  unit?: string | null;
  campaignName?: string | null;
  outcome?: string | null;
  sourceMode?: string | null;
  pendingCount: number;
  failedCount?: number;
  reviewedCount: number;
  totalEvaluations: number;
  createdAt: string;
  lastMessageAt?: string | null;
  messages: ConversationMessage[];
  runs: ShadowRun[];
};

type RetroactiveEstimate = {
  selectedConversations: number;
  selectedLeadMessages: number;
  candidateConversations: number;
  byOutcome: Record<string, number>;
  byCampaign: Record<string, number>;
  costs: {
    totalUsd: number;
    totalBrl: number;
    byModel: Array<{
      modelKey: string;
      provider: string;
      model: string;
      requestCount: number;
      estimatedInputTokens: number;
      estimatedOutputTokens: number;
      estimatedCostUsd: number | null;
      estimatedCostBrl: number | null;
    }>;
  };
};

type UnitKnowledge = {
  id?: string;
  unit: string;
  address?: string | null;
  hours?: string | null;
  generalRules?: string | null;
};

type KnowledgeProcedure = {
  id: string;
  unit: string;
  name: string;
  aliases?: string[] | null;
  howItWorks: string;
  indications?: string | null;
  whatToSay?: string | null;
  whatNotToSay?: string | null;
  priceRange?: string | null;
};

type KnowledgeSuggestion = {
  id: string;
  title: string;
  procedureName?: string | null;
  excerpt?: string | null;
  sourceType: string;
  suggestedContent?: {
    name?: string;
    howItWorks?: string;
    indications?: string;
    whatToSay?: string;
    whatNotToSay?: string;
    priceRange?: string;
  } | null;
};

type ProcedureDraft = {
  id?: string;
  name: string;
  aliasesText: string;
  howItWorks: string;
  indications: string;
  whatToSay: string;
  whatNotToSay: string;
  priceRange: string;
  suggestionId?: string | null;
};

type ReviewDraft = {
  selectedOption: "A" | "B" | "any" | "none";
  humanScore: number;
  severeErrorA: boolean;
  severeErrorB: boolean;
  severeErrorNotes: string;
  handoffAssessment: string;
};

const EMPTY_PROCEDURE: ProcedureDraft = {
  name: "",
  aliasesText: "",
  howItWorks: "",
  indications: "",
  whatToSay: "",
  whatNotToSay: "",
  priceRange: "",
  suggestionId: null,
};

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function normalizeAllowedIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getPhaseLabel(phase?: string | null) {
  return phase === "human_attendance" ? "Durante atendimento humano" : "Antes do handoff";
}

function getOutcomeLabel(outcome?: string | null) {
  if (outcome === "converted") return "Converteu";
  if (outcome === "not_converted") return "Não converteu";
  return "Sem desfecho";
}

function money(value?: number | null, currency: "USD" | "BRL" = "USD") {
  if (value == null) return "sem preço";
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 4 : 2,
  }).format(value);
}

export default function AiShadowPage() {
  return (
    <AuthGuard requiredPermission="crmSilentAnalysis">
      <AiShadowContent />
    </AuthGuard>
  );
}

function AiShadowContent() {
  const [settings, setSettings] = useState<ShadowSetting[]>([]);
  const [instances, setInstances] = useState<InstanceOption[]>([]);
  const [conversations, setConversations] = useState<ShadowConversation[]>([]);
  const [unitKnowledge, setUnitKnowledge] = useState<UnitKnowledge>({ unit: "Osasco" });
  const [procedures, setProcedures] = useState<KnowledgeProcedure[]>([]);
  const [suggestions, setSuggestions] = useState<KnowledgeSuggestion[]>([]);
  const [procedureDraft, setProcedureDraft] = useState<ProcedureDraft>(EMPTY_PROCEDURE);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [reprocessingRunId, setReprocessingRunId] = useState<string | null>(null);
  const [estimatingRetroactive, setEstimatingRetroactive] = useState(false);
  const [submittingRetroactive, setSubmittingRetroactive] = useState(false);
  const [syncingRetroactive, setSyncingRetroactive] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [transcribingAudio, setTranscribingAudio] = useState(false);
  const [miningKnowledge, setMiningKnowledge] = useState(false);
  const [retroactiveEstimate, setRetroactiveEstimate] = useState<RetroactiveEstimate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setting = useMemo(() => settings.find((item) => item.unit === "Osasco"), [settings]);

  const loadAll = useCallback(async (preferred?: { conversationId?: string | null; runId?: string | null }) => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, conversationsRes, knowledgeRes] = await Promise.all([
        fetch("/api/crm/ai-shadow/settings"),
        fetch("/api/crm/ai-shadow/conversations?unit=Osasco&limit=30"),
        fetch("/api/crm/ai-shadow/knowledge?unit=Osasco"),
      ]);
      const settingsData = await settingsRes.json();
      const conversationsData = await conversationsRes.json();
      const knowledgeData = await knowledgeRes.json();
      if (!settingsRes.ok) throw new Error(settingsData.error || "Falha ao carregar configuração.");
      if (!conversationsRes.ok) throw new Error(conversationsData.error || "Falha ao carregar avaliações.");
      if (!knowledgeRes.ok) throw new Error(knowledgeData.error || "Falha ao carregar base IA.");
      const nextConversations: ShadowConversation[] = conversationsData.conversations || [];
      setSettings(settingsData.settings || []);
      setInstances(settingsData.instances || []);
      setConversations(nextConversations);
      setSummary(conversationsData.summary || null);
      setUnitKnowledge(knowledgeData.unitKnowledge || { unit: "Osasco" });
      setProcedures(knowledgeData.procedures || []);
      setSuggestions(knowledgeData.suggestions || []);

      const preferredConversationId = preferred?.conversationId;
      const nextConversation =
        nextConversations.find((conversation) => conversation.id === preferredConversationId) ||
        nextConversations[0] ||
        null;
      setActiveConversationId(nextConversation?.id || null);

      const pendingRuns = nextConversation?.runs.filter((run) => run.status === "ready") || [];
      const failedRuns = nextConversation?.runs.filter((run) => run.status === "failed") || [];
      const preferredRunId = preferred?.runId;
      const nextRun =
        nextConversation?.runs.find((run) => run.id === preferredRunId) ||
        pendingRuns[0] ||
        failedRuns[0] ||
        null;
      setActiveRunId(nextRun?.id || null);
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar teste IA.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function saveSetting(patch: Partial<ShadowSetting>) {
    if (!setting) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...setting, ...patch, unit: "Osasco" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setNotice("Configuração do piloto salva.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function processPending() {
    setProcessing(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao processar.");
      setNotice(`${data.processed} rodada(s) processada(s) de ${data.scanned} pendente(s).`);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Falha ao processar pendentes.");
    } finally {
      setProcessing(false);
    }
  }

  async function reprocessRun(runId: string, conversationId: string) {
    setReprocessingRunId(runId);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details || data.error || "Falha ao reprocessar.");
      setNotice(data.failed ? "Comparativo reprocessado, mas ainda falhou. Veja o erro no painel." : "Comparativo reprocessado e pronto para avaliação.");
      await loadAll({ conversationId, runId });
    } catch (err: any) {
      setError(err?.message || "Falha ao reprocessar comparativo.");
    } finally {
      setReprocessingRunId(null);
    }
  }

  async function saveUnitKnowledge() {
    setSavingKnowledge(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_unit",
          unit: "Osasco",
          address: unitKnowledge.address || "",
          hours: unitKnowledge.hours || "",
          generalRules: unitKnowledge.generalRules || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details || data.error || "Falha ao salvar base.");
      setNotice("Base da unidade salva.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Falha ao salvar base da unidade.");
    } finally {
      setSavingKnowledge(false);
    }
  }

  async function saveProcedure() {
    setSavingKnowledge(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_procedure",
          unit: "Osasco",
          id: procedureDraft.id,
          suggestionId: procedureDraft.suggestionId,
          name: procedureDraft.name,
          aliases: procedureDraft.aliasesText.split(",").map((item) => item.trim()).filter(Boolean),
          howItWorks: procedureDraft.howItWorks,
          indications: procedureDraft.indications,
          whatToSay: procedureDraft.whatToSay,
          whatNotToSay: procedureDraft.whatNotToSay,
          priceRange: procedureDraft.priceRange,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details || data.error || "Falha ao salvar procedimento.");
      setProcedureDraft(EMPTY_PROCEDURE);
      setNotice("Procedimento salvo na base aprovada.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Falha ao salvar procedimento.");
    } finally {
      setSavingKnowledge(false);
    }
  }

  async function rejectSuggestion(suggestionId: string) {
    setSavingKnowledge(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject_suggestion", unit: "Osasco", suggestionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details || data.error || "Falha ao rejeitar sugestão.");
      setNotice("Sugestão rejeitada.");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Falha ao rejeitar sugestão.");
    } finally {
      setSavingKnowledge(false);
    }
  }

  async function transcribeAudios() {
    setTranscribingAudio(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: "Osasco", limit: 8 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details || data.error || "Falha ao transcrever.");
      setNotice(`${data.completed || 0} áudio(s) transcrito(s), ${data.failed || 0} falha(s).`);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Falha ao transcrever áudios.");
    } finally {
      setTranscribingAudio(false);
    }
  }

  async function mineKnowledge() {
    setMiningKnowledge(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/knowledge/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: "Osasco", limit: 20 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details || data.error || "Falha ao minerar.");
      setNotice(`${data.created || 0} sugestão(ões) criada(s) para revisão.`);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Falha ao minerar sugestões.");
    } finally {
      setMiningKnowledge(false);
    }
  }

  async function estimateRetroactive() {
    setEstimatingRetroactive(true);
    setRetroactiveEstimate(null);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/retroactive/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: "Osasco", sampleSize: 180, instanceIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Falha ao estimar retroativo.");
      setRetroactiveEstimate(data);
      setNotice("Prévia retroativa calculada. Revise o custo antes de submeter o lote.");
    } catch (err: any) {
      setError(err?.message || "Falha ao estimar retroativo.");
    } finally {
      setEstimatingRetroactive(false);
    }
  }

  async function submitRetroactive() {
    if (!retroactiveEstimate) return;
    setSubmittingRetroactive(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/retroactive/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit: "Osasco",
          sampleSize: 180,
          instanceIds: selectedIds,
          confirmedEstimatedCostUsd: retroactiveEstimate.costs.totalUsd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Falha ao submeter lote.");
      setNotice(`${data.submittedJobs?.length || 0} lote(s) batch submetido(s). Use sincronizar quando os provedores terminarem.`);
      setRetroactiveEstimate(null);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Falha ao submeter lote retroativo.");
    } finally {
      setSubmittingRetroactive(false);
    }
  }

  async function syncRetroactive() {
    setSyncingRetroactive(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/crm/ai-shadow/retroactive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Falha ao sincronizar lotes.");
      const imported = (data.results || []).reduce((sum: number, item: any) => sum + (item.imported || 0), 0);
      setNotice(`${data.scanned || 0} lote(s) verificado(s), ${imported} resposta(s) importada(s).`);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Falha ao sincronizar lotes.");
    } finally {
      setSyncingRetroactive(false);
    }
  }

  const selectedIds = normalizeAllowedIds(setting?.allowedInstanceIds);
  const counts = Object.fromEntries((summary?.counts || []).map((item: any) => [item.status, item.count]));
  const phaseCounts = Object.fromEntries((summary?.phaseCounts || []).map((item: any) => [item.phase, item.count]));

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Modo sombra cego
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Teste IA WhatsApp</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Gera respostas fantasma para leads de Osasco na instância selecionada, inclusive durante atendimento humano, sem enviar nada ao cliente.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => loadAll()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={processPending}
              disabled={processing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
              Processar pendentes
            </button>
          </div>
        </header>

        {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-400">{notice}</div>}
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">{error}</div>}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              <h2 className="text-base font-bold">Configuração do piloto</h2>
            </div>
            {loading && !setting ? (
              <div className="flex h-28 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando
              </div>
            ) : setting ? (
              <div className="grid gap-4">
                <label className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-3">
                  <span>
                    <span className="block text-sm font-bold">Piloto ativo</span>
                    <span className="text-xs text-muted-foreground">Somente Osasco e instâncias selecionadas.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={setting.enabled}
                    onChange={(event) => saveSetting({ enabled: event.target.checked })}
                    disabled={saving}
                    className="h-5 w-5 accent-primary"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Modelo A
                    <input
                      defaultValue={setting.modelA}
                      onBlur={(event) => event.target.value !== setting.modelA && saveSetting({ modelA: event.target.value })}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Modelo B
                    <input
                      defaultValue={setting.modelB}
                      onBlur={(event) => event.target.value !== setting.modelB && saveSetting({ modelB: event.target.value })}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  <label className="flex items-end gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={setting.onlyAfterHours}
                      onChange={(event) => saveSetting({ onlyAfterHours: event.target.checked })}
                      className="mb-3 h-5 w-5 accent-primary"
                    />
                    <span className="mb-3">Somente fora do horário</span>
                  </label>
                  <label className="text-sm font-semibold">
                    Início
                    <input
                      type="time"
                      value={setting.weekdayStart}
                      onChange={(event) => saveSetting({ weekdayStart: event.target.value })}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Fim
                    <input
                      type="time"
                      value={setting.weekdayEnd}
                      onChange={(event) => saveSetting({ weekdayEnd: event.target.value })}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Limite/dia
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={setting.maxRunsPerDay}
                      onChange={(event) => saveSetting({ maxRunsPerDay: Number(event.target.value) })}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <label className="flex items-end gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={setting.weekendEnabled}
                      onChange={(event) => saveSetting({ weekendEnabled: event.target.checked })}
                      className="mb-3 h-5 w-5 accent-primary"
                    />
                    <span className="mb-3">Fins de semana</span>
                  </label>
                </div>

                <div>
                  <div className="mb-2 text-sm font-bold">WhatsApp da Thais / leads Osasco</div>
                  <div className="grid gap-2">
                    {instances.map((instance) => {
                      const checked = selectedIds.includes(instance.id);
                      return (
                        <label key={instance.id} className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-3">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{instance.user?.name || "Sem titular"} · {instance.phoneNumber || instance.name}</span>
                            <span className="text-xs text-muted-foreground">{instance.status} · {instance.unit}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...selectedIds, instance.id]
                                : selectedIds.filter((id) => id !== instance.id);
                              saveSetting({ allowedInstanceIds: next });
                            }}
                            disabled={saving}
                            className="h-5 w-5 accent-primary"
                          />
                        </label>
                      );
                    })}
                    {instances.length === 0 && <div className="rounded-lg border border-border bg-background/60 p-3 text-sm text-muted-foreground">Nenhuma instância comercial de Osasco encontrada.</div>}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Metric label="Pendentes" value={counts.pending || 0} />
            <Metric label="Prontas para avaliar" value={counts.ready || 0} />
            <Metric label="Antes do handoff" value={phaseCounts.pre_handoff || 0} />
            <Metric label="Durante atendimento" value={phaseCounts.human_attendance || 0} />
            <Metric label="Avaliadas" value={summary?.reviewed || 0} />
            <Metric label="Erros graves marcados" value={summary?.severeErrors || 0} />
          </div>
        </section>

        <KnowledgeBaseSection
          unitKnowledge={unitKnowledge}
          procedures={procedures}
          suggestions={suggestions}
          procedureDraft={procedureDraft}
          saving={savingKnowledge}
          transcribing={transcribingAudio}
          mining={miningKnowledge}
          onUnitKnowledgeChange={setUnitKnowledge}
          onProcedureDraftChange={setProcedureDraft}
          onSaveUnit={saveUnitKnowledge}
          onSaveProcedure={saveProcedure}
          onRejectSuggestion={rejectSuggestion}
          onTranscribeAudios={transcribeAudios}
          onMineKnowledge={mineKnowledge}
        />

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-base font-bold">Modo retroativo</div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Monta uma amostra histórica de Osasco na instância selecionada, estima custo batch e só submete após revisão.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={estimateRetroactive}
                disabled={estimatingRetroactive || selectedIds.length === 0}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
              >
                {estimatingRetroactive ? <Loader2 className="h-4 w-4 animate-spin" /> : <SlidersHorizontal className="h-4 w-4" />}
                Estimar lote
              </button>
              <button
                type="button"
                onClick={submitRetroactive}
                disabled={submittingRetroactive || !retroactiveEstimate}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {submittingRetroactive ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                Submeter batch
              </button>
              <button
                type="button"
                onClick={syncRetroactive}
                disabled={syncingRetroactive}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
              >
                {syncingRetroactive ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sincronizar batches
              </button>
            </div>
          </div>

          {retroactiveEstimate ? (
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-lg border border-border bg-background/60 p-3">
                <div className="text-sm font-bold">Amostra selecionada</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-card/80 p-3">
                    <div className="text-xs text-muted-foreground">Conversas</div>
                    <div className="text-xl font-bold">{retroactiveEstimate.selectedConversations}</div>
                  </div>
                  <div className="rounded-lg bg-card/80 p-3">
                    <div className="text-xs text-muted-foreground">Mensagens de lead</div>
                    <div className="text-xl font-bold">{retroactiveEstimate.selectedLeadMessages}</div>
                  </div>
                  <div className="rounded-lg bg-card/80 p-3">
                    <div className="text-xs text-muted-foreground">Converteu</div>
                    <div className="text-xl font-bold">{retroactiveEstimate.byOutcome.converted || 0}</div>
                  </div>
                  <div className="rounded-lg bg-card/80 p-3">
                    <div className="text-xs text-muted-foreground">Não converteu</div>
                    <div className="text-xl font-bold">{retroactiveEstimate.byOutcome.not_converted || 0}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Candidatas elegíveis: {retroactiveEstimate.candidateConversations}. Custo estimado total:{" "}
                  <span className="font-bold text-foreground">{money(retroactiveEstimate.costs.totalUsd, "USD")}</span>{" "}
                  ({money(retroactiveEstimate.costs.totalBrl, "BRL")} aprox.).
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/60 p-3">
                <div className="text-sm font-bold">Custo por modelo</div>
                <div className="mt-3 grid gap-2">
                  {retroactiveEstimate.costs.byModel.map((item) => (
                    <div key={`${item.modelKey}-${item.provider}-${item.model}`} className="rounded-lg border border-border bg-card/80 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">{item.modelKey} · {item.provider}:{item.model}</div>
                        <div className="text-sm font-bold">{money(item.estimatedCostUsd, "USD")}</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.requestCount} requests · {item.estimatedInputTokens.toLocaleString("pt-BR")} tokens entrada estimados · {item.estimatedOutputTokens.toLocaleString("pt-BR")} tokens saída estimados
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Campanhas na amostra: {Object.entries(retroactiveEstimate.byCampaign).slice(0, 6).map(([name, count]) => `${name} (${count})`).join(", ")}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
              Clique em “Estimar lote” para ver amostra, desfecho, campanhas e custo antes de qualquer submissão às APIs.
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Fila de avaliação cega</h2>
            <span className="text-sm text-muted-foreground">
              {conversations.reduce((sum, conversation) => sum + conversation.pendingCount, 0)} pendente(s)
            </span>
          </div>
          {conversations.length > 0 && (
            <ConversationReviewBoard
              conversations={conversations}
              activeConversationId={activeConversationId}
              activeRunId={activeRunId}
              onSelectConversation={(conversationId) => {
                const conversation = conversations.find((item) => item.id === conversationId);
                setActiveConversationId(conversationId);
                setActiveRunId(
                  conversation?.runs.find((run) => run.status === "ready")?.id ||
                  conversation?.runs.find((run) => run.status === "failed")?.id ||
                  conversation?.runs[0]?.id ||
                  null
                );
              }}
              onSelectRun={setActiveRunId}
              onReviewed={(conversationId, nextRunId) => loadAll({ conversationId, runId: nextRunId })}
              onReprocess={reprocessRun}
              reprocessingRunId={reprocessingRunId}
            />
          )}
          {!loading && conversations.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhuma resposta pronta para avaliação.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}

function KnowledgeBaseSection({
  unitKnowledge,
  procedures,
  suggestions,
  procedureDraft,
  saving,
  transcribing,
  mining,
  onUnitKnowledgeChange,
  onProcedureDraftChange,
  onSaveUnit,
  onSaveProcedure,
  onRejectSuggestion,
  onTranscribeAudios,
  onMineKnowledge,
}: {
  unitKnowledge: UnitKnowledge;
  procedures: KnowledgeProcedure[];
  suggestions: KnowledgeSuggestion[];
  procedureDraft: ProcedureDraft;
  saving: boolean;
  transcribing: boolean;
  mining: boolean;
  onUnitKnowledgeChange: (knowledge: UnitKnowledge) => void;
  onProcedureDraftChange: (draft: ProcedureDraft) => void;
  onSaveUnit: () => void;
  onSaveProcedure: () => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onTranscribeAudios: () => void;
  onMineKnowledge: () => void;
}) {
  function editProcedure(procedure: KnowledgeProcedure) {
    onProcedureDraftChange({
      id: procedure.id,
      name: procedure.name,
      aliasesText: Array.isArray(procedure.aliases) ? procedure.aliases.join(", ") : "",
      howItWorks: procedure.howItWorks || "",
      indications: procedure.indications || "",
      whatToSay: procedure.whatToSay || "",
      whatNotToSay: procedure.whatNotToSay || "",
      priceRange: procedure.priceRange || "",
      suggestionId: null,
    });
  }

  function useSuggestion(suggestion: KnowledgeSuggestion) {
    const content = suggestion.suggestedContent || {};
    onProcedureDraftChange({
      name: content.name || suggestion.procedureName || "",
      aliasesText: "",
      howItWorks: content.howItWorks || suggestion.excerpt || "",
      indications: content.indications || "",
      whatToSay: content.whatToSay || suggestion.excerpt || "",
      whatNotToSay: content.whatNotToSay || "Não prometer resultado, não confirmar agendamento e não orientar questões médicas sem avaliação.",
      priceRange: content.priceRange || "",
      suggestionId: suggestion.id,
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-base font-bold">Base de conhecimento IA</div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Conteúdo aprovado que entra no prompt. O modelo só deve explicar procedimentos cadastrados aqui.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onTranscribeAudios}
            disabled={transcribing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Transcrever áudios
          </button>
          <button
            type="button"
            onClick={onMineKnowledge}
            disabled={mining}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            {mining ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
            Minerar sugestões
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="mb-3 text-sm font-bold">Unidade Osasco</div>
            <div className="grid gap-3">
              <label className="text-sm font-semibold">
                Endereço aprovado
                <textarea
                  value={unitKnowledge.address || ""}
                  onChange={(event) => onUnitKnowledgeChange({ ...unitKnowledge, address: event.target.value })}
                  className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm font-semibold">
                Horários aprovados
                <textarea
                  value={unitKnowledge.hours || ""}
                  onChange={(event) => onUnitKnowledgeChange({ ...unitKnowledge, hours: event.target.value })}
                  className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm font-semibold">
                Regras gerais
                <textarea
                  value={unitKnowledge.generalRules || ""}
                  onChange={(event) => onUnitKnowledgeChange({ ...unitKnowledge, generalRules: event.target.value })}
                  className="mt-1 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <button
                type="button"
                onClick={onSaveUnit}
                disabled={saving}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar unidade
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-bold">Procedimentos aprovados</div>
              <div className="text-xs text-muted-foreground">{procedures.length}</div>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {procedures.map((procedure) => (
                <button
                  key={procedure.id}
                  type="button"
                  onClick={() => editProcedure(procedure)}
                  className="w-full rounded-lg border border-border bg-card/80 p-3 text-left hover:bg-muted"
                >
                  <div className="text-sm font-bold">{procedure.name}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{procedure.howItWorks}</div>
                </button>
              ))}
              {procedures.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Nenhum procedimento aprovado ainda.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-bold">{procedureDraft.id ? "Editar procedimento" : "Novo procedimento"}</div>
              {(procedureDraft.id || procedureDraft.suggestionId) && (
                <button
                  type="button"
                  onClick={() => onProcedureDraftChange(EMPTY_PROCEDURE)}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold">
                Nome
                <input
                  value={procedureDraft.name}
                  onChange={(event) => onProcedureDraftChange({ ...procedureDraft, name: event.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm font-semibold">
                Apelidos
                <input
                  value={procedureDraft.aliasesText}
                  onChange={(event) => onProcedureDraftChange({ ...procedureDraft, aliasesText: event.target.value })}
                  placeholder="separados por vírgula"
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm font-semibold md:col-span-2">
                Como funciona
                <textarea
                  value={procedureDraft.howItWorks}
                  onChange={(event) => onProcedureDraftChange({ ...procedureDraft, howItWorks: event.target.value })}
                  className="mt-1 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm font-semibold">
                Indicações
                <textarea
                  value={procedureDraft.indications}
                  onChange={(event) => onProcedureDraftChange({ ...procedureDraft, indications: event.target.value })}
                  className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm font-semibold">
                Faixa de preço aprovada
                <textarea
                  value={procedureDraft.priceRange}
                  onChange={(event) => onProcedureDraftChange({ ...procedureDraft, priceRange: event.target.value })}
                  className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm font-semibold">
                O que dizer
                <textarea
                  value={procedureDraft.whatToSay}
                  onChange={(event) => onProcedureDraftChange({ ...procedureDraft, whatToSay: event.target.value })}
                  className="mt-1 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="text-sm font-semibold">
                O que não dizer
                <textarea
                  value={procedureDraft.whatNotToSay}
                  onChange={(event) => onProcedureDraftChange({ ...procedureDraft, whatNotToSay: event.target.value })}
                  className="mt-1 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={onSaveProcedure}
              disabled={saving || !procedureDraft.name.trim() || !procedureDraft.howItWorks.trim()}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar procedimento aprovado
            </button>
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-bold">Sugestões pendentes</div>
              <div className="text-xs text-muted-foreground">{suggestions.length}</div>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {suggestions.map((suggestion) => (
                <div key={suggestion.id} className="rounded-lg border border-border bg-card/80 p-3">
                  <div className="text-sm font-bold">{suggestion.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{suggestion.sourceType === "audio_transcript" ? "Áudio transcrito" : "Mensagem da consultora"}</div>
                  <div className="mt-2 line-clamp-4 text-sm text-muted-foreground">{suggestion.excerpt}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => useSuggestion(suggestion)}
                      className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
                    >
                      Usar como rascunho
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectSuggestion(suggestion.id)}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                    >
                      Rejeitar
                    </button>
                  </div>
                </div>
              ))}
              {suggestions.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Nenhuma sugestão pendente. Use “Minerar sugestões” após transcrever áudios ou quando houver mensagens humanas explicativas.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function sortRunsByMessage(conversation: ShadowConversation) {
  const messageIndex = new Map(conversation.messages.map((message, index) => [message.id, index]));
  return [...conversation.runs].sort((a, b) => {
    const aIndex = messageIndex.get(a.incomingMessageId || "") ?? Number.MAX_SAFE_INTEGER;
    const bIndex = messageIndex.get(b.incomingMessageId || "") ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function ConversationReviewBoard({
  conversations,
  activeConversationId,
  activeRunId,
  onSelectConversation,
  onSelectRun,
  onReviewed,
  onReprocess,
  reprocessingRunId,
}: {
  conversations: ShadowConversation[];
  activeConversationId: string | null;
  activeRunId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onSelectRun: (runId: string | null) => void;
  onReviewed: (conversationId: string, nextRunId: string | null) => void;
  onReprocess: (runId: string, conversationId: string) => void;
  reprocessingRunId: string | null;
}) {
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || conversations[0];
  const activeConversationIndex = conversations.findIndex((conversation) => conversation.id === activeConversation?.id);
  const orderedRuns = activeConversation ? sortRunsByMessage(activeConversation) : [];
  const activeRun =
    orderedRuns.find((run) => run.id === activeRunId) ||
    orderedRuns.find((run) => run.status === "ready") ||
    orderedRuns.find((run) => run.status === "failed") ||
    orderedRuns[0] ||
    null;
  const runsByMessageId = new Map(orderedRuns.filter((run) => run.incomingMessageId).map((run) => [run.incomingMessageId!, run]));
  const reviewedCount = activeConversation?.reviewedCount || 0;
  const totalEvaluations = activeConversation?.totalEvaluations || 0;

  function moveConversation(direction: -1 | 1) {
    if (!activeConversation) return;
    const nextIndex = Math.max(0, Math.min(conversations.length - 1, activeConversationIndex + direction));
    const next = conversations[nextIndex];
    if (next) onSelectConversation(next.id);
  }

  if (!activeConversation) return null;

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <aside className="rounded-xl border border-border bg-card p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-bold">Conversas</div>
          <div className="text-xs text-muted-foreground">{conversations.length}</div>
        </div>
        <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
          {conversations.map((conversation) => {
            const active = conversation.id === activeConversation.id;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelectConversation(conversation.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  active ? "border-primary bg-primary/10" : "border-border bg-background/60 hover:bg-muted"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{conversation.contactName || conversation.contactPhone || "Lead"}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{conversation.campaignName || "Sem campanha"}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    (conversation.failedCount || 0) > 0
                      ? "bg-red-500/15 text-red-300"
                      : conversation.pendingCount > 0
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-emerald-500/15 text-emerald-300"
                  }`}>
                    {(conversation.failedCount || 0) > 0 ? `${conversation.failedCount} falha` : conversation.pendingCount}
                  </span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {conversation.reviewedCount} de {conversation.totalEvaluations} avaliadas
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <article className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-bold">{activeConversation.contactName || activeConversation.contactPhone || "Lead"}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {reviewedCount} de {totalEvaluations} avaliadas
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {activeConversation.instanceName || "WhatsApp"}
              {activeConversation.campaignName ? ` · ${activeConversation.campaignName}` : ""}
              {activeConversation.assignedToName ? ` · ${activeConversation.assignedToName}` : ""}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ConversationPill label="Cego: A/B" tone="primary" icon={<Bot className="h-3.5 w-3.5" />} />
            {activeConversation.sourceMode === "retroactive" && <ConversationPill label="Retroativa" tone="amber" />}
            {activeConversation.outcome && <ConversationPill label={getOutcomeLabel(activeConversation.outcome)} tone={activeConversation.outcome === "converted" ? "emerald" : "red"} />}
            <button
              type="button"
              onClick={() => moveConversation(-1)}
              disabled={activeConversationIndex <= 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
              title="Conversa anterior"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => moveConversation(1)}
              disabled={activeConversationIndex >= conversations.length - 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
              title="Próxima conversa"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_480px]">
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-bold">Histórico completo</div>
              <div className="text-xs text-muted-foreground">
                {activeConversation.pendingCount} pendente(s)
                {(activeConversation.failedCount || 0) > 0 ? ` · ${activeConversation.failedCount} falha(s)` : ""}
              </div>
            </div>
            <div className="max-h-[680px] space-y-3 overflow-y-auto pr-1">
              {activeConversation.messages.map((message) => {
                const run = runsByMessageId.get(message.id);
                const selected = activeRun?.id === run?.id;
                const reviewed = run?.status === "reviewed";
                const failed = run?.status === "failed";
                const clickable = !!run;
                const transcript = message.transcripts?.find((item) => item.status === "completed" && item.transcript?.trim());
                return (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => clickable && onSelectRun(run.id)}
                    disabled={!clickable}
                    className={`block w-full text-left ${message.fromMe ? "pl-10" : "pr-10"} ${clickable ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <div className={`rounded-lg border p-3 transition-colors ${
                      selected
                        ? "border-primary bg-primary/10"
                        : reviewed
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : failed
                            ? "border-red-500/40 bg-red-500/10 hover:border-red-400"
                            : run
                            ? "border-amber-500/40 bg-amber-500/10 hover:border-primary/70"
                            : "border-border bg-card/80"
                    } ${message.fromMe ? "ml-auto max-w-[82%]" : "mr-auto max-w-[82%]"}`}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          {message.fromMe ? message.respondedByName || "Clínica" : "Lead"}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          {run && (reviewed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : failed ? <XCircle className="h-3.5 w-3.5 text-red-300" /> : <MessageCircle className="h-3.5 w-3.5 text-amber-300" />)}
                          {new Date(message.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm">{message.body || `[${message.type}]`}</div>
                      {transcript?.transcript && (
                        <div className="mt-2 rounded-md border border-primary/20 bg-primary/10 p-2 text-xs text-primary">
                          Transcrição: {transcript.transcript}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <EvaluationPanel
            conversation={activeConversation}
            run={activeRun}
            incomingMessage={activeRun?.incomingMessageId ? activeConversation.messages.find((message) => message.id === activeRun.incomingMessageId) || null : null}
            orderedRuns={orderedRuns}
            onReviewed={onReviewed}
            onSelectRun={onSelectRun}
            onReprocess={onReprocess}
            reprocessingRunId={reprocessingRunId}
          />
        </div>
      </article>
    </div>
  );
}

function ConversationPill({ label, tone, icon }: { label: string; tone: "primary" | "amber" | "emerald" | "red"; icon?: React.ReactNode }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    amber: "bg-amber-500/10 text-amber-300",
    emerald: "bg-emerald-500/10 text-emerald-300",
    red: "bg-red-500/10 text-red-300",
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${tones[tone]}`}>
      {icon}
      {label}
    </span>
  );
}

function EvaluationPanel({
  conversation,
  run,
  incomingMessage,
  orderedRuns,
  onReviewed,
  onSelectRun,
  onReprocess,
  reprocessingRunId,
}: {
  conversation: ShadowConversation;
  run: ShadowRun | null;
  incomingMessage: ConversationMessage | null;
  orderedRuns: ShadowRun[];
  onReviewed: (conversationId: string, nextRunId: string | null) => void;
  onSelectRun: (runId: string | null) => void;
  onReprocess: (runId: string, conversationId: string) => void;
  reprocessingRunId: string | null;
}) {
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<ReviewDraft>({
    selectedOption: "A",
    humanScore: 4,
    severeErrorA: false,
    severeErrorB: false,
    severeErrorNotes: "",
    handoffAssessment: "ok",
  });

  useEffect(() => {
    setReview({
      selectedOption: "A",
      humanScore: 4,
      severeErrorA: false,
      severeErrorB: false,
      severeErrorNotes: "",
      handoffAssessment: "ok",
    });
  }, [run?.id]);

  if (!run) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-sm text-muted-foreground">
        Selecione uma mensagem marcada no histórico para avaliar A/B dentro do contexto completo da conversa.
      </div>
    );
  }

  const currentRun = run;
  const drafts = [...currentRun.drafts].sort((a, b) => (a.blindLabel || "").localeCompare(b.blindLabel || ""));
  const draftA = drafts.find((draft) => draft.blindLabel === "A");
  const draftB = drafts.find((draft) => draft.blindLabel === "B");
  const phase = currentRun.conversationPhase || currentRun.context.conversation?.phase || "pre_handoff";
  const reprocessing = reprocessingRunId === currentRun.id;

  async function submitReview() {
    if (currentRun.status !== "ready") return;
    setSaving(true);
    try {
      const res = await fetch("/api/crm/ai-shadow/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: currentRun.id, ...review }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar avaliação.");
      const currentIndex = orderedRuns.findIndex((item) => item.id === currentRun.id);
      const nextRun =
        orderedRuns.slice(currentIndex + 1).find((item) => item.status === "ready") ||
        orderedRuns.find((item) => item.status === "ready" && item.id !== currentRun.id) ||
        null;
      onSelectRun(nextRun?.id || null);
      onReviewed(conversation.id, nextRun?.id || null);
    } catch (err: any) {
      alert(err?.message || "Falha ao salvar avaliação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="mb-3 flex flex-col gap-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-bold">Comparativo da mensagem</div>
          {run.status === "reviewed" && <ConversationPill label="Avaliada" tone="emerald" />}
          {run.status === "failed" && <ConversationPill label="Falhou" tone="red" />}
          {run.sourceMode === "retroactive" && <ConversationPill label="Retroativa" tone="amber" />}
          {run.outcome && <ConversationPill label={getOutcomeLabel(run.outcome)} tone={run.outcome === "converted" ? "emerald" : "red"} />}
          <ConversationPill label={getPhaseLabel(phase)} tone={phase === "human_attendance" ? "emerald" : "primary"} icon={<UserCheck className="h-3.5 w-3.5" />} />
        </div>
        {incomingMessage && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-primary">Mensagem do lead avaliada · {formatDate(incomingMessage.timestamp)}</div>
            <div className="whitespace-pre-wrap text-sm">{incomingMessage.body || `[${incomingMessage.type}]`}</div>
            {incomingMessage.transcripts?.find((item) => item.status === "completed" && item.transcript?.trim())?.transcript && (
              <div className="mt-2 rounded-md border border-primary/20 bg-background/60 p-2 text-xs text-primary">
                Transcrição: {incomingMessage.transcripts.find((item) => item.status === "completed" && item.transcript?.trim())?.transcript}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="max-h-[680px] space-y-3 overflow-y-auto pr-1">
        <div className="grid gap-3 lg:grid-cols-2">
          <DraftPanel label="A" draft={draftA} />
          <DraftPanel label="B" draft={draftB} />
        </div>
        {run.humanReply ? (
          <HumanReplyPanel reply={run.humanReply} />
        ) : (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-200">
            Nenhuma resposta humana real encontrada entre esta mensagem do lead e a próxima mensagem do lead.
          </div>
        )}

        {run.status === "ready" ? (
          <div className="grid gap-3 border-t border-border pt-3">
            <div className="flex flex-wrap gap-2">
              {(["A", "B", "any", "none"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReview((prev) => ({ ...prev, selectedOption: option }))}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    review.selectedOption === option ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {option === "any" ? "Qualquer uma" : option === "none" ? "Nenhuma" : `Enviaria ${option}`}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="font-semibold">
                Humanização
                <select
                  value={review.humanScore}
                  onChange={(event) => setReview((prev) => ({ ...prev, humanScore: Number(event.target.value) }))}
                  className="ml-2 h-9 rounded-lg border border-input bg-background px-2"
                >
                  {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
                </select>
              </label>
              <label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={review.severeErrorA} onChange={(event) => setReview((prev) => ({ ...prev, severeErrorA: event.target.checked }))} /> Erro A</label>
              <label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={review.severeErrorB} onChange={(event) => setReview((prev) => ({ ...prev, severeErrorB: event.target.checked }))} /> Erro B</label>
            </div>

            <button
              type="button"
              onClick={submitReview}
              disabled={saving}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar e ir para próxima
            </button>
          </div>
        ) : run.status === "failed" ? (
          <div className="grid gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            <div>
              <div className="font-semibold text-red-200">Comparativo fora da avaliação cega</div>
              <div className="mt-1 text-red-100/80">
                {run.error || "Um dos modelos falhou ou gerou resposta vazia. Reprocesse antes de avaliar para manter o A/B justo."}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onReprocess(run.id, conversation.id)}
              disabled={reprocessing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-60"
            >
              {reprocessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Reprocessar comparativo
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300">
            Esta mensagem já foi avaliada.
          </div>
        )}
      </div>
    </div>
  );
}

function HumanReplyPanel({ reply }: { reply: NonNullable<ShadowRun["humanReply"]> }) {
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-bold text-emerald-200">Resposta humana real</div>
        <span className="text-xs font-semibold text-emerald-300">{formatDate(reply.timestamp)}</span>
      </div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300/80">
        {reply.respondedByName || "Consultora"}
      </div>
      <div className="whitespace-pre-wrap rounded-lg bg-background/70 p-3 text-sm text-foreground">
        {reply.body || `[${reply.type}]`}
      </div>
    </div>
  );
}

function DraftPanel({ label, draft }: { label: "A" | "B"; draft?: ShadowDraft }) {
  const flags = Array.isArray(draft?.guardrailFlags) ? draft.guardrailFlags : [];
  const isGenerated = draft?.status === "generated";
  const isPending = draft?.status === "pending" || draft?.status === "batch_queued";
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-bold">Resposta {label}</div>
        {isGenerated ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> pronta</span>
        ) : isPending ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300"><Loader2 className="h-3.5 w-3.5 animate-spin" /> pendente</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-300"><XCircle className="h-3.5 w-3.5" /> falhou</span>
        )}
      </div>
      {draft?.error ? (
        <div className="text-sm text-red-300">{draft.error}</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{draft?.decision || "sem decisão"} · confiança {Math.round((draft?.confidence || 0) * 100)}%</div>
          {(draft?.messages || []).map((message, index) => (
            <div key={index} className="rounded-lg bg-primary/10 p-3 text-sm text-foreground">{message}</div>
          ))}
          {draft?.handoffReason && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">Handoff: {draft.handoffReason}</div>}
          {flags.length > 0 && <div className="text-xs text-muted-foreground">Flags: {flags.join(", ")}</div>}
        </div>
      )}
    </div>
  );
}
