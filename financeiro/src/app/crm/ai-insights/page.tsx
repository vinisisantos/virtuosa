"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/auth-guard";
import { useGlobalUnit } from "@/contexts/UnitContext";
import { Brain, Database, Loader2, MessageSquareText, RefreshCw, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";

interface SilentSetting {
  id: string;
  unit: string;
  isEnabled: boolean;
  collectMessageBodies: boolean;
  includeOutbound: boolean;
  updatedAt: string;
}

interface InsightSummary {
  total: number;
  byUnit: Array<{ unit: string; count: number }>;
  byCampaign: Array<{ campaignName: string; count: number }>;
  recent: Array<{
    id: string;
    unit: string | null;
    contactName: string | null;
    contactPhone: string | null;
    campaignName: string | null;
    messageCount: number;
    inboundCount: number;
    outboundCount: number;
    lastAnalyzedAt: string | null;
    summary: string | null;
    topics?: Array<{ key: string; label: string }> | null;
    objections?: Array<{ key: string; label: string }> | null;
    questions?: string[] | null;
  }>;
}

const UNITS = ["SCS", "SBC", "Osasco"];

export default function CrmAiInsightsPage() {
  return (
    <AuthGuard requiredPermission="crmSilentAnalysis">
      <AiInsightsContent />
    </AuthGuard>
  );
}

function AiInsightsContent() {
  const { globalUnit } = useGlobalUnit();
  const [settings, setSettings] = useState<SilentSetting[]>([]);
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUnit, setSavingUnit] = useState<string | null>(null);
  const [backfillUnit, setBackfillUnit] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedUnit = useMemo(() => {
    if (globalUnit && UNITS.includes(globalUnit)) return globalUnit;
    return "Todas";
  }, [globalUnit]);
  const learnings = useMemo(() => {
    const topicCounts = new Map<string, number>();
    const objectionCounts = new Map<string, number>();
    const questions: string[] = [];
    for (const item of summary?.recent || []) {
      for (const topic of item.topics || []) topicCounts.set(topic.label, (topicCounts.get(topic.label) || 0) + 1);
      for (const objection of item.objections || []) objectionCounts.set(objection.label, (objectionCounts.get(objection.label) || 0) + 1);
      for (const question of item.questions || []) questions.push(question);
    }
    const sortEntries = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return {
      topics: sortEntries(topicCounts),
      objections: sortEntries(objectionCounts),
      questions: questions.slice(-6).reverse(),
    };
  }, [summary]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, summaryRes] = await Promise.all([
        fetch("/api/crm/silent-analysis/settings"),
        fetch(`/api/crm/silent-analysis/insights?unit=${encodeURIComponent(selectedUnit)}`),
      ]);
      const settingsData = await settingsRes.json();
      const summaryData = await summaryRes.json();
      setSettings(settingsData.settings || []);
      setSummary(summaryData);
    } finally {
      setLoading(false);
    }
  }, [selectedUnit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function updateSetting(unit: string, patch: Partial<SilentSetting>) {
    setSavingUnit(unit);
    try {
      const current = settings.find((item) => item.unit === unit);
      const res = await fetch("/api/crm/silent-analysis/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...current, ...patch, unit }),
      });
      if (!res.ok) throw new Error("Não foi possível salvar a configuração.");
      await loadData();
    } finally {
      setSavingUnit(null);
    }
  }

  async function backfill(unit: string) {
    setBackfillUnit(unit);
    setNotice(null);
    try {
      const res = await fetch("/api/crm/silent-analysis/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit, limit: 250 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao reprocessar histórico.");
      setNotice(`${data.processed} conversa(s) atualizada(s) de ${data.scanned} analisada(s).`);
      await loadData();
    } catch (error: any) {
      setNotice(error?.message || "Falha ao reprocessar histórico.");
    } finally {
      setBackfillUnit(null);
    }
  }

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Modo silencioso e controlado por permissão
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Análise IA do CRM</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Coleta sinais das conversas para formar uma base permanente de aprendizado, sem enviar mensagens e sem alterar tags ou funil automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </header>

        {notice && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
            {notice}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard icon={Database} label="Conversas coletadas" value={summary?.total ?? 0} />
          <MetricCard icon={MessageSquareText} label="Campanhas mapeadas" value={summary?.byCampaign?.filter((item) => item.campaignName !== "Sem campanha").length ?? 0} />
          <MetricCard icon={Brain} label="Unidade atual" value={selectedUnit} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-1 text-base font-bold">Controle por unidade</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Ligue a coleta apenas nas unidades que você quiser. Usuários precisam da permissão específica para ver esta tela.
            </p>
            <div className="flex flex-col gap-3">
              {UNITS.map((unit) => {
                const setting = settings.find((item) => item.unit === unit);
                const enabled = setting?.isEnabled === true;
                const busy = savingUnit === unit;
                return (
                  <div key={unit} className="rounded-lg border border-border bg-background/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold">{unit}</div>
                        <div className="text-xs text-muted-foreground">
                          {enabled ? "Coletando conversas novas" : "Coleta pausada"}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => updateSetting(unit, { isEnabled: !enabled })}
                        className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
                          enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        {enabled ? "Ativa" : "Inativa"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
                        Guardar texto das mensagens
                        <input
                          type="checkbox"
                          checked={setting?.collectMessageBodies !== false}
                          onChange={(e) => updateSetting(unit, { collectMessageBodies: e.target.checked })}
                          className="h-4 w-4 accent-primary"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
                        Incluir respostas da equipe
                        <input
                          type="checkbox"
                          checked={setting?.includeOutbound !== false}
                          onChange={(e) => updateSetting(unit, { includeOutbound: e.target.checked })}
                          className="h-4 w-4 accent-primary"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      disabled={!enabled || backfillUnit === unit}
                      onClick={() => backfill(unit)}
                      className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-bold text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {backfillUnit === unit ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Reprocessar histórico recente
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-4 text-base font-bold">Campanhas percebidas</h2>
            {loading ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : summary?.byCampaign?.length ? (
              <div className="flex flex-col gap-3">
                {summary.byCampaign.map((item) => (
                  <div key={item.campaignName}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-semibold">{item.campaignName}</span>
                      <span className="text-primary">{item.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(8, (item.count / Math.max(summary.total, 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nenhuma conversa coletada ainda.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-bold">O que a IA está aprendendo</h2>
              <p className="text-sm text-muted-foreground">Resumo vivo dos padrões encontrados nas conversas coletadas.</p>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <LearningColumn title="Temas frequentes" items={learnings.topics.map(([label, count]) => `${label} · ${count}`)} empty="Ainda sem temas suficientes." />
            <LearningColumn title="Objeções percebidas" items={learnings.objections.map(([label, count]) => `${label} · ${count}`)} empty="Ainda sem objeções suficientes." />
            <LearningColumn title="Perguntas recentes" items={learnings.questions} empty="Ainda sem perguntas registradas." />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-4 text-base font-bold">Últimas conversas analisadas</h2>
          <div className="grid gap-3">
            {summary?.recent?.length ? summary.recent.map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-background/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{item.contactName || item.contactPhone || "Contato sem nome"}</div>
                  <div className="text-xs text-muted-foreground">{item.unit || "Sem unidade"} · {item.messageCount} mensagens</div>
                </div>
                <div className="mt-1 text-xs font-semibold text-primary">{item.campaignName || "Sem campanha identificada"}</div>
                {item.summary && <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>}
              </div>
            )) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Ative uma unidade e reprocessse o histórico para começar a popular esta base.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function LearningColumn({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</div>
      {items.length ? (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={item} className="rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      )}
    </div>
  );
}
