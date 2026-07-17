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
    const openDeals = active.filter((d) => !d.closedAt);
    const closedDeals = active.filter((deal) => {
      const stage = deal.stageId ? stageById.get(deal.stageId) : undefined;
      return normalizeStageName(stage?.name || deal.stage) === "fechado";
    });

    const totalCount = active.length;
    const totalValue = active.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const closedValue = closedDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    const avgValue = closedDeals.length > 0 ? closedValue / closedDeals.length : 0;

    const weightedValue = openDeals.reduce((sum, d) => {
      const stage = d.stageId ? stageById.get(d.stageId) : undefined;
      if (!stage) return sum;
      const prob = computeStageProbability(stage, sortedStages);
      return sum + Number(d.value || 0) * prob;
    }, 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = (value?: string | Date | null) => {
      const ts = value;
      return ts ? new Date(ts) >= monthStart : false;
    };
    const wonThisMonth = deals.filter(
      (d) => d.closedAt && !isDiscarded(d) && thisMonth(d.closedAt),
    ).length;
    const lostThisMonth = deals.filter(
      (d) => isDiscarded(d) && thisMonth(d.closedAt ?? d.updatedAt ?? d.createdAt),
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
      <div className="grid grid-cols-2 gap-2 rounded-xl border-0 bg-transparent p-0 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <Metric
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          label="Total de Negócios"
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
          label="Valor Ponderado"
          value={formatCurrency(stats.weightedValue, defaultCurrency)}
          tooltip="Receita esperada: valor de cada negócio aberto × a probabilidade de seu estágio. Estágio inicial ≈ 10%, estágios avançam até 90%, Fechado = 100%. Negócios encerrados/descartados são excluídos."
        />
        <Metric
          icon={<Trophy className="h-4 w-4 text-primary" />}
          label="Fechados no Mês"
          value={String(stats.wonThisMonth)}
          tooltip="Negócios marcados como Fechados desde o primeiro dia do mês atual."
        />
        <Metric
          icon={<XCircle className="h-4 w-4 text-red-400" />}
          label="Encerrados no Mês"
          value={String(stats.lostThisMonth)}
          tooltip="Negócios encerrados/descartados desde o primeiro dia do mês atual."
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
    <div className="flex min-w-0 flex-col justify-center rounded-xl border border-border/50 bg-card p-3 shadow-sm transition-all hover:shadow-md sm:p-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/80 sm:mb-2 sm:gap-2 sm:text-[10px] sm:tracking-wider">
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
