"use client";

import { useMemo } from "react";
import { PipelineStage } from "@prisma/client";
import { Deal } from "./deal-card";
import {
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
  Trophy,
  XCircle,
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

/**
 * Weighted pipeline value: value × per-stage probability.
 * First stage ≈ 10%, stages interpolate up to 90% before the final stage,
 * final stage (Won) = 100%. Lost deals excluded.
 */
function computeStageProbability(
  stage: PipelineStage,
  sortedStages: PipelineStage[],
): number {
  const n = sortedStages.length;
  if (n <= 1) return 1;
  const index = sortedStages.findIndex((s) => s.id === stage.id);
  if (index < 0) return 0;
  if (index === n - 1) return 1;
  const slots = n - 1;
  if (slots <= 1) return 0.1;
  const t = index / (slots - 1);
  return 0.1 + t * (0.9 - 0.1);
}

export function PipelineAnalytics({ stages, deals }: PipelineAnalyticsProps) {
  const defaultCurrency = "BRL";
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const stats = useMemo(() => {
    // We determine lost by lostReason or closedAt + lost
    const active = deals.filter((d) => !d.lostReason);
    const openDeals = active.filter((d) => !d.closedAt);

    const totalCount = active.length;
    const totalValue = active.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const avgValue = totalCount > 0 ? totalValue / totalCount : 0;

    const stageById = new Map(sortedStages.map((s) => [s.id, s]));
    const weightedValue = openDeals.reduce((sum, d) => {
      const stage = d.stageId ? stageById.get(d.stageId) : undefined;
      if (!stage) return sum;
      const prob = computeStageProbability(stage, sortedStages);
      return sum + Number(d.value || 0) * prob;
    }, 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = (d: Deal) => {
      const ts = d.updatedAt ?? d.createdAt;
      return ts ? new Date(ts) >= monthStart : false;
    };
    const wonThisMonth = deals.filter(
      (d) => d.closedAt && !d.lostReason && thisMonth(d),
    ).length;
    const lostThisMonth = deals.filter(
      (d) => !!d.lostReason && thisMonth(d),
    ).length;

    return {
      totalCount,
      totalValue,
      avgValue,
      weightedValue,
      wonThisMonth,
      lostThisMonth,
    };
  }, [deals, sortedStages]);

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card/60 p-4 sm:grid-cols-3 xl:grid-cols-6">
        <Metric
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          label="Total de Negócios"
          value={String(stats.totalCount)}
          tooltip="Quantidade total de negócios neste funil que não foram marcados como Perdidos. Negócios Fechados continuam inclusos."
        />
        <Metric
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="Valor do Funil"
          value={formatCurrency(stats.totalValue, defaultCurrency)}
          tooltip="Soma dos valores de todos os negócios neste funil, excluindo negócios marcados como Perdidos."
        />
        <Metric
          icon={<Target className="h-4 w-4 text-blue-400" />}
          label="Ticket Médio"
          value={formatCurrency(stats.avgValue, defaultCurrency)}
          tooltip="Valor do Funil dividido pelo Total de Negócios — o valor médio de um negócio que não foi perdido."
        />
        <Metric
          icon={<TrendingUp className="h-4 w-4 text-purple-400" />}
          label="Valor Ponderado"
          value={formatCurrency(stats.weightedValue, defaultCurrency)}
          tooltip="Receita esperada: valor de cada negócio aberto × a probabilidade de seu estágio. Estágio inicial ≈ 10%, estágios avançam até 90%, Fechado = 100%. Negócios Perdidos são excluídos."
        />
        <Metric
          icon={<Trophy className="h-4 w-4 text-primary" />}
          label="Fechados no Mês"
          value={String(stats.wonThisMonth)}
          tooltip="Negócios marcados como Fechados desde o primeiro dia do mês atual."
        />
        <Metric
          icon={<XCircle className="h-4 w-4 text-red-400" />}
          label="Perdidos no Mês"
          value={String(stats.lostThisMonth)}
          tooltip="Negócios marcados como Perdidos desde o primeiro dia do mês atual."
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
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Info sobre ${label}`}
              className="ml-auto text-muted-foreground hover:text-foreground focus:outline-none"
            >
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-left">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}
