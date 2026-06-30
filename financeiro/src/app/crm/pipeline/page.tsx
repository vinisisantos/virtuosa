"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineAnalytics } from "@/components/pipelines/pipeline-analytics";
import { Pipeline, PipelineStage, SalesPipeline } from "@prisma/client";
import { Deal } from "@/components/pipelines/deal-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Plus, Settings2, Trash2, X } from "lucide-react";

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Modal for pipeline columns
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [stageDrafts, setStageDrafts] = useState<Record<string, { name: string; color: string }>>({});
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#8b5cf6");
  const [stageSavingId, setStageSavingId] = useState<string | null>(null);
  const [addingStage, setAddingStage] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/pipelines");
      if (!res.ok) throw new Error("Failed to load pipelines");
      const data = await res.json();
      
      if (data && data.length > 0) {
        const p = data[0]; // Load default pipeline
        setPipeline(p);
        setStages(p.stages || []);

        const params = new URLSearchParams({ pipelineId: p.id, order: filterOrder });
        if (filterStartDate) params.set("startDate", filterStartDate);
        if (filterEndDate) params.set("endDate", filterEndDate);
        if (filterStageIds.length) params.set("stageId", filterStageIds.join(","));
        const dealsRes = await fetch(`/api/pipeline?${params}`);
        if (dealsRes.ok) {
          const dealsData = await dealsRes.json();
          setDeals(dealsData);
        }
      }
    } catch (e) {
      toast.error("Erro ao carregar o funil");
    } finally {
      setLoading(false);
    }
  }, [filterStartDate, filterEndDate, filterOrder, filterStageIds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

    // If moving to "Perdido"
    if (stage?.name.toLowerCase() === "perdido") {
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
    updateDealStage(dealToLose.dealId, dealToLose.stageId, lostReason);
    setLostModalOpen(false);
    setDealToLose(null);
    toast.success("Negócio marcado como Perdido");
  };

  const handleAddDeal = (stageId: string) => {
    toast.info("Criar negócio na fase selecionada");
  };

  const handleEditDeal = (deal: Deal) => {
    setDealToEdit(deal);
    setEditValue(deal.value?.toString() || "0");
    setEditDate(deal.closedAt ? new Date(deal.closedAt).toISOString().split('T')[0] : "");
    setEditNotes(deal.notes || "");
    setEditModalOpen(true);
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

      <PipelineAnalytics stages={stages} deals={deals} />

      <div className="mb-4 rounded-xl border border-border bg-card/70 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Filtros do pipeline</h2>
            <p className="mt-1 text-xs text-muted-foreground">Combine período, etapa e ordenação.</p>
          </div>
          <Button variant="outline" size="sm" onClick={clearPipelineFilters}>
            Limpar filtros
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Período inicial</Label>
            <Input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Período final</Label>
            <Input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ordenar</Label>
            <select value={filterOrder} onChange={(e) => setFilterOrder(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="recent">Mais recente primeiro</option>
              <option value="oldest">Mais antigo primeiro</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {stages.map((stage) => (
            <button
              key={stage.id}
              type="button"
              onClick={() => toggleStageFilter(stage.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                filterStageIds.includes(stage.id)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {stage.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 flex flex-col rounded-t-xl border border-b-0 bg-card/50 p-4 overflow-hidden">
        <PipelineBoard
          stages={stages}
          deals={deals}
          onDealMoved={handleDealMoved}
          onAddDeal={handleAddDeal}
          onEditDeal={handleEditDeal}
        />
      </div>

      <Dialog open={lostModalOpen} onOpenChange={setLostModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da Perda</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-2 text-sm text-muted-foreground">
              Por que este negócio foi perdido?
            </p>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Ex: Preço, Concorrente, Desistiu..."
              className="min-h-[100px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLostModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmLost}>
              Confirmar Perda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Negócio: {dealToEdit?.clientName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
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
              <Input
                id="closedAt"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
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
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Gerenciar colunas do pipeline</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Colunas existentes
              </div>
              <div className="grid gap-2">
                {stages
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((stage) => {
                    const draft = stageDrafts[stage.id] || { name: stage.name, color: stage.color };
                    const changed = draft.name.trim() !== stage.name || draft.color !== stage.color;
                    return (
                      <div key={stage.id} className="grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-[44px_1fr_auto] sm:items-center">
                        <Input
                          type="color"
                          value={draft.color}
                          onChange={(e) =>
                            setStageDrafts((prev) => ({
                              ...prev,
                              [stage.id]: { ...draft, color: e.target.value },
                            }))
                          }
                          className="h-10 w-11 p-1"
                          aria-label={`Cor da coluna ${stage.name}`}
                        />
                        <Input
                          value={draft.name}
                          onChange={(e) =>
                            setStageDrafts((prev) => ({
                              ...prev,
                              [stage.id]: { ...draft, name: e.target.value },
                            }))
                          }
                          placeholder="Nome da coluna"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => saveStage(stage)}
                          disabled={!changed || stageSavingId === stage.id}
                          className="gap-2"
                        >
                          <Check className="h-4 w-4" />
                          Salvar
                        </Button>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nova coluna
              </div>
              <div className="grid gap-2 sm:grid-cols-[44px_1fr_auto] sm:items-center">
                <Input
                  type="color"
                  value={newStageColor}
                  onChange={(e) => setNewStageColor(e.target.value)}
                  className="h-10 w-11 p-1"
                  aria-label="Cor da nova coluna"
                />
                <Input
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="Ex: Retorno agendado"
                />
                <Button type="button" onClick={addStage} disabled={addingStage} className="gap-2">
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
