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
import { Trash2, CalendarIcon } from "lucide-react";

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

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

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/pipelines");
      if (!res.ok) throw new Error("Failed to load pipelines");
      const data = await res.json();
      
      if (data && data.length > 0) {
        const p = data[0]; // Load default pipeline
        setPipeline(p);
        setStages(p.stages || []);

        const dealsRes = await fetch(`/api/pipeline?pipelineId=${p.id}`);
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      </div>

      <PipelineAnalytics stages={stages} deals={deals} />

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
    </div>
  );
}
