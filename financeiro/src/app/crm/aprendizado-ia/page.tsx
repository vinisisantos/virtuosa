"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, Check, Clock3, Loader2, ShieldCheck, X } from "lucide-react";
import AuthGuard from "@/components/auth-guard";
import { toast } from "@/components/toast";

type CandidateContent = {
  topic: string;
  questions: string[];
  answer: string;
  procedure: string;
  conditions: string;
  clinical: boolean;
};

type Candidate = {
  id: string;
  content: CandidateContent;
  status: "pending" | "approved" | "rejected";
  version: number;
  sourceConversationId: string | null;
  sourceMessageIds: string[];
  createdAt: string;
  updatedAt: string;
};

type LearningResponse = {
  items: Candidate[];
  nextCursor: string | null;
  summary: {
    pending: number;
    approved: number;
    rejected: number;
    queued: number;
    failed: number;
    batchesToday: number;
    reservedMicroUsdToday: number;
    actualMicroUsdToday: number;
  };
  config: { enabled: boolean; activatedAt: string; dailyBudgetMicroUsd: number };
};

const EMPTY_SUMMARY: LearningResponse["summary"] = {
  pending: 0,
  approved: 0,
  rejected: 0,
  queued: 0,
  failed: 0,
  batchesToday: 0,
  reservedMicroUsdToday: 0,
  actualMicroUsdToday: 0,
};

function CandidateEditor({
  candidate,
  onChanged,
}: {
  candidate: Candidate;
  onChanged: () => void;
}) {
  const [content, setContent] = useState(candidate.content);
  const [confirmed, setConfirmed] = useState(false);
  const [clinicalConfirmed, setClinicalConfirmed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const update = (field: keyof CandidateContent, value: string | boolean | string[]) => {
    setContent((current) => ({ ...current, [field]: value }));
  };

  const submit = async (action: "edit" | "approve" | "reject") => {
    setSaving(action);
    try {
      const response = await fetch("/api/crm/ai-learning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: candidate.id,
          version: candidate.version,
          action,
          content,
          confirmed,
          clinicalConfirmed,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível revisar");
      toast(action === "approve" ? "Aprendizado aprovado" : action === "reject" ? "Aprendizado rejeitado" : "Edição salva", "success");
      onChanged();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível revisar", "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{content.clinical ? "Revisão técnica" : "Atendimento"}</p>
          <input
            value={content.topic}
            onChange={(event) => update("topic", event.target.value)}
            disabled={candidate.status !== "pending"}
            aria-label="Assunto do aprendizado"
            className="mt-1 w-full border-0 bg-transparent p-0 text-base font-semibold text-foreground outline-none disabled:opacity-100 sm:text-lg"
          />
        </div>
        <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {new Date(candidate.createdAt).toLocaleString("pt-BR")}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
          O que o cliente pode perguntar
          <textarea
            value={content.questions.join("\n")}
            onChange={(event) => update("questions", event.target.value.split("\n").filter(Boolean).slice(0, 3))}
            disabled={candidate.status !== "pending"}
            rows={3}
            className="min-h-24 resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-primary disabled:opacity-100"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
          Resposta aprendida
          <textarea
            value={content.answer}
            onChange={(event) => update("answer", event.target.value)}
            disabled={candidate.status !== "pending"}
            rows={3}
            className="min-h-24 resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-primary disabled:opacity-100"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
          Procedimento
          <input
            value={content.procedure}
            onChange={(event) => update("procedure", event.target.value)}
            disabled={candidate.status !== "pending"}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-primary disabled:opacity-100"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
          Condições para usar
          <input
            value={content.conditions}
            onChange={(event) => update("conditions", event.target.value)}
            disabled={candidate.status !== "pending"}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-primary disabled:opacity-100"
          />
        </label>
      </div>

      {candidate.status === "pending" && (
        <div className="mt-5 border-t border-border pt-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-foreground">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
            <span>Conferi o texto, a generalização e a ausência de dados pessoais, preços ou horários específicos.</span>
          </label>
          {content.clinical && (
            <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 text-sm text-foreground">
              <input type="checkbox" checked={clinicalConfirmed} onChange={(event) => setClinicalConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
              <span>O conteúdo técnico foi conferido por pessoa habilitada.</span>
            </label>
          )}
          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
            <button type="button" onClick={() => submit("approve")} disabled={Boolean(saving)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {saving === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar
            </button>
            <button type="button" onClick={() => submit("edit")} disabled={Boolean(saving)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
              {saving === "edit" ? "Salvando…" : "Salvar edição"}
            </button>
            <button type="button" onClick={() => submit("reject")} disabled={Boolean(saving)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-destructive/40 px-4 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-50">
              <X className="h-4 w-4" /> Rejeitar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function AiLearningPage() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<Candidate[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [enabled, setEnabled] = useState(false);
  const [dailyBudget, setDailyBudget] = useState(500_000);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status });
      if (append && nextCursor) params.set("cursor", nextCursor);
      const response = await fetch(`/api/crm/ai-learning?${params}`, { cache: "no-store" });
      const result = await response.json() as LearningResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar");
      setItems((current) => append ? [...current, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
      setSummary(result.summary);
      setEnabled(result.config.enabled);
      setDailyBudget(result.config.dailyBudgetMicroUsd);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível carregar", "error");
    } finally {
      setLoading(false);
    }
  }, [nextCursor, status]);

  useEffect(() => { void load(false); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = useMemo(() => [
    { id: "pending" as const, label: "Pendentes", count: summary.pending },
    { id: "approved" as const, label: "Aprovados", count: summary.approved },
    { id: "rejected" as const, label: "Rejeitados", count: summary.rejected },
  ], [summary]);

  return (
    <AuthGuard allowedRoles={["ADMINISTRADOR"]}>
      <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><BrainCircuit className="h-5 w-5" /></span>
              <div>
                <h2 className="text-lg font-bold text-foreground sm:text-xl">Aprendizado supervisionado · SBC</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">A DeepSeek observa respostas humanas, remove dados pessoais e propõe padrões. Nada aqui responde clientes, cria sugestões no Inbox ou envia mensagens.</p>
              </div>
            </div>
            <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${enabled ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
              <ShieldCheck className="h-4 w-4" /> {enabled ? "Modo sombra ativo" : "Pausado"}
            </span>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ["Na fila", summary.queued],
            ["Falhas para revisar", summary.failed],
            ["Lotes hoje", summary.batchesToday],
            ["Custo real hoje", `US$ ${(summary.actualMicroUsdToday / 1_000_000).toFixed(4)}`],
            ["Teto diário", `US$ ${(dailyBudget / 1_000_000).toFixed(2)}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-card p-3 sm:p-4">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-bold text-foreground sm:text-xl">{value}</p>
            </div>
          ))}
        </section>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setStatus(tab.id)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-semibold ${status === tab.id ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}>
              {tab.label} · {tab.count}
            </button>
          ))}
        </div>

        <section className="mt-4 grid gap-4">
          {loading && items.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border bg-card"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
              <Clock3 className="h-7 w-7 text-muted-foreground" />
              <p className="mt-3 font-semibold text-foreground">Nenhum aprendizado nesta etapa</p>
              <p className="mt-1 text-sm text-muted-foreground">Os lotes são processados uma vez por hora, somente após respostas humanas em SBC.</p>
            </div>
          ) : items.map((candidate) => (
            <CandidateEditor key={`${candidate.id}:${candidate.version}`} candidate={candidate} onChanged={() => load(false)} />
          ))}
        </section>

        {nextCursor && (
          <button type="button" onClick={() => load(true)} disabled={loading} className="mt-4 min-h-11 w-full rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            {loading ? "Carregando…" : "Carregar mais"}
          </button>
        )}
      </main>
    </AuthGuard>
  );
}
