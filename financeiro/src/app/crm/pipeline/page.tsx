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
import { Building2, CalendarDays, Check, ChevronDown, Loader2, MapPin, MessageCircle, Phone, Plus, Settings2, SlidersHorizontal, Trash2, X } from "lucide-react";

type PipelineWithStages = Pipeline & { stages?: PipelineStage[] };
type ChatLinkState = {
  loading: boolean;
  available: boolean;
  url?: string;
  reason?: string;
};

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

export default function PipelinePage() {
  const { globalUnit } = useGlobalUnit();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get("targetUserId") || "";
  const targetInstanceId = searchParams.get("targetInstanceId") || "";
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
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
  const [stageDrafts, setStageDrafts] = useState<Record<string, { name: string; color: string }>>({});
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#8b5cf6");
  const [stageSavingId, setStageSavingId] = useState<string | null>(null);
  const [addingStage, setAddingStage] = useState(false);

  const fetchData = useCallback(async () => {
    const seq = fetchSeqRef.current + 1;
    fetchSeqRef.current = seq;
    setLoading(true);
    try {
      const res = await fetch("/api/pipelines");
      if (!res.ok) throw new Error("Failed to load pipelines");
      const data: PipelineWithStages[] = await res.json();
      
      if (data && data.length > 0) {
        const p = data.find((item) => !globalUnit || item.unit === globalUnit) || data[0];
        if (seq !== fetchSeqRef.current) return;
        setPipeline(p);
        setStages(p.stages || []);

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
    const params = new URLSearchParams({ dealId: dealToEdit.id });
    if (globalUnit) params.set("unit", globalUnit);
    if (targetUserId) params.set("targetUserId", targetUserId);
    if (targetInstanceId) params.set("targetInstanceId", targetInstanceId);

    setChatLink({ loading: true, available: false });
    fetch(`/api/pipeline/chat-link?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setChatLink({
          loading: false,
          available: !!data.available,
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
  }, [dealToEdit, editModalOpen, globalUnit, targetInstanceId, targetUserId]);

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

  const goToChat = () => {
    if (chatLink?.available && chatLink.url) router.push(chatLink.url);
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
      Object.fromEntries(stages.map((stage) => [stage.id, { name: stage.name, color: stage.color }]))
    );
    setNewStageName("");
    setNewStageColor("#8b5cf6");
    setStageModalOpen(true);
  };

  const saveStage = async (stage: PipelineStage) => {
    if (!pipeline) return;
    const draft = stageDrafts[stage.id];
    const name = draft?.name?.trim();
    if (!name) {
      toast.error("Informe o nome da coluna");
      return;
    }
    setStageSavingId(stage.id);
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/stages/${stage.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: draft.color }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao atualizar coluna");
      toast.success("Coluna atualizada");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar coluna");
    } finally {
      setStageSavingId(null);
    }
  };

  const addStage = async () => {
    if (!pipeline) return;
    const name = newStageName.trim();
    if (!name) {
      toast.error("Informe o nome da nova coluna");
      return;
    }
    setAddingStage(true);
    try {
      const nextPosition = stages.length ? Math.max(...stages.map((stage) => stage.position)) + 1 : 0;
      const res = await fetch(`/api/pipelines/${pipeline.id}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newStageColor, position: nextPosition }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao criar coluna");
      toast.success("Coluna adicionada ao pipeline");
      setNewStageName("");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar coluna");
    } finally {
      setAddingStage(false);
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
  const activeFilterCount =
    filterStageIds.length + (hasPeriod ? 1 : 0) + (filterOrder !== "recent" ? 1 : 0);
  const scopeLabel = globalUnit ? `Mostrando negócios de ${globalUnit}` : "Mostrando todos os negócios";
  const editPhone = formatBrazilianPhone(dealToEdit?.clientPhone);
  const editOriginUnit = dealToEdit?.clientOriginUnit || "Nao informado";
  const editCurrentUnit = dealToEdit?.clientUnit || dealToEdit?.unit || "Nao informado";
  const chatDisabled = !chatLink?.available || !chatLink?.url || chatLink.loading;
  const chatTooltip = chatLink?.loading
    ? "Resolvendo conversa..."
    : chatLink?.reason || "Chat indisponivel para este lead";

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
        <PipelineAnalytics stages={stages} deals={deals} />
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
                  {stages.map((stage) => {
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

        {filterStageIds.map((id) => {
          const stage = stages.find((s) => s.id === id);
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
          stages={stages}
          deals={deals}
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
                      Ir ao chat
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
                  <div className="text-xs text-muted-foreground">Edite nomes e cores sem alterar os negócios.</div>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {stages.length} colunas
                </span>
              </div>
              <div className="grid max-h-[46vh] overflow-y-auto p-2">
                {stages
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((stage) => {
                    const draft = stageDrafts[stage.id] || { name: stage.name, color: stage.color };
                    const changed = draft.name.trim() !== stage.name || draft.color !== stage.color;
                    return (
                      <div key={stage.id} className="grid gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40 sm:grid-cols-[36px_1fr_auto] sm:items-center">
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
                          disabled={!changed || stageSavingId === stage.id}
                          className="h-9 gap-2"
                        >
                          <Check className="h-4 w-4" />
                          Salvar
                        </Button>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-foreground">Nova coluna</div>
                  <div className="text-xs text-muted-foreground">Ela será adicionada ao final do funil.</div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[36px_1fr_auto] sm:items-center">
                <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-background">
                  <span className="h-5 w-5 rounded-md shadow-sm" style={{ backgroundColor: newStageColor }} />
                  <Input
                    type="color"
                    value={newStageColor}
                    onChange={(e) => setNewStageColor(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Cor da nova coluna"
                  />
                </label>
                <Input
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="Ex: Retorno agendado"
                  className="h-9"
                />
                <Button type="button" onClick={addStage} disabled={addingStage} className="h-9 gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
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
