"use client";

import { SalesPipeline, PipelineStage } from "@prisma/client";
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

export type Deal = SalesPipeline & { stage?: PipelineStage };

interface DealCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  onEdit: (deal: Deal) => void;
  isOverlay?: boolean;
}

function initials(name?: string, fallback?: string) {
  const source = (name || fallback || "?").trim();
  if (!source) return "?";
  return source.charAt(0).toUpperCase();
}

export function DealCard({ deal, stage, onEdit, isOverlay }: DealCardProps) {
  return (
    <div
      onClick={() => {
        if (isOverlay) return;
        onEdit(deal);
      }}
      className={`group relative flex flex-col rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary select-none ${
        isOverlay ? "cursor-grabbing shadow-xl rotate-1 scale-105" : "cursor-grab"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-foreground line-clamp-1 break-all">
          {deal.clientName || "Sem Nome"}
        </h4>
        {deal.lostReason && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            <X className="h-3 w-3" />
            Perdido
          </span>
        )}
      </div>

      {deal.source && (
        <p className="mt-1 text-xs text-muted-foreground truncate">
          Origem: {deal.source}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold text-primary">
          {formatCurrency(deal.value, "BRL")}
        </span>
      </div>

      {deal.assignedName && (
        <div className="mt-2 flex items-center justify-end">
          <span
            title={deal.assignedName}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary"
          >
            {initials(deal.assignedName)}
          </span>
        </div>
      )}
    </div>
  );
}
