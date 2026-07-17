"use client";

import { useMemo } from "react";
import { PipelineStage } from "@prisma/client";
import { Deal } from "./deal-card";
import {
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { formatCurrency } from "@/lib/currency";

interface PipelineAnalyticsProps {
  stages: PipelineStage[];
  deals: Deal[];
}

function normalizeStageName(name?: string | null): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

function isDiscardStage(stage?: PipelineStage | null): boolean {
  return ['perdido', 'finalizado', 'encerrado', 'descartado', 'sem_retorno', 'nao_viavel'].includes(
    normalizeStageName(stage?.name),
  );
}

export function PipelineAnalytics({ stages, deals }: PipelineAnalyticsProps) {
  const defaultCurrency = "BRL";
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const stats = useMemo(() => {
    const stageById = new Map(sortedStages.map((s) => [s.id, s]));
    const isDiscarded = (deal: Deal) => {
      const stage = deal.stageId ? stageById.get(deal.stageId) : undefined;
      return !!deal.lostReason || isDiscardStage(stage);
    };

    // Descartes/encerrados não entram no funil ativo.
    const active = deals.filter((d) => !isDiscarded(d));
    const closedDeals = active.filter((deal) => {
      const stage = deal.stageId ? stageById.get(deal.stageId) : undefined;
      return normalizeStageName(stage?.name || deal.stage) === "fechado";
    });

    const totalCount = active.length;
    const totalValue = active.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const closedValue = closedDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    const avgValue = closedDeals.length > 0 ? closedValue / closedDeals.length : 0;

    return {
      totalCount,
      totalValue,
      avgValue,
      conversionRate: totalCount > 0 ? (closedDeals.length / totalCount) * 100 : 0,
    };
  }, [deals, sortedStages]);

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/50 bg-border/60 shadow-sm lg:grid-cols-4">
        <Metric
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          label="Negócios"
          value={String(stats.totalCount)}
          tooltip="Quantidade total de negócios neste funil que não foram encerrados/descartados. Negócios Fechados continuam inclusos."
        />
        <Metric
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="Valor do Funil"
          value={formatCurrency(stats.totalValue, defaultCurrency)}
          tooltip="Soma dos valores de todos os negócios neste funil, excluindo negócios encerrados/descartados."
        />
        <Metric
          icon={<Target className="h-4 w-4 text-blue-400" />}
          label="Ticket Médio"
          value={formatCurrency(stats.avgValue, defaultCurrency)}
          tooltip="Soma dos valores dos negócios Fechados dividida pela quantidade de contatos Fechados."
        />
        <Metric
          icon={<TrendingUp className="h-4 w-4 text-purple-400" />}
          label="Conversão"
          value={`${Math.round(stats.conversionRate)}%`}
          tooltip="Percentual de negócios fechados entre todos os negócios ativos do funil."
        />
      </div>
    </TooltipProvider>
  );
}

function Metric({
  icon,
  label,
  value,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tooltip: string;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center bg-card p-3 transition-colors hover:bg-muted sm:p-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:mb-2 sm:gap-2">
        <div className="flex shrink-0 items-center justify-center rounded-md bg-muted/50 p-1 sm:p-1.5">
          {icon}
        </div>
        <span>{label}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Info sobre ${label}`}
                className="ml-auto text-muted-foreground hover:text-foreground focus:outline-none"
              />
            }
          >
            <Info className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-left">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-1 break-words text-lg font-bold leading-tight text-foreground sm:text-xl">{value}</p>
    </div>
  );
}
