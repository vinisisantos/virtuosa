"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineAnalytics } from "@/components/pipelines/pipeline-analytics";
import { Pipeline, PipelineStage, SalesPipeline } from "@prisma/client";
import { Deal } from "@/components/pipelines/deal-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal for lost reason
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [dealToLose, setDealToLose] = useState<{ dealId: string; stageId: string } | null>(null);
  const [lostReason, setLostReason] = useState("");

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
    toast.info(`Editar negócio: ${deal.clientName}`);
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
    <div className="flex h-full flex-col -m-4 sm:-m-6 px-4 sm:px-6 pt-4 sm:pt-6 pb-0 bg-background">
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

      <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-t-xl border border-b-0 bg-card/50">
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
            <DialogTitle>Marcar como Perdido</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Por que esta oportunidade foi perdida?
            </p>
            <Textarea
              placeholder="Motivo da perda (opcional)..."
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLostModalOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={confirmLost}>
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
