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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-semibold text-green-500">
          {formatCurrency(deal.value, "BRL")}
        </span>
        
        {deal.source && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-sm truncate max-w-[100px] border border-border/50">
            {deal.source.toLowerCase() === 'whatsapp' ? (
              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
            ) : null}
            {deal.source}
          </span>
        )}
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
