"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/auth-guard";
import { Bot, CheckCircle2, Loader2, RefreshCw, Save, ShieldCheck, SlidersHorizontal, UserCheck, WandSparkles, XCircle } from "lucide-react";

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
  unit: string;
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

type ReviewDraft = {
  selectedOption: "A" | "B" | "any" | "none";
  humanScore: number;
  severeErrorA: boolean;
  severeErrorB: boolean;
  severeErrorNotes: string;
  handoffAssessment: string;
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
  const [runs, setRuns] = useState<ShadowRun[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [estimatingRetroactive, setEstimatingRetroactive] = useState(false);
  const [submittingRetroactive, setSubmittingRetroactive] = useState(false);
  const [syncingRetroactive, setSyncingRetroactive] = useState(false);
  const [retroactiveEstimate, setRetroactiveEstimate] = useState<RetroactiveEstimate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setting = useMemo(() => settings.find((item) => item.unit === "Osasco"), [settings]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, runsRes] = await Promise.all([
        fetch("/api/crm/ai-shadow/settings"),
        fetch("/api/crm/ai-shadow/runs?unit=Osasco&status=ready&limit=30"),
      ]);
      const settingsData = await settingsRes.json();
      const runsData = await runsRes.json();
      if (!settingsRes.ok) throw new Error(settingsData.error || "Falha ao carregar configuração.");
      if (!runsRes.ok) throw new Error(runsData.error || "Falha ao carregar avaliações.");
      setSettings(settingsData.settings || []);
      setInstances(settingsData.instances || []);
      setRuns(runsData.runs || []);
      setSummary(runsData.summary || null);
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
              onClick={loadAll}
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
            <span className="text-sm text-muted-foreground">{runs.length} item(ns)</span>
          </div>
          {runs.map((run) => (
            <RunCard key={run.id} run={run} onReviewed={loadAll} />
          ))}
          {!loading && runs.length === 0 && (
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

function RunCard({ run, onReviewed }: { run: ShadowRun; onReviewed: () => void }) {
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<ReviewDraft>({
    selectedOption: "A",
    humanScore: 4,
    severeErrorA: false,
    severeErrorB: false,
    severeErrorNotes: "",
    handoffAssessment: "ok",
  });
  const drafts = [...run.drafts].sort((a, b) => (a.blindLabel || "").localeCompare(b.blindLabel || ""));
  const draftA = drafts.find((draft) => draft.blindLabel === "A");
  const draftB = drafts.find((draft) => draft.blindLabel === "B");
  const messages = run.context.messages || [];
  const phase = run.conversationPhase || run.context.conversation?.phase || "pre_handoff";

  async function submitReview() {
    setSaving(true);
    try {
      const res = await fetch("/api/crm/ai-shadow/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id, ...review }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar avaliação.");
      onReviewed();
    } catch (err: any) {
      alert(err?.message || "Falha ao salvar avaliação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-2 border-b border-border pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-bold">{run.contactName || run.context.conversation?.contactName || run.contactPhone || "Lead"}</div>
          <div className="text-xs text-muted-foreground">
            {formatDate(run.createdAt)} · {run.context.conversation?.instanceName || "WhatsApp"}
            {run.context.conversation?.assignedToName ? ` · ${run.context.conversation.assignedToName}` : ""}
            {run.campaignName ? ` · ${run.campaignName}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Bot className="h-3.5 w-3.5" />
            Cego: A/B
          </div>
          {run.sourceMode === "retroactive" && (
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
              Retroativa
            </div>
          )}
          {run.outcome && (
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              run.outcome === "converted" ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
            }`}>
              {getOutcomeLabel(run.outcome)}
            </div>
          )}
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            phase === "human_attendance" ? "bg-emerald-500/10 text-emerald-300" : "bg-muted text-muted-foreground"
          }`}>
            <UserCheck className="h-3.5 w-3.5" />
            {getPhaseLabel(phase)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-border bg-background/60 p-3">
          <div className="mb-2 text-sm font-bold">Histórico até o momento</div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {messages.map((message, index) => (
              <div key={`${message.timestamp}-${index}`} className="rounded-lg border border-border bg-card/80 p-2">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{message.role}</div>
                <div className="whitespace-pre-wrap text-sm">{message.body || `[${message.type}]`}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={`grid gap-3 ${run.humanReply ? "xl:grid-cols-3" : "lg:grid-cols-2"}`}>
          <DraftPanel label="A" draft={draftA} />
          <DraftPanel label="B" draft={draftB} />
          {run.humanReply && <HumanReplyPanel reply={run.humanReply} />}
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-border pt-4 lg:grid-cols-[1fr_1fr_auto]">
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
          Salvar
        </button>
      </div>
    </article>
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
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-bold">Resposta {label}</div>
        {draft?.status === "generated" ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> pronta</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-300"><XCircle className="h-3.5 w-3.5" /> erro</span>
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
