"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Check, Copy, ExternalLink, Link2, Loader2, Plus, ShieldCheck, X } from "lucide-react";

type PublicTestLink = {
  id: string;
  tokenHint: string;
  title: string;
  unit: string;
  status: string;
  campaignCreativeId?: string | null;
  campaignCreative?: PublicCampaignCreative | null;
  expiresAt: string;
  maxSessions: number;
  maxRepliesPerSession: number;
  maxTotalReplies: number;
  sessionCount: number;
  replyCount: number;
  createdByName?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  _count?: { sessions: number };
};

type PublicCampaignCreative = {
  id: string;
  label: string;
  unit: string;
  campaign: { name: string };
};

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.details || data.error || "Não foi possível concluir a ação.");
  return data;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function linkState(link: PublicTestLink) {
  if (link.status !== "active" || link.revokedAt) return { label: "Encerrado", className: "bg-red-500/10 text-red-300" };
  if (new Date(link.expiresAt).getTime() <= Date.now()) return { label: "Expirado", className: "bg-amber-500/10 text-amber-300" };
  if (link.replyCount >= link.maxTotalReplies || link.sessionCount >= link.maxSessions) return { label: "Limite atingido", className: "bg-amber-500/10 text-amber-300" };
  return { label: "Ativo", className: "bg-emerald-500/10 text-emerald-400" };
}

export function AiPublicTestLinks() {
  const [links, setLinks] = useState<PublicTestLink[]>([]);
  const [approvedCampaignCreatives, setApprovedCampaignCreatives] = useState<PublicCampaignCreative[]>([]);
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "Teste da IA Virtuosa",
    unit: "",
    campaignCreativeId: "",
    expiresInDays: 7,
    maxSessions: 100,
    maxRepliesPerSession: 20,
    maxTotalReplies: 200,
  });

  const activeCount = useMemo(() => links.filter((link) => linkState(link).label === "Ativo").length, [links]);
  const campaignOptions = useMemo(
    () => approvedCampaignCreatives.filter((creative) => creative.unit === form.unit),
    [approvedCampaignCreatives, form.unit],
  );

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await responseData(await fetch("/api/crm/ai-shadow/training/share-links", { cache: "no-store" }));
      const units: string[] = data.allowedUnits || [];
      setLinks(data.links || []);
      setApprovedCampaignCreatives(data.approvedCampaignCreatives || []);
      setAllowedUnits(units);
      setIsAdmin(data.isAdmin === true);
      setForm((current) => ({ ...current, unit: current.unit || units[0] || "" }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao carregar links.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  async function createLink(event: FormEvent) {
    event.preventDefault();
    if (!form.unit || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    setCreatedUrl(null);
    try {
      const data = await responseData(await fetch("/api/crm/ai-shadow/training/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, includeExperimentalCaderno: true }),
      }));
      setCreatedUrl(data.publicUrl);
      setNotice("Link criado. Copie agora: por segurança, o endereço completo não fica armazenado.");
      setCopied(false);
      await loadLinks();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar link.");
    } finally {
      setSaving(false);
    }
  }

  async function copyCreatedUrl() {
    if (!createdUrl) return;
    await navigator.clipboard.writeText(createdUrl);
    setCopied(true);
  }

  async function revokeLink(id: string) {
    if (!window.confirm("Encerrar este link agora? Pessoas que estiverem testando perderão o acesso.")) return;
    setRevokingId(id);
    setError(null);
    try {
      await responseData(await fetch("/api/crm/ai-shadow/training/share-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }));
      setNotice("Link encerrado imediatamente.");
      await loadLinks();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao encerrar link.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/10 text-fuchsia-400"><Link2 className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold">Links públicos de teste</h2>
              {activeCount > 0 && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">{activeCount} ativo{activeCount === 1 ? "" : "s"}</span>}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Cada visitante recebe uma sessão privada com o Caderno e campanhas aprovadas da unidade, sem acesso ao CRM, conversas reais ou memória interna.</p>
          </div>
        </div>
        {isAdmin && (
          <button type="button" onClick={() => setOpen((current) => !current)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground sm:w-auto">
            {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{open ? "Fechar" : "Gerar link"}
          </button>
        )}
      </div>

      {(notice || error) && <div className={`mx-4 mb-4 rounded-lg border px-3 py-2 text-sm sm:mx-5 ${error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}`}>{error || notice}</div>}

      {createdUrl && (
        <div className="mx-4 mb-4 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/[0.06] p-3 sm:mx-5 sm:p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-fuchsia-300"><ShieldCheck className="h-4 w-4" />Endereço exibido somente agora</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly value={createdUrl} className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
            <button type="button" onClick={copyCreatedUrl} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-4 text-sm font-bold text-white hover:bg-fuchsia-500">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copiado" : "Copiar link"}
            </button>
            <a href={createdUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-bold hover:bg-muted"><ExternalLink className="h-4 w-4" />Abrir</a>
          </div>
        </div>
      )}

      {open && isAdmin && (
        <form onSubmit={createLink} className="grid gap-4 border-t border-border bg-muted/20 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(150px,0.55fr)_minmax(0,1fr)_minmax(120px,0.45fr)]">
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Título exibido<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={100} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" /></label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Unidade<select value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value, campaignCreativeId: "" }))} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground">{allowedUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
            <label className="grid min-w-0 gap-1 text-xs font-semibold text-muted-foreground">Campanha simulada<select value={form.campaignCreativeId} onChange={(event) => setForm((current) => ({ ...current, campaignCreativeId: event.target.value }))} className="h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground"><option value="">Perguntas livres</option>{campaignOptions.map((creative) => <option key={creative.id} value={creative.id}>{creative.campaign.name} · {creative.label}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Validade<input type="number" min={1} max={30} value={form.expiresInDays} onChange={(event) => setForm((current) => ({ ...current, expiresInDays: Number(event.target.value) }))} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" /><span className="text-[10px] font-normal">dias</span></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Participantes<input type="number" min={1} max={1000} value={form.maxSessions} onChange={(event) => setForm((current) => ({ ...current, maxSessions: Number(event.target.value) }))} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" /></label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Respostas por pessoa<input type="number" min={1} max={50} value={form.maxRepliesPerSession} onChange={(event) => setForm((current) => ({ ...current, maxRepliesPerSession: Number(event.target.value) }))} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" /></label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Respostas totais<input type="number" min={1} max={2000} value={form.maxTotalReplies} onChange={(event) => setForm((current) => ({ ...current, maxTotalReplies: Number(event.target.value) }))} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" /></label>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>O teste utiliza o Caderno e apenas resumos de campanhas aprovados. Memórias históricas e dados operacionais não são carregados.</span></div>
            <button type="submit" disabled={saving || !form.unit} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Criar link seguro</button>
          </div>
        </form>
      )}

      <div className="border-t border-border">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando links</div>
        ) : links.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nenhum link público foi criado.</div>
        ) : (
          <div className="divide-y divide-border">
            {links.map((link) => {
              const state = linkState(link);
              return (
                <article key={link.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{link.title}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${state.className}`}>{state.label}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{link.unit}</span></div>
                    <div className="mt-1 truncate text-xs font-medium text-foreground/80">{link.campaignCreative ? `${link.campaignCreative.campaign.name} · ${link.campaignCreative.label}` : "Perguntas livres, sem campanha fixa"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Token final ···{link.tokenHint} · expira {formatDate(link.expiresAt)} · criado por {link.createdByName || "administrador"}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-lg border border-border px-2.5 py-1.5 text-muted-foreground">{link.sessionCount}/{link.maxSessions} sessões</span>
                    <span className="rounded-lg border border-border px-2.5 py-1.5 text-muted-foreground">{link.replyCount}/{link.maxTotalReplies} respostas</span>
                    {isAdmin && state.label === "Ativo" && <button type="button" onClick={() => revokeLink(link.id)} disabled={revokingId === link.id} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50">{revokingId === link.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}Encerrar</button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
