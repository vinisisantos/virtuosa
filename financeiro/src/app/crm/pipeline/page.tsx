"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineAnalytics } from "@/components/pipelines/pipeline-analytics";
import { Pipeline, PipelineStage } from "@prisma/client";
import { Deal } from "@/components/pipelines/deal-card";
import { useGlobalUnit } from "@/contexts/UnitContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePicker } from "@/components/ui/date-picker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBrazilianPhone } from "@/lib/phone";
import { ArrowDown, ArrowUp, Building2, CalendarDays, Check, ChevronDown, Eye, EyeOff, Loader2, MapPin, MessageCircle, Phone, Settings2, SlidersHorizontal, Trash2, X } from "lucide-react";

type PipelineStageView = PipelineStage & {
  baseName?: string;
  baseColor?: string;
  basePosition?: number;
  customName?: string | null;
  customColor?: string | null;
  customPosition?: number | null;
  isHidden?: boolean;
};
type PipelineWithStages = Pipeline & { stages?: PipelineStageView[] };
type ChatLinkState = {
  loading: boolean;
  available: boolean;
  canCreate?: boolean;
  url?: string;
  reason?: string;
};
type StageDraft = { name: string; color: string; isHidden: boolean };

function normalizeStageName(name?: string | null): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

function isDiscardStageName(name?: string | null): boolean {
  return ["perdido", "finalizado", "encerrado", "descartado", "sem_retorno", "nao_viavel"].includes(
    normalizeStageName(name),
  );
}

function sortStagesByPosition(stageList: PipelineStageView[]): PipelineStageView[] {
  return [...stageList].sort((a, b) => a.position - b.position);
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export default function PipelinePage() {
  const { globalUnit } = useGlobalUnit();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get("targetUserId") || "";
  const targetInstanceId = searchParams.get("targetInstanceId") || "";
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stages, setStages] = useState<PipelineStageView[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchSeqRef = useRef(0);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterOrder, setFilterOrder] = useState("recent");
  const [filterStageIds, setFilterStageIds] = useState<string[]>([]);
  const [canManageStages, setCanManageStages] = useState(false);

  // Modal for lost reason
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [dealToLose, setDealToLose] = useState<{ dealId: string; stageId: string } | null>(null);
  const [lostReason, setLostReason] = useState("");

  // Modal for Edit Deal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [dealToEdit, setDealToEdit] = useState<Deal | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [chatLink, setChatLink] = useState<ChatLinkState | null>(null);

  // Modal for pipeline columns
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [stageDrafts, setStageDrafts] = useState<Record<string, StageDraft>>({});
  const [stageSavingId, setStageSavingId] = useState<string | null>(null);
  const [stageMovingId, setStageMovingId] = useState<string | null>(null);

  const buildChatLinkParams = useCallback((dealId: string) => {
    const params = new URLSearchParams({ dealId });
    if (globalUnit) params.set("unit", globalUnit);
    if (targetUserId) params.set("targetUserId", targetUserId);
    if (targetInstanceId) params.set("targetInstanceId", targetInstanceId);
    return params;
  }, [globalUnit, targetInstanceId, targetUserId]);

  const fetchData = useCallback(async () => {
    const seq = fetchSeqRef.current + 1;
    fetchSeqRef.current = seq;
    setLoading(true);
    try {
      const pipelineParams = new URLSearchParams();
      if (targetUserId) pipelineParams.set("targetUserId", targetUserId);
      if (targetInstanceId) pipelineParams.set("targetInstanceId", targetInstanceId);
      const pipelineQuery = pipelineParams.toString();
      const res = await fetch(`/api/pipelines${pipelineQuery ? `?${pipelineQuery}` : ""}`);
      if (!res.ok) throw new Error("Failed to load pipelines");
      const data: PipelineWithStages[] = await res.json();
      
      if (data && data.length > 0) {
        const p = data.find((item) => !globalUnit || item.unit === globalUnit) || data[0];
        if (seq !== fetchSeqRef.current) return;
        setPipeline(p);
        const nextStages = p.stages || [];
        setStages(nextStages);
        const nextStageIds = new Set(nextStages.map((stage) => stage.id));
        setFilterStageIds((prev) => {
          const next = prev.filter((id) => nextStageIds.has(id));
          return areStringArraysEqual(prev, next) ? prev : next;
        });

        const params = new URLSearchParams({ pipelineId: p.id, order: filterOrder });
        if (globalUnit) params.set("unit", globalUnit);
        if (filterStartDate) params.set("startDate", filterStartDate);
        if (filterEndDate) params.set("endDate", filterEndDate);
        if (filterStageIds.length) params.set("stageId", filterStageIds.join(","));
        if (targetUserId) params.set("targetUserId", targetUserId);
        if (targetInstanceId) params.set("targetInstanceId", targetInstanceId);
        const dealsRes = await fetch(`/api/pipeline?${params}`);
        if (dealsRes.ok) {
          const dealsData = await dealsRes.json();
          if (seq !== fetchSeqRef.current) return;
          setDeals(dealsData);
        }
      }
    } catch (e) {
      toast.error("Erro ao carregar o funil");
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [filterStartDate, filterEndDate, filterOrder, filterStageIds, globalUnit, targetInstanceId, targetUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!editModalOpen || !dealToEdit) {
      setChatLink(null);
      return;
    }

    let cancelled = false;
    const params = buildChatLinkParams(dealToEdit.id);

    setChatLink({ loading: true, available: false });
    fetch(`/api/pipeline/chat-link?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setChatLink({
          loading: false,
          available: !!data.available,
          canCreate: !!data.canCreate,
          url: data.url,
          reason: data.reason || (res.ok ? undefined : "Chat indisponivel"),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setChatLink({ loading: false, available: false, reason: "Falha ao resolver conversa" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [buildChatLinkParams, dealToEdit, editModalOpen]);

  useEffect(() => {
    setFilterStageIds([]);
  }, [globalUnit]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const user = data?.user;
        const permissions = user?.permissions || {};
        setCanManageStages(user?.role === "ADMINISTRADOR" || permissions.admin === true || permissions.crmPipelineStages === true);
      })
      .catch(() => setCanManageStages(false));
  }, []);

  const updateDealStage = async (dealId: string, stageId: string, reason?: string) => {
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: dealId, 
          stageId,
          ...(reason ? { lostReason: reason } : {})
        }),
      });
      if (!res.ok) throw new Error();
      fetchData();
    } catch {
      toast.error("Erro ao mover o negócio");
      fetchData(); // revert optimistic
    }
  };

  const handleDealMoved = (dealId: string, newStageId: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stageId === newStageId) return;

    const stage = stages.find((s) => s.id === newStageId);
    
    // Optimistic UI update
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stageId: newStageId } : d))
    );

    // Etapas de descarte/encerramento precisam registrar motivo.
    if (isDiscardStageName(stage?.name)) {
      setDealToLose({ dealId, stageId: newStageId });
      setLostReason("");
      setLostModalOpen(true);
      return;
    }

    updateDealStage(dealId, newStageId);
    toast.success(`Movido para ${stage?.name || "nova fase"}`);
  };

  const confirmLost = () => {
    if (!dealToLose) return;
    updateDealStage(dealToLose.dealId, dealToLose.stageId, lostReason.trim() || "Encerrado sem motivo informado");
    setLostModalOpen(false);
    setDealToLose(null);
    toast.success("Negócio encerrado");
  };

  const cancelLost = () => {
    setLostModalOpen(false);
    setDealToLose(null);
    setLostReason("");
    fetchData();
  };

  const handleAddDeal = (stageId: string) => {
    toast.info("Criar negócio na fase selecionada");
  };

  const handleEditDeal = (deal: Deal) => {
    setDealToEdit(deal);
    setEditValue(deal.value?.toString() || "0");
    setEditDate(deal.closedAt ? new Date(deal.closedAt).toISOString().split('T')[0] : "");
    setEditNotes(deal.notes || "");
    setChatLink(null);
    setEditModalOpen(true);
  };

  const goToChat = async () => {
    if (chatLink?.available && chatLink.url) {
      router.push(chatLink.url);
      return;
    }
    if (!chatLink?.canCreate || !dealToEdit) return;

    setChatLink((current) => current ? { ...current, loading: true } : { loading: true, available: false });
    try {
      const params = buildChatLinkParams(dealToEdit.id);
      params.set("create", "1");
      const res = await fetch(`/api/pipeline/chat-link?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.available || !data.url) {
        throw new Error(data.reason || "Falha ao iniciar conversa");
      }
      setChatLink({
        loading: false,
        available: true,
        url: data.url,
        reason: data.reason,
      });
      router.push(data.url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Falha ao iniciar conversa";
      setChatLink({ loading: false, available: false, reason });
      toast.error(reason);
    }
  };

  const saveDealEdits = async () => {
    if (!dealToEdit) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dealToEdit.id,
          value: parseFloat(editValue) || 0,
          closedAt: editDate ? new Date(editDate).toISOString() : null,
          notes: editNotes,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Negócio atualizado!");
      setEditModalOpen(false);
      fetchData();
    } catch {
      toast.error("Erro ao atualizar o negócio");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDeal = async () => {
    if (!dealToEdit) return;
    if (!confirm(`Tem certeza que deseja excluir o negócio de ${dealToEdit.clientName}?`)) return;
    
    setIsSaving(true);
    try {
      const res = await fetch(`/api/pipeline?id=${dealToEdit.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Negócio excluído com sucesso!");
      setEditModalOpen(false);
      fetchData();
    } catch {
      toast.error("Erro ao excluir o negócio");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStageFilter = (stageId: string) => {
    setFilterStageIds((prev) => prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId]);
  };

  const clearPipelineFilters = () => {
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterOrder("recent");
    setFilterStageIds([]);
  };

  const openStageManager = () => {
    setStageDrafts(
      Object.fromEntries(
        sortStagesByPosition(stages).map((stage) => [
          stage.id,
          { name: stage.name, color: stage.color, isHidden: stage.isHidden === true },
        ]),
      )
    );
    setStageModalOpen(true);
  };

  const buildStagePreferenceUrl = () => {
    if (!pipeline) return "";
    const params = new URLSearchParams();
    if (targetUserId) params.set("targetUserId", targetUserId);
    if (targetInstanceId) params.set("targetInstanceId", targetInstanceId);
    const query = params.toString();
    return `/api/pipelines/${pipeline.id}/stages${query ? `?${query}` : ""}`;
  };

  const serializeStagePreferences = (
    stageList: PipelineStageView[],
    draftOverride: Record<string, StageDraft> = stageDrafts,
  ) =>
    sortStagesByPosition(stageList).map((stage, position) => {
      const draft = draftOverride[stage.id] || {
        name: stage.name,
        color: stage.color,
        isHidden: stage.isHidden === true,
      };
      return {
        id: stage.id,
        name: draft.name.trim() || stage.name,
        color: draft.color || stage.color,
        position,
        isHidden: draft.isHidden === true,
      };
    });

  const persistStagePreferences = async (
    stageList: PipelineStageView[],
    draftOverride?: Record<string, StageDraft>,
  ) => {
    const res = await fetch(buildStagePreferenceUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "user",
        stages: serializeStagePreferences(stageList, draftOverride),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erro ao salvar preferências das colunas");
  };

  const moveStage = async (stageId: string, direction: -1 | 1) => {
    if (!pipeline) return;

    const orderedStages = sortStagesByPosition(stages);
    const currentIndex = orderedStages.findIndex((stage) => stage.id === stageId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedStages.length) return;

    const reordered = [...orderedStages];
    const [movedStage] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, movedStage);
    const normalized = reordered.map((stage, position) => ({ ...stage, position }));

    setStageMovingId(stageId);
    setStages(normalized);
    try {
      await persistStagePreferences(normalized);
      toast.success("Ordem salva apenas neste perfil");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao reordenar colunas");
      await fetchData();
    } finally {
      setStageMovingId(null);
    }
  };

  const saveStage = async (stage: PipelineStageView) => {
    if (!pipeline) return;
    const draft = stageDrafts[stage.id];
    const name = draft?.name?.trim();
    if (!name) {
      toast.error("Informe o nome da coluna");
      return;
    }
    setStageSavingId(stage.id);
    try {
      const nextStages = stages.map((item) =>
        item.id === stage.id
          ? { ...item, name, color: draft.color, isHidden: draft.isHidden }
          : item,
      );
      setStages(nextStages);
      await persistStagePreferences(nextStages);
      toast.success("Coluna personalizada apenas neste perfil");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar coluna");
    } finally {
      setStageSavingId(null);
    }
  };

  const toggleStageVisibility = async (stage: PipelineStageView) => {
    if (!pipeline) return;
    const currentDraft = stageDrafts[stage.id] || {
      name: stage.name,
      color: stage.color,
      isHidden: stage.isHidden === true,
    };
    const nextHidden = !currentDraft.isHidden;
    const visibleCount = stages.filter((item) => {
      const draft = stageDrafts[item.id];
      return !(draft?.isHidden ?? item.isHidden === true);
    }).length;
    if (nextHidden && visibleCount <= 1) {
      toast.error("O funil precisa ter pelo menos uma coluna visível");
      return;
    }

    const nextDrafts = {
      ...stageDrafts,
      [stage.id]: { ...currentDraft, isHidden: nextHidden },
    };
    const nextStages = stages.map((item) =>
      item.id === stage.id ? { ...item, isHidden: nextHidden } : item,
    );

    setStageSavingId(stage.id);
    setStageDrafts(nextDrafts);
    setStages(nextStages);
    if (nextHidden) {
      setFilterStageIds((prev) => prev.filter((id) => id !== stage.id));
    }
    try {
      await persistStagePreferences(nextStages, nextDrafts);
      toast.success(nextHidden ? "Coluna ocultada apenas neste perfil" : "Coluna exibida neste perfil");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar visibilidade");
      await fetchData();
    } finally {
      setStageSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Nenhum funil encontrado. Execute a migração do banco de dados.
      </div>
    );
  }

  // Resumo dos filtros ativos — alimenta o badge do botão e os chips removíveis.
  const periodLabel = (() => {
    const fmt = (s: string) => s.split("-").reverse().join("/");
    if (filterStartDate && filterEndDate) return `${fmt(filterStartDate)} → ${fmt(filterEndDate)}`;
    if (filterStartDate) return `A partir de ${fmt(filterStartDate)}`;
    if (filterEndDate) return `Até ${fmt(filterEndDate)}`;
    return "";
  })();
  const hasPeriod = Boolean(filterStartDate || filterEndDate);
  const scopeLabel = globalUnit ? `Mostrando negócios de ${globalUnit}` : "Mostrando todos os negócios";
  const editPhone = formatBrazilianPhone(dealToEdit?.clientPhone);
  const editOriginUnit = dealToEdit?.clientOriginUnit || "Nao informado";
  const editCurrentUnit = dealToEdit?.clientUnit || dealToEdit?.unit || "Nao informado";
  const chatDisabled = !chatLink?.available || (!chatLink?.url && !chatLink?.canCreate) || chatLink.loading;
  const chatTooltip = chatLink?.loading
    ? "Resolvendo conversa..."
    : chatLink?.reason || "Chat indisponivel para este lead";
  const orderedStages = sortStagesByPosition(stages);
  const visibleStages = orderedStages.filter((stage) => stage.isHidden !== true);
  const visibleStageIds = new Set(visibleStages.map((stage) => stage.id));
  const visibleFilterStageIds = filterStageIds.filter((id) => visibleStageIds.has(id));
  const activeFilterCount =
    visibleFilterStageIds.length + (hasPeriod ? 1 : 0) + (filterOrder !== "recent" ? 1 : 0);
  const visibleDeals = deals.filter((deal) => !!deal.stageId && visibleStageIds.has(deal.stageId));

  return (
    <div className="absolute inset-0 flex flex-col bg-background px-4 sm:px-6 pt-4 sm:pt-6 pb-0">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {pipeline.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie suas vendas arrastando e soltando os negócios
          </p>
        </div>
        {canManageStages && (
          <Button variant="outline" size="sm" onClick={openStageManager} className="shrink-0 gap-2">
            <Settings2 className="h-4 w-4" />
            Gerenciar colunas
          </Button>
        )}
      </div>

      <div className="mb-4">
        <PipelineAnalytics stages={visibleStages} deals={visibleDeals} />
      </div>

      {/* Card único: filtros como cabeçalho (com divisória) + funil logo abaixo,
          mesma borda do início ao fim — sem caixas soltas desalinhadas. */}
      <div className="min-h-0 flex-1 flex flex-col rounded-t-xl border border-b-0 bg-card/50 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5 shrink-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              Filtrar
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="grid w-[420px] max-w-[calc(100vw-2rem)] gap-3 rounded-xl border-border bg-card p-3 shadow-xl">
              <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-2">
                <div>
                  <div className="text-sm font-bold text-foreground">Filtros do pipeline</div>
                  <div className="text-xs text-muted-foreground">Combine período, etapa e ordenação.</div>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearPipelineFilters}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Período
                </Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                  <div className="min-w-0">
                    <DatePicker value={filterStartDate} onChange={setFilterStartDate} variant="compact" calendarSize="small" placeholder="Data inicial" />
                  </div>
                  <span className="hidden text-center text-xs text-muted-foreground sm:block">até</span>
                  <div className="min-w-0">
                    <DatePicker value={filterEndDate} onChange={setFilterEndDate} variant="compact" calendarSize="small" placeholder="Data final" />
                  </div>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Ordenar
                </Label>
                <select
                  value={filterOrder}
                  onChange={(e) => setFilterOrder(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="recent">Mais recente primeiro</option>
                  <option value="oldest">Mais antigo primeiro</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Etapas
                </Label>
                <div className="grid max-h-44 gap-0.5 overflow-y-auto pr-1">
                  {visibleStages.map((stage) => {
                    const checked = filterStageIds.includes(stage.id);
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => toggleStageFilter(stage.id)}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                            checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"
                          }`}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                        <span className={`text-sm ${checked ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                          {stage.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>

        {hasPeriod && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
            <CalendarDays className="size-3 text-muted-foreground" />
            {periodLabel}
            <button
              type="button"
              onClick={() => { setFilterStartDate(""); setFilterEndDate(""); }}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        )}

        {visibleFilterStageIds.map((id) => {
          const stage = visibleStages.find((s) => s.id === id);
          if (!stage) return null;
          return (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: stage.color }} />
              {stage.name}
              <button
                type="button"
                onClick={() => toggleStageFilter(id)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}

        {filterOrder !== "recent" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
            Mais antigo primeiro
            <button
              type="button"
              onClick={() => setFilterOrder("recent")}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {activeFilterCount === 0 ? (
            <span>{scopeLabel}</span>
          ) : (
            <button type="button" onClick={clearPipelineFilters} className="font-semibold transition-colors hover:text-foreground">
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 flex flex-col p-4 overflow-hidden">
        <PipelineBoard
          stages={visibleStages}
          deals={visibleDeals}
          onDealMoved={handleDealMoved}
          onAddDeal={handleAddDeal}
          onEditDeal={handleEditDeal}
        />
      </div>
      </div>

      <Dialog open={lostModalOpen} onOpenChange={(open) => (open ? setLostModalOpen(true) : cancelLost())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo do Encerramento</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-2 text-sm text-muted-foreground">
              Por que este lead foi encerrado ou descartado?
            </p>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Ex: Sem retorno, não viável, sem interesse, valor incompatível, número inválido..."
              className="min-h-[100px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={cancelLost}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmLost}>
              Confirmar Encerramento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Editar Negócio: {dealToEdit?.clientName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    Telefone
                  </div>
                  <div className="truncate font-mono text-sm text-foreground">
                    {editPhone || "Sem telefone"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    Origem
                  </div>
                  <div className="truncate text-sm font-medium text-foreground">
                    {editOriginUnit}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Atual
                  </div>
                  <div className="truncate text-sm font-medium text-foreground">
                    {editCurrentUnit}
                  </div>
                </div>
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex w-full sm:w-fit" />}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={goToChat}
                      disabled={chatDisabled}
                      className="w-full gap-2 sm:w-fit"
                    >
                      {chatLink?.loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageCircle className="h-4 w-4" />
                      )}
                      {chatLink?.canCreate && !chatLink?.url ? "Iniciar conversa" : "Ir ao chat"}
                    </Button>
                  </TooltipTrigger>
                  {chatDisabled && (
                    <TooltipContent side="bottom" className="max-w-xs text-left">
                      {chatTooltip}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="value">Valor (R$)</Label>
              <Input
                id="value"
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="closedAt">Data de Fechamento</Label>
              <DatePicker value={editDate} onChange={setEditDate} variant="input" placeholder="Data de fechamento" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Pacote / Observações</Label>
              <Textarea
                id="notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Descreva o pacote ou anotações importantes..."
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-row sm:justify-between items-center w-full">
            <Button 
              variant="outline" 
              className="text-destructive hover:bg-destructive/10 hover:text-destructive border-transparent"
              onClick={deleteDeal}
              disabled={isSaving}
              type="button"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditModalOpen(false)} disabled={isSaving}>
                Cancelar
              </Button>
              <Button onClick={saveDealEdits} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stageModalOpen} onOpenChange={setStageModalOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Gerenciar colunas
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-sm font-bold text-foreground">Colunas existentes</div>
                  <div className="text-xs text-muted-foreground">Personalize nomes, cores, ordem e visibilidade só neste perfil.</div>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {visibleStages.length} visíveis de {orderedStages.length}
                </span>
              </div>
              <div className="grid max-h-[46vh] overflow-y-auto p-2">
                {orderedStages
                  .map((stage, index) => {
                    const draft = stageDrafts[stage.id] || {
                      name: stage.name,
                      color: stage.color,
                      isHidden: stage.isHidden === true,
                    };
                    const changed =
                      draft.name.trim() !== stage.name ||
                      draft.color !== stage.color ||
                      draft.isHidden !== (stage.isHidden === true);
                    const moving = stageMovingId === stage.id;
                    const saving = stageSavingId === stage.id;
                    const movementDisabled = !!stageMovingId || !!stageSavingId;
                    return (
                      <div
                        key={stage.id}
                        className={`grid gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40 sm:grid-cols-[74px_36px_1fr_auto_auto] sm:items-center ${
                          draft.isHidden ? "opacity-60" : ""
                        }`}
                      >
                        <div className="flex h-9 items-center gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() => moveStage(stage.id, -1)}
                            disabled={movementDisabled || index === 0}
                            title="Mover para cima"
                            aria-label={`Mover coluna ${stage.name} para cima`}
                            className="h-9 w-9"
                          >
                            {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() => moveStage(stage.id, 1)}
                            disabled={movementDisabled || index === orderedStages.length - 1}
                            title="Mover para baixo"
                            aria-label={`Mover coluna ${stage.name} para baixo`}
                            className="h-9 w-9"
                          >
                            {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />}
                          </Button>
                        </div>
                        <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-background">
                          <span className="h-5 w-5 rounded-md shadow-sm" style={{ backgroundColor: draft.color }} />
                          <Input
                            type="color"
                            value={draft.color}
                            onChange={(e) =>
                              setStageDrafts((prev) => ({
                                ...prev,
                                [stage.id]: { ...draft, color: e.target.value },
                              }))
                            }
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            aria-label={`Cor da coluna ${stage.name}`}
                          />
                        </label>
                        <Input
                          value={draft.name}
                          onChange={(e) =>
                            setStageDrafts((prev) => ({
                              ...prev,
                              [stage.id]: { ...draft, name: e.target.value },
                            }))
                          }
                          placeholder="Nome da coluna"
                          className="h-9"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant={changed ? "default" : "outline"}
                          onClick={() => saveStage(stage)}
                          disabled={!changed || !!stageMovingId || !!stageSavingId}
                          className="h-9 gap-2"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          {saving ? "Salvando..." : "Salvar"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => toggleStageVisibility(stage)}
                          disabled={!!stageMovingId || !!stageSavingId}
                          className="h-9 gap-2"
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : draft.isHidden ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                          {draft.isHidden ? "Mostrar" : "Ocultar"}
                        </Button>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStageModalOpen(false)} className="gap-2">
              <X className="h-4 w-4" />
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
