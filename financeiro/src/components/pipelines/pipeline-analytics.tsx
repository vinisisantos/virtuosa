"use client";

import { useMemo } from "react";
import { PipelineStage } from "@prisma/client";
import { Deal } from "./deal-card";
import {
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
  BadgeCheck,
  CircleDollarSign,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { formatCurrency } from "@/lib/currency";
import { isNotLeadSource } from "@/lib/lead-source";

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

    const isClosed = (deal: Deal) => {
      const stage = deal.stageId ? stageById.get(deal.stageId) : undefined;
      return normalizeStageName(stage?.name || deal.stage) === "fechado";
    };

    // A visão comercial do funil mede apenas leads. Vendas diretas da clínica
    // continuam nos cards e relatórios, mas não distorcem estes indicadores.
    const leadDeals = deals.filter((deal) => !isNotLeadSource(deal.source));
    const eligibleLeads = leadDeals.filter((deal) => !isDiscarded(deal));
    const closedLeads = eligibleLeads.filter(isClosed);
    const openLeads = eligibleLeads.filter((deal) => !isClosed(deal));

    const openValue = openLeads.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    const closedValue = closedLeads.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
    const avgValue = closedLeads.length > 0 ? closedValue / closedLeads.length : 0;

    return {
      openCount: openLeads.length,
      openValue,
      closedCount: closedLeads.length,
      closedValue,
      avgValue,
      conversionRate: eligibleLeads.length > 0 ? (closedLeads.length / eligibleLeads.length) * 100 : 0,
    };
  }, [deals, sortedStages]);

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/50 bg-border/60 shadow-sm md:grid-cols-3 xl:grid-cols-6">
        <Metric
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          label="Leads abertos"
          value={String(stats.openCount)}
          tooltip="Quantidade de leads em etapas abertas. Vendas diretas e negócios fechados não entram neste total."
        />
        <Metric
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="Valor em aberto"
          value={formatCurrency(stats.openValue, defaultCurrency)}
          tooltip="Soma dos valores dos leads que ainda estão em etapas abertas. Vendas diretas e fechamentos não entram neste total."
        />
        <Metric
          icon={<BadgeCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />}
          label="Leads ganhos"
          value={String(stats.closedCount)}
          tooltip="Quantidade de leads na etapa Fechado. Registros marcados como Não é lead ficam fora deste indicador."
        />
        <Metric
          icon={<CircleDollarSign className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />}
          label="Receita de leads"
          value={formatCurrency(stats.closedValue, defaultCurrency)}
          tooltip="Receita dos leads na etapa Fechado. Vendas diretas da clínica permanecem disponíveis nos relatórios, mas não entram neste valor."
        />
        <Metric
          icon={<Target className="h-4 w-4 text-blue-700 dark:text-blue-400" />}
          label="Ticket Médio"
          value={formatCurrency(stats.avgValue, defaultCurrency)}
          tooltip="Receita dos leads fechados dividida pela quantidade de leads ganhos. Vendas diretas não entram no cálculo."
        />
        <Metric
          icon={<TrendingUp className="h-4 w-4 text-purple-700 dark:text-purple-400" />}
          label="Conversão"
          value={`${Math.round(stats.conversionRate)}%`}
          tooltip="Percentual de leads fechados entre os leads não descartados do funil. Vendas diretas não entram no cálculo."
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
    <div className="flex min-w-0 flex-col justify-center bg-card p-2.5 transition-colors hover:bg-muted sm:px-3 sm:py-2.5 2xl:flex-row 2xl:items-center 2xl:justify-between 2xl:gap-3 2xl:py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:mb-1.5 sm:gap-2 2xl:mb-0 2xl:min-w-0 2xl:flex-1">
        <div className="flex shrink-0 items-center justify-center rounded-md bg-muted/50 p-1">
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
      <p className="mt-0.5 break-words text-lg font-bold leading-tight text-foreground sm:text-xl 2xl:mt-0 2xl:shrink-0 2xl:text-lg">{value}</p>
    </div>
  );
}
