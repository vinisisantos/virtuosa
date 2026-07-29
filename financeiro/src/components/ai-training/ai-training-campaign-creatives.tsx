"use client";
/* eslint-disable @next/next/no-img-element -- as imagens usam URLs privadas assinadas e dimensões variáveis */

import { upload } from "@vercel/blob/client";
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  CalendarDays,
  Check,
  Eye,
  FileImage,
  ImagePlus,
  Loader2,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Campaign = {
  id: string;
  name: string;
  unit: string;
  status: string;
  objective?: string | null;
  offerItems: Array<{ procedureName: string; includedSessions: number }>;
};

type Snapshot = {
  headline: string | null;
  visibleText: string;
  visualDescription: string;
  procedures: string[];
  campaignItems: Array<{
    commercialName: string;
    quantity: number | null;
    quantityText: string | null;
    cadernoEntryId: string | null;
    technicalName: string | null;
  }>;
  offerSummary: string | null;
  priceText: string | null;
  priceValue: number | null;
  paymentConditions: string | null;
  validityText: string | null;
  claims: string[];
  restrictions: string[];
  callToAction: string | null;
  divergenceWarnings: string[];
  confidence: number;
};

type Creative = {
  id: string;
  campaignId: string;
  unit: string;
  label: string;
  caption?: string | null;
  imageUrl?: string | null;
  imagePreviewUrl?: string | null;
  imageFileName?: string | null;
  imageMimeType?: string | null;
  imageSizeBytes?: number | null;
  validUntil?: string | null;
  status: string;
  extractedData?: Snapshot | null;
  approvedSnapshot?: Snapshot | null;
  analysisModel?: string | null;
  analysisError?: string | null;
  analyzedAt?: string | null;
  createdByName?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  updatedAt: string;
  campaign: {
    name: string;
    objective?: string | null;
    status: string;
    offerItems: Array<{ procedureName: string; includedSessions: number }>;
  };
};

type ReviewDraft = {
  headline: string;
  visibleText: string;
  visualDescription: string;
  procedures: string;
  campaignItems: Snapshot["campaignItems"];
  offerSummary: string;
  priceText: string;
  priceValue: string;
  paymentConditions: string;
  validityText: string;
  claims: string;
  restrictions: string;
  callToAction: string;
  divergenceWarnings: string;
  confidence: number;
};

const EMPTY_REVIEW: ReviewDraft = {
  headline: "",
  visibleText: "",
  visualDescription: "",
  procedures: "",
  campaignItems: [],
  offerSummary: "",
  priceText: "",
  priceValue: "",
  paymentConditions: "",
  validityText: "",
  claims: "",
  restrictions: "",
  callToAction: "",
  divergenceWarnings: "",
  confidence: 0,
};

const STATUS: Record<string, { label: string; classes: string }> = {
  draft: { label: "Rascunho", classes: "border-slate-500/30 bg-slate-500/10 text-slate-500" },
  analyzing: { label: "Analisando", classes: "border-violet-500/30 bg-violet-500/10 text-violet-500" },
  pending_review: { label: "Aguardando revisão", classes: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  approved: { label: "Aprovado", classes: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Reprovado", classes: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" },
  analysis_failed: { label: "Falha na análise", classes: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" },
};

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatBytes(value?: number | null) {
  if (!value) return "";
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`;
}

function responseError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.details || data.error || "Não foi possível concluir a ação.");
  return data;
}

function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-160);
}

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function reviewFromCreative(creative: Creative): ReviewDraft {
  const snapshot = creative.approvedSnapshot || creative.extractedData;
  if (!snapshot) return EMPTY_REVIEW;
  return {
    headline: snapshot.headline || "",
    visibleText: snapshot.visibleText || "",
    visualDescription: snapshot.visualDescription || "",
    procedures: (snapshot.procedures || []).join(", "),
    campaignItems: snapshot.campaignItems || [],
    offerSummary: snapshot.offerSummary || "",
    priceText: snapshot.priceText || "",
    priceValue: snapshot.priceValue == null ? "" : String(snapshot.priceValue),
    paymentConditions: snapshot.paymentConditions || "",
    validityText: snapshot.validityText || "",
    claims: (snapshot.claims || []).join("\n"),
    restrictions: (snapshot.restrictions || []).join("\n"),
    callToAction: snapshot.callToAction || "",
    divergenceWarnings: (snapshot.divergenceWarnings || []).join("\n"),
    confidence: snapshot.confidence || 0,
  };
}

function snapshotFromReview(review: ReviewDraft): Snapshot {
  const priceValue = review.priceValue.trim() ? Number(review.priceValue.replace(",", ".")) : null;
  return {
    headline: review.headline.trim() || null,
    visibleText: review.visibleText.trim(),
    visualDescription: review.visualDescription.trim(),
    procedures: review.procedures.split(",").map((item) => item.trim()).filter(Boolean),
    campaignItems: review.campaignItems,
    offerSummary: review.offerSummary.trim() || null,
    priceText: review.priceText.trim() || null,
    priceValue: priceValue != null && Number.isFinite(priceValue) ? priceValue : null,
    paymentConditions: review.paymentConditions.trim() || null,
    validityText: review.validityText.trim() || null,
    claims: lines(review.claims),
    restrictions: lines(review.restrictions),
    callToAction: review.callToAction.trim() || null,
    divergenceWarnings: lines(review.divergenceWarnings),
    confidence: review.confidence,
  };
}

function StatusPill({ status }: { status: string }) {
  const config = STATUS[status] || STATUS.draft;
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${config.classes}`}>{config.label}</span>;
}

export function AiTrainingCampaignCreatives() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unit, setUnit] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedCreative, setSelectedCreative] = useState<Creative | null>(null);
  const [review, setReview] = useState<ReviewDraft>(EMPTY_REVIEW);
  const [reviewValidity, setReviewValidity] = useState("");
  const [reviewCaption, setReviewCaption] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ campaignId: "", label: "", caption: "", validUntil: "", externalAdId: "" });
  const [file, setFile] = useState<File | null>(null);

  async function loadData(background = false) {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await responseData(await fetch("/api/crm/ai-shadow/training/campaign-creatives"));
      setCampaigns(data.campaigns || []);
      setCreatives(data.creatives || []);
      setAllowedUnits(data.allowedUnits || []);
      setIsAdmin(Boolean(data.isAdmin));
      setUnit((current) => current || data.allowedUnits?.[0] || "");
      if (selectedCreative) {
        const refreshed = (data.creatives || []).find((item: Creative) => item.id === selectedCreative.id) || null;
        setSelectedCreative(refreshed);
        if (refreshed) {
          setReview(reviewFromCreative(refreshed));
          setReviewCaption(refreshed.caption || "");
          setReviewValidity(refreshed.validUntil?.slice(0, 10) || "");
        }
      }
    } catch (error: unknown) {
      setError(responseError(error, "Falha ao carregar os criativos."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unitCampaigns = useMemo(() => campaigns.filter((item) => item.unit === unit), [campaigns, unit]);
  const unitCreatives = useMemo(() => creatives.filter((item) => item.unit === unit), [creatives, unit]);
  const totals = useMemo(() => ({
    all: unitCreatives.length,
    review: unitCreatives.filter((item) => item.status === "pending_review").length,
    approved: unitCreatives.filter((item) => item.status === "approved").length,
  }), [unitCreatives]);

  function openCreate() {
    setForm({ campaignId: unitCampaigns[0]?.id || "", label: "", caption: "", validUntil: "", externalAdId: "" });
    setFile(null);
    setUploadProgress(0);
    setError(null);
    setCreateOpen(true);
  }

  function openReview(creative: Creative) {
    setSelectedCreative(creative);
    setReview(reviewFromCreative(creative));
    setReviewCaption(creative.caption || "");
    setReviewValidity(creative.validUntil?.slice(0, 10) || "");
    setError(null);
  }

  async function createCreative(event: FormEvent) {
    event.preventDefault();
    if (!file || creating) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Use uma imagem PNG, JPEG ou WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 10 MB.");
      return;
    }
    setCreating(true);
    setNotice(null);
    setError(null);
    setUploadProgress(0);
    try {
      const created = await responseData(await fetch("/api/crm/ai-shadow/training/campaign-creatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }));
      const creativeId = created.creative.id as string;
      const blob = await upload(
        `ai-training/campaign-creatives/${creativeId}/${Date.now()}-${safeFileName(file.name)}`,
        file,
        {
          access: "private",
          handleUploadUrl: "/api/crm/ai-shadow/training/campaign-creatives/upload",
          clientPayload: JSON.stringify({ creativeId }),
          contentType: file.type,
          onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
        },
      );
      await responseData(await fetch(`/api/crm/ai-shadow/training/campaign-creatives/${creativeId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: blob.url,
          imageFileName: file.name,
          imageMimeType: file.type,
          imageSizeBytes: file.size,
        }),
      }));
      setCreateOpen(false);
      setNotice("Imagem analisada. Revise o conteúdo antes de aprovar.");
      await loadData(true);
    } catch (error: unknown) {
      setError(responseError(error, "Não foi possível cadastrar o criativo."));
      await loadData(true);
    } finally {
      setCreating(false);
    }
  }

  async function retryAnalysis(creative: Creative) {
    if (!creative.imageUrl || !creative.imageMimeType || !creative.imageSizeBytes) return;
    setReviewing(true);
    setError(null);
    try {
      await responseData(await fetch(`/api/crm/ai-shadow/training/campaign-creatives/${creative.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: creative.imageUrl,
          imageFileName: creative.imageFileName,
          imageMimeType: creative.imageMimeType,
          imageSizeBytes: creative.imageSizeBytes,
        }),
      }));
      setNotice("Criativo reanalisado e pronto para revisão.");
      await loadData(true);
    } catch (error: unknown) {
      setError(responseError(error, "A reanálise falhou."));
    } finally {
      setReviewing(false);
    }
  }

  async function reviewAction(action: "approve" | "reject" | "archive") {
    if (!selectedCreative || reviewing) return;
    setReviewing(true);
    setError(null);
    setNotice(null);
    try {
      await responseData(await fetch("/api/crm/ai-shadow/training/campaign-creatives", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedCreative.id,
          action,
          caption: reviewCaption,
          validUntil: reviewValidity,
          snapshot: snapshotFromReview(review),
        }),
      }));
      setSelectedCreative(null);
      setNotice(action === "approve" ? "Criativo aprovado para o chat interno." : action === "reject" ? "Criativo reprovado." : "Criativo arquivado.");
      await loadData(true);
    } catch (error: unknown) {
      setError(responseError(error, "Não foi possível concluir a revisão."));
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Megaphone className="h-5 w-5" /></div>
            <div>
              <h2 className="font-bold">Criativos de campanha</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">A imagem é analisada uma vez e só entra após revisão humana. Criativos aprovados podem ser usados nas simulações internas e no link de teste; WhatsApp e observação real permanecem isolados.</p>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button type="button" onClick={() => loadData(true)} disabled={refreshing} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted disabled:opacity-50" aria-label="Atualizar criativos">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={openCreate} disabled={!unitCampaigns.length} className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50 sm:flex-none">
              <ImagePlus className="h-4 w-4" />Novo criativo
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(180px,240px)_repeat(3,minmax(0,1fr))] sm:p-5">
          <label className="grid gap-1 text-xs font-bold text-muted-foreground">
            Unidade
            <select value={unit} onChange={(event) => setUnit(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary">
              {allowedUnits.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {[
            { label: "Criativos", value: totals.all, Icon: FileImage },
            { label: "Para revisar", value: totals.review, Icon: Sparkles },
            { label: "Aprovados", value: totals.approved, Icon: BadgeCheck },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-background/50 px-4 py-3">
              <Icon className="h-4 w-4 text-primary" />
              <div><div className="text-xl font-bold leading-none">{value}</div><div className="mt-1 text-[11px] font-semibold text-muted-foreground">{label}</div></div>
            </div>
          ))}
        </div>
      </section>

      {(notice || error) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>{error || notice}</div>}

      {loading ? (
        <div className="flex min-h-72 items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando criativos</div>
      ) : unitCreatives.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ImagePlus className="h-8 w-8" /></div>
          <h3 className="font-bold">Nenhum criativo em {unit}</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">Cadastre a peça e a legenda que o cliente viu para testar dúvidas reais da campanha.</p>
          <button type="button" onClick={openCreate} disabled={!unitCampaigns.length} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"><ImagePlus className="h-4 w-4" />Cadastrar primeiro</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {unitCreatives.map((creative) => (
            <article key={creative.id} className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/40">
              <button type="button" onClick={() => openReview(creative)} className="block w-full text-left">
                <div className="relative aspect-[16/10] overflow-hidden border-b border-border bg-muted/40">
                  {creative.imagePreviewUrl ? <img src={creative.imagePreviewUrl} alt={`Criativo ${creative.label}`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><FileImage className="h-10 w-10" /></div>}
                  <div className="absolute left-3 top-3"><StatusPill status={creative.status} /></div>
                  <div className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur"><Eye className="h-4 w-4" /></div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="truncate font-bold">{creative.label}</h3><p className="mt-1 truncate text-xs font-semibold text-primary">{creative.campaign.name}</p></div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{creative.unit}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">{creative.caption || creative.extractedData?.offerSummary || "Sem legenda informada"}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground"><span>{creative.imageFileName || "Imagem"}</span><span>{formatBytes(creative.imageSizeBytes)}</span></div>
                </div>
              </button>
            </article>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/65 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Cadastrar criativo">
          <form onSubmit={createCreative} className="flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-w-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6">
              <div><h3 className="font-bold">Novo criativo</h3><p className="text-xs text-muted-foreground">{unit} · análise interna</p></div>
              <button type="button" onClick={() => !creating && setCreateOpen(false)} disabled={creating} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              <label className="grid gap-1.5 text-sm font-bold">Campanha
                <select required value={form.campaignId} onChange={(event) => setForm((current) => ({ ...current, campaignId: event.target.value }))} className="h-12 rounded-xl border border-input bg-background px-3 font-normal outline-none focus:border-primary">
                  {unitCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.status}</option>)}
                </select>
              </label>
              {form.campaignId && unitCampaigns.find((item) => item.id === form.campaignId)?.offerItems.length === 0 && (
                <div className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Esta campanha ainda não possui procedimentos estruturados para comparação. A análise continuará, mas exigirá atenção adicional na revisão.</span></div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-bold">Nome interno
                  <input required value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="Ex.: Criativo julho — antes e depois" className="h-12 rounded-xl border border-input bg-background px-3 font-normal outline-none focus:border-primary" />
                </label>
                <label className="grid gap-1.5 text-sm font-bold">ID do anúncio <span className="font-normal text-muted-foreground">opcional</span>
                  <input value={form.externalAdId} onChange={(event) => setForm((current) => ({ ...current, externalAdId: event.target.value }))} placeholder="ID da Meta" className="h-12 rounded-xl border border-input bg-background px-3 font-normal outline-none focus:border-primary" />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-bold">Legenda vista pelo cliente
                <textarea value={form.caption} onChange={(event) => setForm((current) => ({ ...current, caption: event.target.value }))} rows={5} placeholder="Cole a legenda completa do anúncio…" className="resize-y rounded-xl border border-input bg-background p-3 font-normal outline-none focus:border-primary" />
              </label>
              <label className="grid gap-1.5 text-sm font-bold">Validade comercial <span className="font-normal text-muted-foreground">use uma data ou registre “sem prazo definido” na revisão</span>
                <input type="date" value={form.validUntil} onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))} className="h-12 rounded-xl border border-input bg-background px-3 font-normal outline-none focus:border-primary" />
              </label>
              <label className={`grid min-h-40 cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-5 text-center transition ${file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                <div><UploadCloud className="mx-auto h-8 w-8 text-primary" /><div className="mt-3 text-sm font-bold">{file ? file.name : "Escolher imagem da campanha"}</div><div className="mt-1 text-xs text-muted-foreground">PNG, JPEG ou WEBP · até 10 MB{file ? ` · ${formatBytes(file.size)}` : ""}</div></div>
              </label>
              {creating && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3"><div className="mb-2 flex justify-between text-xs font-bold"><span>{uploadProgress < 100 ? "Enviando imagem" : "Analisando texto e oferta"}</span><span>{uploadProgress < 100 ? `${uploadProgress}%` : <Loader2 className="h-3.5 w-3.5 animate-spin" />}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(uploadProgress, uploadProgress === 100 ? 100 : 4)}%` }} /></div></div>}
            </div>
            <div className="flex gap-2 border-t border-border bg-card p-4 sm:justify-end sm:px-6">
              <button type="button" onClick={() => setCreateOpen(false)} disabled={creating} className="h-11 flex-1 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-50 sm:flex-none">Cancelar</button>
              <button type="submit" disabled={creating || !file || !form.campaignId || !form.label.trim()} className="inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50 sm:flex-none">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Enviar e analisar</button>
            </div>
          </form>
        </div>
      )}

      {selectedCreative && (
        <div className="fixed inset-0 z-[70] flex bg-black/65 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Revisar criativo">
          <div className="flex h-full w-full flex-col overflow-hidden bg-card sm:h-[min(900px,94dvh)] sm:max-w-6xl sm:rounded-3xl sm:border sm:border-border sm:shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate font-bold">{selectedCreative.label}</h3><StatusPill status={selectedCreative.status} /></div><p className="mt-1 truncate text-xs text-muted-foreground">{selectedCreative.campaign.name} · {selectedCreative.unit}</p></div>
              <button type="button" onClick={() => setSelectedCreative(null)} className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)] lg:overflow-hidden">
              <aside className="border-b border-border bg-muted/15 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-6">
                <div className="overflow-hidden rounded-2xl border border-border bg-background"><div className="aspect-[4/3] bg-muted/40">{selectedCreative.imagePreviewUrl ? <img src={selectedCreative.imagePreviewUrl} alt={selectedCreative.label} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center"><FileImage className="h-10 w-10 text-muted-foreground" /></div>}</div></div>
                <div className="mt-4 grid gap-3 text-sm">
                  <div className="rounded-xl border border-border bg-background/70 p-3"><div className="text-xs font-bold text-muted-foreground">Legenda original</div><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{selectedCreative.caption || "Não informada"}</p></div>
                  <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-border p-3"><div className="text-[10px] font-bold uppercase text-muted-foreground">Arquivo</div><div className="mt-1 truncate text-xs font-semibold">{selectedCreative.imageFileName || "Imagem"}</div></div><div className="rounded-xl border border-border p-3"><div className="text-[10px] font-bold uppercase text-muted-foreground">Análise</div><div className="mt-1 text-xs font-semibold">{formatDate(selectedCreative.analyzedAt)}</div></div></div>
                  {selectedCreative.campaign.offerItems.length === 0 && <div className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" />Sem oferta estruturada para comparação automática.</div>}
                  {selectedCreative.analysisError && <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300">{selectedCreative.analysisError}</div>}
                  {selectedCreative.status === "analysis_failed" && <button type="button" onClick={() => retryAnalysis(selectedCreative)} disabled={reviewing} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 text-sm font-bold text-primary disabled:opacity-50">{reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Tentar analisar novamente</button>}
                </div>
              </aside>
              <main className="min-h-0 p-4 lg:overflow-y-auto lg:p-6">
                {selectedCreative.extractedData ? <div className="grid gap-5">
                  <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><div className="text-sm font-bold">Revisão humana obrigatória</div><p className="mt-1 text-xs text-muted-foreground">Edite qualquer interpretação imprecisa. Somente esta versão revisada será enviada ao contexto da simulação.</p></div></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ReviewField label="Título identificado" value={review.headline} onChange={(value) => setReview((current) => ({ ...current, headline: value }))} />
                    <ReviewField label="Procedimentos" hint="separados por vírgula" value={review.procedures} onChange={(value) => setReview((current) => ({ ...current, procedures: value }))} />
                  </div>
                  <ReviewArea label="Texto visível na imagem" value={review.visibleText} onChange={(value) => setReview((current) => ({ ...current, visibleText: value }))} rows={5} />
                  <ReviewArea label="Descrição visual" value={review.visualDescription} onChange={(value) => setReview((current) => ({ ...current, visualDescription: value }))} rows={3} />
                  <ReviewArea label="Resumo da oferta" value={review.offerSummary} onChange={(value) => setReview((current) => ({ ...current, offerSummary: value }))} rows={3} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ReviewField label="Preço como aparece" value={review.priceText} onChange={(value) => setReview((current) => ({ ...current, priceText: value }))} />
                    <ReviewField label="Valor numérico" value={review.priceValue} onChange={(value) => setReview((current) => ({ ...current, priceValue: value }))} inputMode="decimal" />
                    <ReviewField label="Condição de pagamento" value={review.paymentConditions} onChange={(value) => setReview((current) => ({ ...current, paymentConditions: value }))} />
                    <label className="grid gap-1.5 text-sm font-bold">Validade aprovada <span className="font-normal text-muted-foreground">opcional quando a condição não tem prazo</span>
                      <div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><input type="date" value={reviewValidity} onChange={(event) => setReviewValidity(event.target.value)} className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-3 font-normal outline-none focus:border-primary" /></div>
                    </label>
                  </div>
                  <ReviewField label="Texto de validade" hint="ex.: Sem prazo definido; vigente até atualização da Virtuosa" value={review.validityText} onChange={(value) => setReview((current) => ({ ...current, validityText: value }))} />
                  <ReviewArea label="Legenda aprovada" value={reviewCaption} onChange={setReviewCaption} rows={4} />
                  <ReviewArea label="Alegações e promessas" hint="uma por linha" value={review.claims} onChange={(value) => setReview((current) => ({ ...current, claims: value }))} rows={4} tone="amber" />
                  <ReviewArea label="Restrições" hint="uma por linha" value={review.restrictions} onChange={(value) => setReview((current) => ({ ...current, restrictions: value }))} rows={4} />
                  <ReviewField label="Chamada para ação" value={review.callToAction} onChange={(value) => setReview((current) => ({ ...current, callToAction: value }))} />
                  <ReviewArea label="Divergências encontradas" hint="uma por linha" value={review.divergenceWarnings} onChange={(value) => setReview((current) => ({ ...current, divergenceWarnings: value }))} rows={4} tone="red" />
                  <div className="text-xs text-muted-foreground">Confiança da extração: <strong className="text-foreground">{Math.round(review.confidence * 100)}%</strong> · modelo {selectedCreative.analysisModel || "não informado"}</div>
                </div> : <div className="flex min-h-72 flex-col items-center justify-center text-center"><Loader2 className={`h-8 w-8 text-primary ${selectedCreative.status === "analyzing" ? "animate-spin" : ""}`} /><h4 className="mt-4 font-bold">Análise ainda indisponível</h4><p className="mt-2 max-w-sm text-sm text-muted-foreground">{selectedCreative.status === "analyzing" ? "A imagem está sendo processada." : "Tente a análise novamente ou arquive este cadastro."}</p></div>}
              </main>
            </div>
            <div className="border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-4">
              <button type="button" onClick={() => reviewAction("archive")} disabled={reviewing || !isAdmin} className="hidden h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold text-muted-foreground disabled:opacity-40 sm:inline-flex"><Archive className="h-4 w-4" />Arquivar</button>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <button type="button" onClick={() => reviewAction("reject")} disabled={reviewing || !isAdmin || !selectedCreative.extractedData} className="h-11 rounded-xl border border-red-500/30 px-4 text-sm font-bold text-red-600 disabled:opacity-40 dark:text-red-400">Reprovar</button>
                <button type="button" onClick={() => reviewAction("approve")} disabled={reviewing || !isAdmin || !selectedCreative.extractedData} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white disabled:opacity-40">{reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Aprovar para o chat</button>
              </div>
              {!isAdmin && <p className="mt-2 text-center text-[11px] text-muted-foreground sm:mt-0">Somente administradores concluem a revisão.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewField({ label, hint, value, onChange, inputMode }: { label: string; hint?: string; value: string; onChange: (value: string) => void; inputMode?: "decimal" }) {
  return <label className="grid gap-1.5 text-sm font-bold">{label}{hint && <span className="font-normal text-muted-foreground">{hint}</span>}<input value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} className="h-12 rounded-xl border border-input bg-background px-3 font-normal outline-none focus:border-primary" /></label>;
}

function ReviewArea({ label, hint, value, onChange, rows, tone }: { label: string; hint?: string; value: string; onChange: (value: string) => void; rows: number; tone?: "amber" | "red" }) {
  const toneClasses = tone === "amber" ? "border-amber-500/30 focus:border-amber-500" : tone === "red" ? "border-red-500/30 focus:border-red-500" : "border-input focus:border-primary";
  return <label className="grid gap-1.5 text-sm font-bold">{label}{hint && <span className="font-normal text-muted-foreground">{hint}</span>}<textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className={`resize-y rounded-xl border bg-background p-3 font-normal outline-none ${toneClasses}`} /></label>;
}
