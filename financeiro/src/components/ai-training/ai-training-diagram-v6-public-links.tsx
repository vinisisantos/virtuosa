"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Check, Copy, ExternalLink, Link2, Loader2, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { AI_TRAINING_DIAGRAM_V6_RUNTIME } from "@/lib/ai-training-diagram-v6";

type DiagramCampaign = {
  id: string;
  name: string;
  status: string;
};

type DiagramPublicLink = {
  id: string;
  tokenHint: string;
  title: string;
  unit: string;
  status: string;
  runtimeVersion: string;
  campaignId?: string | null;
  campaign?: DiagramCampaign | null;
  publicUrl?: string | null;
  expiresAt: string;
  maxSessions: number;
  maxRepliesPerSession: number;
  maxTotalReplies: number;
  sessionCount: number;
  replyCount: number;
  createdByName?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

type Props = {
  selectedCampaign: DiagramCampaign | null;
};

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.details || data.error || "Não foi possível concluir a ação.");
  return data;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function linkState(link: DiagramPublicLink) {
  if (link.status !== "active" || link.revokedAt) {
    return { label: "Encerrado", className: "bg-red-500/10 text-red-700 dark:text-red-300" };
  }
  if (new Date(link.expiresAt).getTime() <= Date.now()) {
    return { label: "Expirado", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
  }
  if (link.replyCount >= link.maxTotalReplies || link.sessionCount >= link.maxSessions) {
    return { label: "Limite atingido", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
  }
  return { label: "Ativo", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
}

export function AiTrainingDiagramV6PublicLinks({ selectedCampaign }: Props) {
  const [links, setLinks] = useState<DiagramPublicLink[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "Teste V6",
    expiresInDays: 7,
    maxSessions: 100,
    maxRepliesPerSession: 20,
    maxTotalReplies: 200,
  });

  const activeCount = useMemo(
    () => links.filter((link) => linkState(link).label === "Ativo").length,
    [links],
  );

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ runtimeVersion: AI_TRAINING_DIAGRAM_V6_RUNTIME });
      const data = await responseData(await fetch(`/api/crm/ai-shadow/training/share-links?${params}`, { cache: "no-store" }));
      setLinks(data.links || []);
      setIsAdmin(data.isAdmin === true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao carregar os links V6.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    if (!selectedCampaign) return;
    setForm((current) => ({ ...current, title: `Teste V6 · ${selectedCampaign.name}`.slice(0, 100) }));
  }, [selectedCampaign]);

  async function createLink(event: FormEvent) {
    event.preventDefault();
    if (!selectedCampaign || saving) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const data = await responseData(await fetch("/api/crm/ai-shadow/training/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          unit: "Osasco",
          runtimeVersion: AI_TRAINING_DIAGRAM_V6_RUNTIME,
          campaignId: selectedCampaign.id,
        }),
      }));
      const createdId = data.link?.id as string | undefined;
      setOpen(false);
      setNotice(`Link criado para ${selectedCampaign.name}. Ele permanecerá disponível nesta lista.`);
      await loadLinks();
      if (createdId && data.publicUrl) await copyLink(createdId, data.publicUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar o link V6.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink(id: string, publicUrl?: string | null) {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedLinkId(id);
      window.setTimeout(() => setCopiedLinkId((current) => current === id ? null : current), 2500);
    } catch {
      setError("Não foi possível copiar automaticamente. Abra o link e copie o endereço do navegador.");
    }
  }

  async function revokeLink(id: string) {
    if (!window.confirm("Encerrar este link agora? Quem estiver testando perderá o acesso.")) return;
    setRevokingId(id);
    setNotice(null);
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
      setError(err instanceof Error ? err.message : "Falha ao encerrar o link V6.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Link2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">Links públicos da V6</h2>
              {activeCount > 0 && (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  {activeCount} ativo{activeCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              O visitante testa o diagrama com a campanha escolhida. O endereço pode ser consultado e copiado novamente aqui.
            </p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => void loadLinks()}
            disabled={loading}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            aria-label="Atualizar links V6"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              disabled={!selectedCampaign}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50 sm:flex-none"
            >
              {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {open ? "Fechar" : "Gerar link"}
            </button>
          )}
        </div>
      </div>

      {(notice || error) && (
        <div className={`mx-4 mb-4 rounded-lg border px-3 py-2 text-sm sm:mx-5 ${error ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
          {error || notice}
        </div>
      )}

      {open && isAdmin && (
        <form onSubmit={createLink} className="grid gap-4 border-t border-border bg-muted/20 p-4 sm:p-5">
          <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-3 text-sm">
            <span className="font-bold">Campanha fixa: </span>
            <span className="text-muted-foreground">{selectedCampaign?.name || "selecione uma campanha acima"}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(120px,0.6fr))]">
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground sm:col-span-2 xl:col-span-1">
              Título exibido
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={100} className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              Validade em dias
              <input type="number" min={1} max={30} value={form.expiresInDays} onChange={(event) => setForm((current) => ({ ...current, expiresInDays: Number(event.target.value) }))} className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              Participantes
              <input type="number" min={1} max={1000} value={form.maxSessions} onChange={(event) => setForm((current) => ({ ...current, maxSessions: Number(event.target.value) }))} className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              Respostas por pessoa
              <input type="number" min={1} max={50} value={form.maxRepliesPerSession} onChange={(event) => setForm((current) => ({ ...current, maxRepliesPerSession: Number(event.target.value) }))} className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              Respostas totais
              <input type="number" min={1} max={2000} value={form.maxTotalReplies} onChange={(event) => setForm((current) => ({ ...current, maxTotalReplies: Number(event.target.value) }))} className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Cada pessoa recebe uma sessão privada. O link não dá acesso ao CRM nem envia mensagens ao WhatsApp.</span>
            </div>
            <button type="submit" disabled={saving || !selectedCampaign} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {saving ? "Gerando" : "Criar e copiar"}
            </button>
          </div>
        </form>
      )}

      <div className="border-t border-border">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando links</div>
        ) : links.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nenhum link público da V6 foi criado.</div>
        ) : (
          <div className="divide-y divide-border">
            {links.map((link) => {
              const state = linkState(link);
              const active = state.label === "Ativo";
              return (
                <article key={link.id} className="grid gap-3 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words font-semibold">{link.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${state.className}`}>{state.label}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">V6 · Osasco</span>
                    </div>
                    <div className="mt-1 text-xs font-medium text-foreground/80">Campanha fixa · {link.campaign?.name || "campanha removida"}</div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Expira {formatDate(link.expiresAt)} · criado por {link.createdByName || "administrador"} · final do token ···{link.tokenHint}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
                    <div className="grid grid-cols-2 gap-2 text-xs sm:flex">
                      <span className="rounded-lg border border-border px-2.5 py-2 text-center text-muted-foreground">{link.sessionCount}/{link.maxSessions} sessões</span>
                      <span className="rounded-lg border border-border px-2.5 py-2 text-center text-muted-foreground">{link.replyCount}/{link.maxTotalReplies} respostas</span>
                    </div>
                    {isAdmin && active && link.publicUrl && (
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <button type="button" onClick={() => void copyLink(link.id, link.publicUrl)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-primary/30 px-3 text-xs font-bold text-primary hover:bg-primary/10">
                          {copiedLinkId === link.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedLinkId === link.id ? "Copiado" : "Copiar"}
                        </button>
                        <a href={link.publicUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted">
                          <ExternalLink className="h-3.5 w-3.5" />Abrir
                        </a>
                      </div>
                    )}
                    {isAdmin && active && (
                      <button type="button" onClick={() => void revokeLink(link.id)} disabled={revokingId === link.id} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 text-xs font-bold text-red-700 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300">
                        {revokingId === link.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                        Encerrar
                      </button>
                    )}
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
