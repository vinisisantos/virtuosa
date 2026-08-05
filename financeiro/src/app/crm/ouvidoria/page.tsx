"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  type LucideIcon,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  List,
  Loader2,
  MessageCircle,
  PackageCheck,
  PencilLine,
  TrendingUp,
  UserCheck,
  UserRound,
  UserX,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SaleItemsEditor } from "@/components/pipelines/sale-items-editor";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatalogService } from "@/components/procedure-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useGlobalUnit } from "@/contexts/UnitContext";
import { formatCurrency } from "@/lib/currency";
import { millisecondsUntilNextSaoPauloDay, saoPauloDateKey } from "@/lib/date-filter";
import {
  saleItemDraftsFromCampaignOffer,
  saleItemDraftsFromView,
  saleItemsTotal,
  type CampaignOfferView,
  type PipelineSaleItemView,
  type SaleItemDraft,
} from "@/lib/pipeline/sale-item-types";
import {
  buildEvaluationReason,
  EVALUATION_NOT_CLOSED_REASONS,
  EVALUATION_NO_SHOW_REASONS,
} from "@/lib/evaluation-outcome";
import {
  EVALUATION_STATUS_LABELS,
  EVALUATION_STATUS_VALUES,
  type EvaluationStatus,
  isAttendedEvaluationStatus,
  isClosedPackageEvaluationStatus,
  isFinalEvaluationStatus,
  isNoResponseEvaluationStatus,
  isNoShowEvaluationStatus,
  isNotClosedEvaluationStatus,
  isPendingEvaluationStatus,
  normalizeEvaluationStatus,
} from "@/lib/evaluation-status";

type Professional = {
  id: string;
  name: string;
  color: string;
};

type Evaluation = {
  id: string;
  clientName: string;
  clientPhone?: string | null;
  procedimento: string;
  status: string;
  unit: string;
  startTime: string;
  endTime: string;
  profissional?: Professional | null;
  pipelineDealId?: string | null;
  pipelineValue?: number | null;
  pipelineProcedureName?: string | null;
  pipelineProcedureNames?: string[];
  pipelineSaleItems?: PipelineSaleItemView[];
  pipelineStage?: string | null;
  pipelineClosedAt?: string | null;
  outcomeReason?: string | null;
};

type ChatLinkState = {
  loading: boolean;
  available: boolean;
  canCreate?: boolean;
  url?: string;
  reason?: string;
};

type StatusUiConfig = {
  description: string;
  dotClass: string;
  badgeClass: string;
  cardClass: string;
  actionClass: string;
};

type OutcomeFlow =
  | "attended_decision"
  | "closed"
  | "not_closed"
  | "no_show_decision"
  | "no_show_reschedule"
  | "no_show_reason"
  | null;

const STATUS_UI: Record<EvaluationStatus, StatusUiConfig> = {
  pendente: {
    description: "Ainda aguardando avaliação ou desfecho.",
    dotClass: "bg-violet-600 dark:bg-violet-400",
    badgeClass: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200",
    cardClass: "border-violet-200 bg-violet-50/70 hover:border-violet-300 hover:bg-violet-100/70 dark:border-violet-500/25 dark:bg-violet-500/5 dark:hover:border-violet-500/45 dark:hover:bg-violet-500/10",
    actionClass: "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100 dark:hover:bg-violet-500/20",
  },
  compareceu: {
    description: "Cliente compareceu, mas o resultado comercial ainda não foi definido.",
    dotClass: "bg-sky-600 dark:bg-sky-400",
    badgeClass: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-200",
    cardClass: "border-sky-200 bg-sky-50/70 hover:border-sky-300 hover:bg-sky-100/70 dark:border-sky-500/25 dark:bg-sky-500/5 dark:hover:border-sky-500/45 dark:hover:bg-sky-500/10",
    actionClass: "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100 dark:hover:bg-sky-500/20",
  },
  fechou_pacote: {
    description: "Avaliação convertida em venda/pacote.",
    dotClass: "bg-emerald-600 dark:bg-emerald-400",
    badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200",
    cardClass: "border-emerald-200 bg-emerald-50/70 hover:border-emerald-300 hover:bg-emerald-100/70 dark:border-emerald-500/25 dark:bg-emerald-500/5 dark:hover:border-emerald-500/45 dark:hover:bg-emerald-500/10",
    actionClass: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:hover:bg-emerald-500/20",
  },
  nao_fechou: {
    description: "Cliente avaliou, mas não comprou.",
    dotClass: "bg-rose-600 dark:bg-rose-400",
    badgeClass: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200",
    cardClass: "border-rose-200 bg-rose-50/70 hover:border-rose-300 hover:bg-rose-100/70 dark:border-rose-500/25 dark:bg-rose-500/5 dark:hover:border-rose-500/45 dark:hover:bg-rose-500/10",
    actionClass: "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100 dark:hover:bg-rose-500/20",
  },
  nao_compareceu: {
    description: "Cliente não compareceu à avaliação.",
    dotClass: "bg-amber-600 dark:bg-amber-400",
    badgeClass: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200",
    cardClass: "border-amber-200 bg-amber-50/70 hover:border-amber-300 hover:bg-amber-100/70 dark:border-amber-500/25 dark:bg-amber-500/5 dark:hover:border-amber-500/45 dark:hover:bg-amber-500/10",
    actionClass: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/20",
  },
  nao_respondeu: {
    description: "Cliente não respondeu às tentativas de contato.",
    dotClass: "bg-slate-500 dark:bg-slate-400",
    badgeClass: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/15 dark:text-slate-200",
    cardClass: "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-slate-100/70 dark:border-slate-500/25 dark:bg-slate-500/5 dark:hover:border-slate-500/45 dark:hover:bg-slate-500/10",
    actionClass: "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-100 dark:hover:bg-slate-500/20",
  },
};

const FINAL_PIPELINE_STAGES = new Set(["perdido", "finalizado", "encerrado", "descartado", "sem_retorno", "nao_viavel"]);

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function dateKey(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function fullDateLabelFromKey(key: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(dateFromKey(key));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function timeInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "09:00";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function buildLocalDateTime(date: string, time: string) {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfWeek(date: Date) {
  const end = startOfWeek(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function fullDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeStageName(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

function getEffectiveStatus(evaluation: Evaluation): EvaluationStatus {
  const status = normalizeEvaluationStatus(evaluation.status);
  if (!isPendingEvaluationStatus(status) && status !== "compareceu") return status;

  const pipelineStage = normalizeStageName(evaluation.pipelineStage);
  if (pipelineStage === "fechado") return "fechou_pacote";
  if (FINAL_PIPELINE_STAGES.has(pipelineStage)) return "nao_fechou";

  return status;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function buildCalendarDays(month: Date) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const days: Date[] = [];
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  while (cursor <= last || cursor.getDay() !== 0) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  iconClass: string;
}) {
  return (
    <div className="h-full min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</div>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8 ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-1.5 min-h-7 break-words text-lg font-bold leading-tight text-foreground sm:mt-2 sm:min-h-8 sm:text-xl">{value}</div>
      {hint && <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">{hint}</div>}
    </div>
  );
}

function PrimaryMetric({
  label,
  value,
  hint,
  icon: Icon,
  iconClass,
  className = "",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  iconClass: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 px-3 py-3.5 sm:px-4 lg:flex lg:min-h-[86px] lg:items-center lg:px-5 lg:py-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-3 lg:items-center">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl lg:h-9 lg:w-9 ${iconClass}`}>
          <Icon className="h-5 w-5 lg:h-4 lg:w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
            {label}
          </div>
          <div className="mt-1 text-xl font-bold leading-none text-foreground lg:text-lg">{value}</div>
          {hint && (
            <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
              {hint}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EvaluationAgendaList({
  entries,
  onOpenEvaluation,
}: {
  entries: Array<[string, Evaluation[]]>;
  onOpenEvaluation: (evaluationId: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center px-4 py-10 text-center">
        <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-semibold text-foreground">Nenhuma avaliação neste período</p>
        <p className="mt-1 text-xs text-muted-foreground">As próximas avaliações aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {entries.map(([key, dayEvaluations]) => {
        const day = dateFromKey(key);
        const label = new Intl.DateTimeFormat("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        }).format(day);
        return (
          <section key={key} className="p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground">{label}</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {dayEvaluations.length}
              </span>
            </div>
            {dayEvaluations.length > 0 ? (
              <div className="grid gap-2 lg:grid-cols-2">
                {dayEvaluations.map((evaluation) => (
                  <EvaluationCardButton
                    key={evaluation.id}
                    evaluation={evaluation}
                    onClick={() => onOpenEvaluation(evaluation.id)}
                    agenda
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
                Nenhuma avaliação agendada.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

type EvaluationCardDragBindings = Pick<
  ReturnType<typeof useDraggable>,
  "attributes" | "listeners" | "setNodeRef" | "isDragging"
>;

function EvaluationCardButton({
  evaluation,
  onClick,
  dragBindings,
  agenda = false,
}: {
  evaluation: Evaluation;
  onClick: () => void;
  dragBindings?: EvaluationCardDragBindings;
  agenda?: boolean;
}) {
  const status = getEffectiveStatus(evaluation);
  const statusConfig = STATUS_UI[status];

  if (agenda) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg border px-3 py-2.5 text-left text-xs shadow-sm transition ${statusConfig.cardClass}`}
      >
        <span className="flex items-center gap-1.5 self-start pt-0.5 font-semibold text-foreground">
          <Clock className="h-3.5 w-3.5 text-primary" />
          {timeLabel(evaluation.startTime)}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-foreground">{evaluation.clientName}</span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <UserRound className="h-3 w-3 shrink-0" />
            <span className="truncate">{evaluation.profissional?.name || "Sem responsável"}</span>
          </span>
        </span>
        <span className={`inline-flex shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${statusConfig.badgeClass}`}>
          {EVALUATION_STATUS_LABELS[status]}
        </span>
      </button>
    );
  }

  return (
    <button
      ref={dragBindings?.setNodeRef}
      type="button"
      onClick={onClick}
      {...(dragBindings?.listeners || {})}
      {...(dragBindings?.attributes || {})}
      className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs shadow-sm transition ${statusConfig.cardClass} ${
        dragBindings ? "cursor-grab select-none active:cursor-grabbing" : ""
      }`}
      style={
        dragBindings
          ? {
              opacity: dragBindings.isDragging ? 0.25 : 1,
              touchAction: "pan-y",
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Clock className="h-3 w-3 text-primary" />
          {timeLabel(evaluation.startTime)}
        </div>
        {dragBindings && (
          <span title="Realocar avaliação" aria-label="Realocar avaliação">
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-foreground">{evaluation.clientName}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          <UserRound className="h-3 w-3 shrink-0" />
          <span className="truncate">{evaluation.profissional?.name || "Sem responsável"}</span>
        </span>
        <span className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${statusConfig.badgeClass}`}>
          {EVALUATION_STATUS_LABELS[status]}
        </span>
      </div>
    </button>
  );
}

function DraggableEvaluationCard({
  evaluation,
  onClick,
}: {
  evaluation: Evaluation;
  onClick: () => void;
}) {
  const dragBindings = useDraggable({
    id: `evaluation:${evaluation.id}`,
    data: { type: "evaluation", evaluationId: evaluation.id },
  });

  return (
    <EvaluationCardButton
      evaluation={evaluation}
      onClick={onClick}
      dragBindings={dragBindings}
    />
  );
}

function CalendarDayCell({
  day,
  evaluations,
  isCurrentMonth,
  isToday,
  isFilteredDay,
  onOpenEvaluation,
  onOpenDay,
}: {
  day: Date;
  evaluations: Evaluation[];
  isCurrentMonth: boolean;
  isToday: boolean;
  isFilteredDay: boolean;
  onOpenEvaluation: (evaluationId: string) => void;
  onOpenDay: (dayKey: string) => void;
}) {
  const key = dateKey(day);
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${key}`,
    data: { type: "calendar-day", dayKey: key },
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[96px] border-b border-border p-2 transition-colors sm:min-h-[152px] sm:border-r ${
        isCurrentMonth ? "bg-card" : "bg-muted/20 text-muted-foreground"
      } ${!isCurrentMonth ? "hidden sm:block" : ""} ${isOver ? "bg-primary/10 outline outline-2 outline-inset outline-primary/70" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-semibold ${
            isToday
              ? "bg-primary text-primary-foreground"
              : isFilteredDay
                ? "border border-primary/40 bg-primary/10 text-primary"
                : "text-muted-foreground"
          }`}
          >
            {day.getDate()}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:hidden">
            {day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
          </span>
        </div>
        {evaluations.length > 0 && (
          <button
            type="button"
            onClick={() => onOpenDay(key)}
            className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary transition hover:bg-primary/20"
            aria-label={`Ver ${evaluations.length} avaliações do dia ${day.getDate()}`}
          >
            {evaluations.length}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {evaluations.slice(0, 4).map((evaluation) => (
          <DraggableEvaluationCard
            key={evaluation.id}
            evaluation={evaluation}
            onClick={() => onOpenEvaluation(evaluation.id)}
          />
        ))}
        {evaluations.length > 4 && (
          <button
            type="button"
            onClick={() => onOpenDay(key)}
            className="text-left text-[11px] font-semibold text-muted-foreground transition hover:text-foreground"
          >
            +{evaluations.length - 4} avaliações
          </button>
        )}
      </div>
    </div>
  );
}

export default function AvaliacoesAgendaPage() {
  const router = useRouter();
  const { globalUnit } = useGlobalUnit();
  const [resolvedUnit, setResolvedUnit] = useState("");
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [newEvaluationsToday, setNewEvaluationsToday] = useState(0);
  const [currentDayKey, setCurrentDayKey] = useState(() => saoPauloDateKey());
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [filterDayKey, setFilterDayKey] = useState("");
  const [canViewAll, setCanViewAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [calendarView, setCalendarView] = useState<"month" | "week" | "list">("month");
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<EvaluationStatus | null>(null);
  const [activeEvaluationId, setActiveEvaluationId] = useState<string | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<{
    evaluationId: string;
    targetDayKey: string;
  } | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [chatLink, setChatLink] = useState<ChatLinkState | null>(null);
  const [outcomeFlow, setOutcomeFlow] = useState<OutcomeFlow>(null);
  const [editingClosedPackage, setEditingClosedPackage] = useState(false);
  const [outcomeReason, setOutcomeReason] = useState("");
  const [outcomeDetails, setOutcomeDetails] = useState("");
  const [saleItemsInput, setSaleItemsInput] = useState<SaleItemDraft[]>([]);
  const [activeCampaignOffer, setActiveCampaignOffer] = useState<CampaignOfferView | null>(null);
  const [loadingCampaignOffer, setLoadingCampaignOffer] = useState(false);
  const [outcomeDate, setOutcomeDate] = useState("");
  const [outcomeTime, setOutcomeTime] = useState("");
  const outcomeEditorRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const scheduleNextDayRefresh = () => {
      timer = setTimeout(() => {
        setCurrentDayKey(saoPauloDateKey());
        scheduleNextDayRefresh();
      }, millisecondsUntilNextSaoPauloDay());
    };

    scheduleNextDayRefresh();
    return () => clearTimeout(timer);
  }, []);

  const fetchEvaluations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start: startOfMonth(month).toISOString(),
        end: endOfMonth(month).toISOString(),
      });
      if (globalUnit) params.set("unit", globalUnit);
      if (professionalId) params.set("profissionalId", professionalId);

      const res = await fetch(`/api/crm/evaluations?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao carregar avaliações");
      setEvaluations(data.evaluations || []);
      setNewEvaluationsToday(Number(data.newEvaluationsToday || 0));
      setProfessionals(data.professionals || []);
      setCanViewAll(data.canViewAll === true);
      setResolvedUnit(data.unit || globalUnit || "");
    } catch {
      setEvaluations([]);
      setNewEvaluationsToday(0);
      setProfessionals([]);
      setCanViewAll(false);
      setResolvedUnit(globalUnit || "");
      toast.error("Erro ao carregar avaliações");
    } finally {
      setLoading(false);
    }
  }, [currentDayKey, globalUnit, month, professionalId]);

  useEffect(() => {
    fetchEvaluations();
  }, [fetchEvaluations]);

  useEffect(() => {
    if (!resolvedUnit) {
      setCatalogServices([]);
      return;
    }

    let cancelled = false;
    fetch(`/api/catalog?unit=${encodeURIComponent(resolvedUnit)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Erro ao carregar procedimentos");
        if (!cancelled) setCatalogServices(data.services || []);
      })
      .catch(() => {
        if (!cancelled) setCatalogServices([]);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedUnit]);

  useEffect(() => {
    setProfessionalId("");
  }, [globalUnit]);

  const selectedEvaluation = useMemo(
    () => evaluations.find((evaluation) => evaluation.id === selectedEvaluationId) || null,
    [evaluations, selectedEvaluationId],
  );
  const activeEvaluation = useMemo(
    () => evaluations.find((evaluation) => evaluation.id === activeEvaluationId) || null,
    [activeEvaluationId, evaluations],
  );
  const pendingRescheduleEvaluation = useMemo(
    () =>
      pendingReschedule
        ? evaluations.find((evaluation) => evaluation.id === pendingReschedule.evaluationId) || null
        : null,
    [evaluations, pendingReschedule],
  );

  useEffect(() => {
    if (!selectedEvaluation) return;
    setScheduleDate(dateKey(selectedEvaluation.startTime));
    setScheduleTime(timeInputValue(selectedEvaluation.startTime));
    setOutcomeFlow(null);
    setEditingClosedPackage(false);
    setOutcomeReason("");
    setOutcomeDetails("");
    setSaleItemsInput(saleItemDraftsFromView(selectedEvaluation.pipelineSaleItems));
    setActiveCampaignOffer(null);
    setOutcomeDate(dateKey(selectedEvaluation.startTime));
    setOutcomeTime(timeInputValue(selectedEvaluation.startTime));
  }, [selectedEvaluation]);

  useEffect(() => {
    if (outcomeFlow !== "closed") return;
    outcomeEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [outcomeFlow]);

  useEffect(() => {
    if (!selectedEvaluation) {
      setChatLink(null);
      return;
    }

    if (!selectedEvaluation.pipelineDealId) {
      setChatLink({
        loading: false,
        available: false,
        reason: "Esta avaliação não possui um negócio vinculado ao Pipeline",
      });
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      dealId: selectedEvaluation.pipelineDealId,
      unit: selectedEvaluation.unit,
    });

    setChatLink({ loading: true, available: false });
    fetch(`/api/pipeline/chat-link?${params.toString()}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        setChatLink({
          loading: false,
          available: !!data.available,
          canCreate: !!data.canCreate,
          url: data.url,
          reason: data.reason || (response.ok ? undefined : "Chat indisponível"),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setChatLink({ loading: false, available: false, reason: "Falha ao localizar o chat" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEvaluation]);

  const days = useMemo(() => buildCalendarDays(month), [month]);
  const displayedEvaluations = useMemo(
    () => filterDayKey
      ? evaluations.filter((evaluation) => dateKey(evaluation.startTime) === filterDayKey)
      : evaluations,
    [evaluations, filterDayKey],
  );
  const evaluationsByDay = useMemo(() => {
    const map = new Map<string, Evaluation[]>();
    for (const evaluation of displayedEvaluations) {
      const key = dateKey(evaluation.startTime);
      const list = map.get(key) || [];
      list.push(evaluation);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
    }
    return map;
  }, [displayedEvaluations]);
  const selectedDayEvaluations = useMemo(
    () => (selectedDayKey ? evaluationsByDay.get(selectedDayKey) || [] : []),
    [evaluationsByDay, selectedDayKey],
  );
  const agendaEntries = useMemo(() => {
    const entries = [...evaluationsByDay.entries()]
      .filter(([key]) => isSameMonth(dateFromKey(key), month))
      .sort(([left], [right]) => left.localeCompare(right));
    const focusDayKey = filterDayKey || currentDayKey;
    if (isSameMonth(dateFromKey(focusDayKey), month) && !entries.some(([key]) => key === focusDayKey)) {
      entries.push([focusDayKey, []]);
      entries.sort(([left], [right]) => left.localeCompare(right));
    }
    return entries;
  }, [currentDayKey, evaluationsByDay, filterDayKey, month]);
  const weekAgendaEntries = useMemo(() => {
    const focusDate = dateFromKey(filterDayKey || currentDayKey);
    const anchor = isSameMonth(focusDate, month) ? focusDate : startOfMonth(month);
    const start = startOfWeek(anchor).getTime();
    const end = endOfWeek(anchor).getTime();
    return agendaEntries.filter(([key]) => {
      const time = dateFromKey(key).getTime();
      return time >= start && time <= end;
    });
  }, [agendaEntries, currentDayKey, filterDayKey, month]);
  const mobileAgendaEntries = useMemo(() => {
    if (filterDayKey) return agendaEntries;
    if (!isSameMonth(dateFromKey(currentDayKey), month)) return agendaEntries;
    return agendaEntries.filter(([key]) => key >= currentDayKey);
  }, [agendaEntries, currentDayKey, filterDayKey, month]);
  const focusDayKey = filterDayKey || currentDayKey;
  const focusDayEvaluations = evaluationsByDay.get(focusDayKey) || [];

  const stats = useMemo(() => {
    const total = displayedEvaluations.length;
    const pending = displayedEvaluations.filter((item) => isPendingEvaluationStatus(getEffectiveStatus(item))).length;
    const attended = displayedEvaluations.filter((item) => isAttendedEvaluationStatus(getEffectiveStatus(item))).length;
    const finalized = displayedEvaluations.filter((item) => isFinalEvaluationStatus(getEffectiveStatus(item))).length;
    const closed = displayedEvaluations.filter((item) => isClosedPackageEvaluationStatus(getEffectiveStatus(item))).length;
    const notClosed = displayedEvaluations.filter((item) => isNotClosedEvaluationStatus(getEffectiveStatus(item))).length;
    const noShow = displayedEvaluations.filter((item) => isNoShowEvaluationStatus(getEffectiveStatus(item))).length;
    const noResponse = displayedEvaluations.filter((item) => isNoResponseEvaluationStatus(getEffectiveStatus(item))).length;
    const soldValue = displayedEvaluations
      .filter((item) => isClosedPackageEvaluationStatus(getEffectiveStatus(item)))
      .reduce((sum, item) => sum + Number(item.pipelineValue || 0), 0);

    return {
      total,
      pending,
      attended,
      finalized,
      closed,
      notClosed,
      noShow,
      noResponse,
      attendanceRate: total > 0 ? (attended / total) * 100 : 0,
      conversionRate: attended > 0 ? (closed / attended) * 100 : 0,
      noShowRate: total > 0 ? (noShow / total) * 100 : 0,
      soldValue,
    };
  }, [displayedEvaluations]);

  const updateEvaluationSchedule = async (evaluationId: string, startTime: Date) => {
    setSavingSchedule(true);
    try {
      const res = await fetch("/api/crm/evaluations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: evaluationId, startTime: startTime.toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao reagendar avaliação");

      const updated = data.evaluation as Evaluation;
      const updatedDate = new Date(updated.startTime);
      setEvaluations((current) =>
        isSameMonth(updatedDate, month)
          ? current.map((evaluation) => (evaluation.id === updated.id ? updated : evaluation))
          : current.filter((evaluation) => evaluation.id !== updated.id),
      );
      toast.success("Avaliação reagendada");
      return updated;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao reagendar avaliação");
      return null;
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const evaluationId = event.active.data.current?.evaluationId;
    setActiveEvaluationId(typeof evaluationId === "string" ? evaluationId : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveEvaluationId(null);
    const evaluationId = event.active.data.current?.evaluationId;
    const targetDayKey = event.over?.data.current?.dayKey;
    if (typeof evaluationId !== "string" || typeof targetDayKey !== "string") return;

    const evaluation = evaluations.find((item) => item.id === evaluationId);
    if (!evaluation || dateKey(evaluation.startTime) === targetDayKey) return;
    setPendingReschedule({ evaluationId, targetDayKey });
  };

  const confirmDraggedReschedule = async () => {
    if (!pendingReschedule || !pendingRescheduleEvaluation) return;

    const currentStart = new Date(pendingRescheduleEvaluation.startTime);
    const targetDay = dateFromKey(pendingReschedule.targetDayKey);
    targetDay.setHours(
      currentStart.getHours(),
      currentStart.getMinutes(),
      currentStart.getSeconds(),
      currentStart.getMilliseconds(),
    );

    const updated = await updateEvaluationSchedule(pendingReschedule.evaluationId, targetDay);
    if (!updated) return;

    setPendingReschedule(null);
    if (!isSameMonth(targetDay, month)) {
      setMonth(new Date(targetDay.getFullYear(), targetDay.getMonth(), 1));
    }
  };

  const saveSelectedEvaluationSchedule = async () => {
    if (!selectedEvaluation) return;
    const startTime = buildLocalDateTime(scheduleDate, scheduleTime);
    if (!startTime) {
      toast.error("Informe uma data e um horário válidos");
      return;
    }

    const updated = await updateEvaluationSchedule(selectedEvaluation.id, startTime);
    if (!updated) return;

    if (!isSameMonth(startTime, month)) {
      setSelectedEvaluationId(null);
      setMonth(new Date(startTime.getFullYear(), startTime.getMonth(), 1));
    }
  };

  const submitEvaluationOutcome = async (
    status: EvaluationStatus,
    payload: Record<string, unknown> = {},
    successMessage = "Status da avaliação atualizado",
  ) => {
    if (!selectedEvaluation) return;
    setUpdatingStatus(status);
    try {
      const res = await fetch("/api/crm/evaluations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedEvaluation.id, status, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar avaliação");

      const updated = data.evaluation as Evaluation;
      const updatedDate = new Date(updated.startTime);
      setEvaluations((current) =>
        isSameMonth(updatedDate, month)
          ? current.map((evaluation) => (evaluation.id === updated.id ? updated : evaluation))
          : current.filter((evaluation) => evaluation.id !== updated.id),
      );
      setOutcomeFlow(null);
      setEditingClosedPackage(false);
      setOutcomeReason("");
      setOutcomeDetails("");
      setSaleItemsInput([]);
      setActiveCampaignOffer(null);
      toast.success(successMessage);

      if (!isSameMonth(updatedDate, month)) {
        setSelectedEvaluationId(null);
        setMonth(new Date(updatedDate.getFullYear(), updatedDate.getMonth(), 1));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar avaliação");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const prepareClosedOutcome = async (editExisting = false) => {
    if (!selectedEvaluation) return;
    const savedItems = saleItemDraftsFromView(selectedEvaluation.pipelineSaleItems);
    setSaleItemsInput(savedItems);
    setActiveCampaignOffer(null);
    setEditingClosedPackage(editExisting);
    setOutcomeFlow("closed");

    if (!selectedEvaluation.pipelineDealId) return;
    setLoadingCampaignOffer(true);
    try {
      const response = await fetch(
        `/api/campaigns/offer?dealId=${encodeURIComponent(selectedEvaluation.pipelineDealId)}`,
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Erro ao carregar a oferta da campanha");
      const campaignOffer = (data.offer || null) as CampaignOfferView | null;
      setActiveCampaignOffer(campaignOffer);
      if (savedItems.length === 0 && campaignOffer?.configured) {
        setSaleItemsInput(saleItemDraftsFromCampaignOffer(campaignOffer));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar a oferta da campanha");
    } finally {
      setLoadingCampaignOffer(false);
    }
  };

  const startOutcomeFlow = (status: EvaluationStatus) => {
    setOutcomeReason("");
    setOutcomeDetails("");
    setSaleItemsInput(saleItemDraftsFromView(selectedEvaluation?.pipelineSaleItems));
    if (selectedEvaluation) {
      setOutcomeDate(dateKey(selectedEvaluation.startTime));
      setOutcomeTime(timeInputValue(selectedEvaluation.startTime));
    }

    if (status === "pendente") {
      void submitEvaluationOutcome(status);
      return;
    }

    if (status === "compareceu") {
      setOutcomeFlow("attended_decision");
      return;
    }

    if (status === "fechou_pacote") {
      void prepareClosedOutcome(
        Boolean(selectedEvaluation && isClosedPackageEvaluationStatus(getEffectiveStatus(selectedEvaluation))),
      );
      return;
    }

    if (status === "nao_fechou") {
      setOutcomeFlow("not_closed");
      return;
    }

    if (status === "nao_respondeu") {
      void submitEvaluationOutcome(status, {}, "Falta de resposta registrada");
      return;
    }

    setOutcomeFlow("no_show_decision");
  };

  const submitClosedOutcome = () => {
    if (saleItemsInput.length === 0) {
      toast.error("Informe o procedimento fechado");
      return;
    }

    const saleValue = saleItemsTotal(saleItemsInput);
    if (!saleValue) {
      toast.error("Informe um valor fechado válido");
      return;
    }
    void submitEvaluationOutcome(
      "fechou_pacote",
      {
        saleValue,
        procedureNames: saleItemsInput.map((item) => item.procedureName),
        saleItems: saleItemsInput,
        editClosedPackage: editingClosedPackage,
      },
      editingClosedPackage
        ? "Orçamento fechado atualizado"
        : "Pacote fechado e Pipeline atualizado",
    );
  };

  const submitReasonOutcome = (status: "nao_fechou" | "nao_compareceu") => {
    const reason = buildEvaluationReason(outcomeReason, outcomeDetails);
    if (!reason) {
      toast.error(
        outcomeReason === "Outro"
          ? "Descreva o motivo"
          : "Selecione um motivo",
      );
      return;
    }

    void submitEvaluationOutcome(
      status,
      { reason },
      status === "nao_fechou"
        ? "Não fechamento registrado e Pipeline atualizado"
        : "Ausência registrada",
    );
  };

  const submitNoShowReschedule = () => {
    const startTime = buildLocalDateTime(outcomeDate, outcomeTime);
    if (!startTime) {
      toast.error("Informe a nova data e o novo horário");
      return;
    }

    void submitEvaluationOutcome(
      "nao_compareceu",
      { rescheduled: true, startTime: startTime.toISOString() },
      "Ausência registrada e avaliação reagendada",
    );
  };

  const openSelectedEvaluationChat = async () => {
    if (!selectedEvaluation?.pipelineDealId) {
      toast.error(chatLink?.reason || "Chat indisponível para esta avaliação");
      return;
    }

    if (chatLink?.available && chatLink.url) {
      router.push(chatLink.url);
      return;
    }

    if (!chatLink?.canCreate) {
      toast.error(chatLink?.reason || "Chat indisponível para este lead");
      return;
    }

    setChatLink((current) =>
      current ? { ...current, loading: true } : { loading: true, available: false },
    );
    try {
      const params = new URLSearchParams({
        dealId: selectedEvaluation.pipelineDealId,
        unit: selectedEvaluation.unit,
        create: "1",
      });
      const response = await fetch(`/api/pipeline/chat-link?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.available || !data.url) {
        throw new Error(data.reason || "Falha ao iniciar conversa");
      }

      setChatLink({ loading: false, available: true, url: data.url, reason: data.reason });
      router.push(data.url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Falha ao iniciar conversa";
      setChatLink({ loading: false, available: false, reason });
      toast.error(reason);
    }
  };

  const registeredProcedureNames = selectedEvaluation?.pipelineProcedureNames?.length
    ? selectedEvaluation.pipelineProcedureNames
    : selectedEvaluation?.pipelineProcedureName
      ? [selectedEvaluation.pipelineProcedureName]
      : [];
  const registeredSaleItems = selectedEvaluation?.pipelineSaleItems || [];
  const showRegisteredClosing = Boolean(
    selectedEvaluation
      && isClosedPackageEvaluationStatus(getEffectiveStatus(selectedEvaluation))
      && (registeredSaleItems.length > 0 || registeredProcedureNames.length > 0 || Number(selectedEvaluation.pipelineValue || 0) > 0),
  );
  const monthIndex = month.getMonth();
  const handleFilterDayChange = (value: string) => {
    setFilterDayKey(value);
    if (!value) return;

    const selectedDate = dateFromKey(value);
    setMonth((current) =>
      isSameMonth(current, selectedDate)
        ? current
        : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    );
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background px-3 py-3 sm:px-6 sm:py-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Avaliações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe a agenda e os resultados das avaliações.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:justify-end">
          {canViewAll && professionals.length > 0 && (
            <select
              value={professionalId}
              onChange={(event) => setProfessionalId(event.target.value)}
              className="col-span-2 h-10 min-w-0 rounded-lg border border-border bg-background px-2 text-xs text-foreground sm:col-span-1 sm:h-9 sm:min-w-[220px] sm:px-3 sm:text-sm"
            >
              <option value="">Todas as responsáveis</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          )}
          <div className={`col-span-2 grid min-w-0 items-center gap-1 sm:col-span-1 sm:w-[190px] ${filterDayKey ? "grid-cols-[minmax(0,1fr)_36px]" : "grid-cols-1"}`}>
            <div className="min-w-0">
              <DatePicker
                value={filterDayKey}
                onChange={handleFilterDayChange}
                variant="compact"
                calendarSize="small"
                placeholder="Selecionar dia"
              />
            </div>
            {filterDayKey && (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setFilterDayKey("")}
                aria-label="Limpar filtro de dia"
                title="Limpar filtro de dia"
                className="h-9 w-9"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFilterDayKey("");
              setMonth(new Date());
            }}
            className="h-10 w-full gap-1.5 px-2.5 text-xs sm:h-9 sm:w-auto sm:gap-2 sm:px-3 sm:text-sm"
          >
            <CalendarDays className="h-4 w-4" />
            Hoje
          </Button>
          <Button
            size="sm"
            onClick={() => router.push("/crm/pipeline?createEvaluation=1")}
            className="h-10 w-full gap-1.5 px-2.5 text-xs sm:h-9 sm:w-auto sm:gap-2 sm:px-3 sm:text-sm"
          >
            <CalendarPlus className="h-4 w-4" />
            Nova avaliação
          </Button>
        </div>
      </div>

      <div className="mb-3 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <PrimaryMetric
            label="Agendadas"
            value={stats.total}
            hint={filterDayKey ? "Avaliações no dia" : "Avaliações no mês"}
            icon={CalendarCheck}
            iconClass="bg-violet-500/10 text-violet-700 dark:text-violet-300"
            className="border-b border-r border-border lg:border-b-0"
          />
          <PrimaryMetric
            label="Pendentes"
            value={stats.pending}
            icon={Clock}
            iconClass="bg-amber-500/10 text-amber-800 dark:text-amber-300"
            className="border-b border-border lg:border-b-0 lg:border-r"
          />
          <PrimaryMetric
            label="Comparecimento"
            value={formatPercent(stats.attendanceRate)}
            hint={`${stats.attended} de ${stats.total} compareceram`}
            icon={UserCheck}
            iconClass="bg-sky-500/10 text-sky-700 dark:text-sky-300"
            className="border-r border-border"
          />
          <PrimaryMetric
            label="Conversão"
            value={formatPercent(stats.conversionRate)}
            hint="Fechados / compareceram"
            icon={TrendingUp}
            iconClass="bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
            className="lg:border-r lg:border-border"
          />
          <button
            type="button"
            onClick={() => setShowAllMetrics((current) => !current)}
            className="col-span-2 flex min-h-11 items-center justify-center border-t border-border px-4 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 hover:text-primary/80 lg:col-span-1 lg:min-w-[180px] lg:border-l-0 lg:border-t-0"
          >
            {showAllMetrics ? "Ocultar indicadores" : "Ver todos os indicadores"}
          </button>
        </div>
      </div>

      {showAllMetrics && (
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-card/40 p-2 sm:gap-3 sm:p-3 lg:grid-cols-4">
          <MetricCard
            label="Novas hoje"
            value={newEvaluationsToday}
            hint="Registradas hoje"
            icon={CalendarPlus}
            iconClass="bg-violet-500/10 text-violet-700 dark:text-violet-300"
          />
          <MetricCard
            label="Finalizadas"
            value={stats.finalized}
            hint="Com desfecho registrado"
            icon={CheckCircle2}
            iconClass="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          />
          <MetricCard
            label="Fecharam"
            value={stats.closed}
            icon={CheckCircle2}
            iconClass="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          />
          <MetricCard
            label="Não fecharam"
            value={stats.notClosed}
            icon={XCircle}
            iconClass="bg-rose-500/10 text-rose-700 dark:text-rose-300"
          />
          <MetricCard
            label="Não compareceram"
            value={stats.noShow}
            icon={UserX}
            iconClass="bg-orange-500/10 text-orange-700 dark:text-orange-300"
          />
          <MetricCard
            label="Taxa de falta"
            value={formatPercent(stats.noShowRate)}
            hint={filterDayKey ? "Não compareceram / dia" : "Não compareceram / mês"}
            icon={UserX}
            iconClass="bg-orange-500/10 text-orange-700 dark:text-orange-300"
          />
          <MetricCard
            label="Não responderam"
            value={stats.noResponse}
            hint="Sem retorno às tentativas de contato"
            icon={MessageCircle}
            iconClass="bg-slate-500/10 text-slate-700 dark:text-slate-300"
          />
          <div className="col-span-2 lg:col-span-1">
          <MetricCard
            label="Valor vendido"
            value={formatCurrency(stats.soldValue)}
            hint="Avaliações fechadas"
            icon={TrendingUp}
            iconClass="bg-green-500/10 text-green-700 dark:text-green-300"
          />
        </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveEvaluationId(null)}
      >
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[150px] text-center text-sm font-bold capitalize text-foreground">{formatMonth(month)}</div>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="hidden grid-cols-3 overflow-hidden rounded-lg border border-border sm:grid">
              {(["month", "week", "list"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setCalendarView(view)}
                  className={`flex h-8 items-center justify-center gap-1.5 border-r border-border px-3 text-xs font-semibold transition-colors last:border-r-0 ${
                    calendarView === view ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {view === "list" && <List className="h-3.5 w-3.5" />}
                  {view === "month" ? "Mês" : view === "week" ? "Semana" : "Lista"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <div className="sm:hidden">
                <EvaluationAgendaList
                  entries={mobileAgendaEntries}
                  onOpenEvaluation={setSelectedEvaluationId}
                />
              </div>

              <div className="hidden sm:block">
                {calendarView === "month" ? (
                  <div className="grid grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="border-r border-border bg-background/20 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-foreground">
                            {filterDayKey ? "Dia selecionado" : "Hoje"}
                          </p>
                          <p className="text-xs text-muted-foreground">{fullDateLabelFromKey(focusDayKey)}</p>
                        </div>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                          {focusDayEvaluations.length}
                        </span>
                      </div>
                      {focusDayEvaluations.length > 0 ? (
                        <div className="space-y-2">
                          {focusDayEvaluations.map((evaluation) => (
                            <EvaluationCardButton
                              key={evaluation.id}
                              evaluation={evaluation}
                              onClick={() => setSelectedEvaluationId(evaluation.id)}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                          {filterDayKey ? "Nenhuma avaliação no dia selecionado." : "Nenhuma avaliação hoje."}
                        </p>
                      )}
                    </aside>

                    <div className="min-w-0">
                      <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                          <div key={day} className="px-2 py-2">{day}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7">
                        {days.map((day) => {
                          const key = dateKey(day);
                          return (
                            <CalendarDayCell
                              key={key}
                              day={day}
                              evaluations={evaluationsByDay.get(key) || []}
                              isCurrentMonth={day.getMonth() === monthIndex}
                              isToday={key === currentDayKey}
                              isFilteredDay={key === filterDayKey}
                              onOpenEvaluation={setSelectedEvaluationId}
                              onOpenDay={setSelectedDayKey}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <EvaluationAgendaList
                    entries={calendarView === "week" ? weekAgendaEntries : agendaEntries}
                    onOpenEvaluation={setSelectedEvaluationId}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <DragOverlay>
          {activeEvaluation ? (
            <div className="w-[210px] opacity-95 shadow-2xl">
              <EvaluationCardButton evaluation={activeEvaluation} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Dialog open={!!selectedDayKey} onOpenChange={(open) => !open && setSelectedDayKey(null)}>
        <DialogContent className="sm:max-w-[520px]">
          {selectedDayKey && (
            <>
              <DialogHeader>
                <DialogTitle className="capitalize">
                  Avaliações de {fullDateLabelFromKey(selectedDayKey)}
                </DialogTitle>
              </DialogHeader>

              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {selectedDayEvaluations.map((evaluation) => (
                  <EvaluationCardButton
                    key={evaluation.id}
                    evaluation={evaluation}
                    onClick={() => {
                      setSelectedDayKey(null);
                      setSelectedEvaluationId(evaluation.id);
                    }}
                  />
                ))}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedDayKey(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingReschedule}
        onOpenChange={(open) => {
          if (!open && !savingSchedule) setPendingReschedule(null);
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          {pendingReschedule && pendingRescheduleEvaluation && (
            <>
              <DialogHeader>
                <DialogTitle>Confirmar reagendamento</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="font-semibold text-foreground">{pendingRescheduleEvaluation.clientName}</div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Data atual</div>
                    <div className="mt-1 font-semibold text-foreground">
                      {fullDateTimeLabel(pendingRescheduleEvaluation.startTime)}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Nova data</div>
                    <div className="mt-1 font-semibold capitalize text-foreground">
                      {fullDateLabelFromKey(pendingReschedule.targetDayKey)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      às {timeLabel(pendingRescheduleEvaluation.startTime)}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPendingReschedule(null)}
                  disabled={savingSchedule}
                >
                  Cancelar
                </Button>
                <Button onClick={confirmDraggedReschedule} disabled={savingSchedule}>
                  {savingSchedule && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEvaluation} onOpenChange={(open) => !open && setSelectedEvaluationId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
          {selectedEvaluation && (
            <>
              <DialogHeader>
                <DialogTitle>Avaliação: {selectedEvaluation.clientName}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data e horário</div>
                      <div className="mt-1 font-semibold text-foreground">{fullDateTimeLabel(selectedEvaluation.startTime)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responsável</div>
                      <div className="mt-1 font-semibold text-foreground">
                        {selectedEvaluation.profissional?.name || "Sem responsável"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telefone</div>
                      <div className="mt-1 font-mono text-foreground">{selectedEvaluation.clientPhone || "Sem telefone"}</div>
                    </div>
                  </div>
                </div>

                {showRegisteredClosing && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                        <PackageCheck className="h-4 w-4" />
                        <div className="text-sm font-semibold">Fechamento registrado</div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full border-emerald-500/30 bg-background/70 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-200 sm:w-auto"
                        onClick={() => void prepareClosedOutcome(true)}
                        disabled={!!updatingStatus || loadingCampaignOffer}
                      >
                        {loadingCampaignOffer && editingClosedPackage ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PencilLine className="mr-2 h-4 w-4" />
                        )}
                        Editar orçamento
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Procedimentos
                        </div>
                        {registeredSaleItems.length > 0 ? (
                          <div className="mt-2 grid gap-2">
                            {registeredSaleItems.map((item) => (
                              <div key={item.id || `${item.serviceCatalogId}-${item.procedureName}`} className="rounded-lg border border-emerald-500/20 bg-background/40 px-3 py-2 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="font-semibold text-foreground">{item.procedureName}</div>
                                  {item.itemType === "courtesy" && (
                                    <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">Cortesia</span>
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                                  <span>{item.sessions} sessões</span>
                                  <span>Subtotal {formatCurrency(item.subtotal)}</span>
                                  <span>Pago {formatCurrency(item.paidAmount)}</span>
                                  <span>Desconto {formatCurrency(item.discountAmount)} ({item.discountPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : registeredProcedureNames.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {registeredProcedureNames.map((procedureName) => (
                              <span
                                key={procedureName}
                                className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200"
                              >
                                {procedureName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-muted-foreground">Não informado</div>
                        )}
                      </div>
                      <div className="sm:text-right">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Valor fechado
                        </div>
                        <div className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">
                          {formatCurrency(Number(selectedEvaluation.pipelineValue || 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    <div className="text-sm font-semibold text-foreground">Data da avaliação</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
                    <div className="grid gap-2">
                      <Label>Data</Label>
                      <DatePicker
                        value={scheduleDate}
                        onChange={setScheduleDate}
                        variant="input"
                        placeholder="Data da avaliação"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="evaluationScheduleTime">Horário</Label>
                      <Input
                        id="evaluationScheduleTime"
                        type="time"
                        value={scheduleTime}
                        onChange={(event) => setScheduleTime(event.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="mt-3 w-full sm:w-auto"
                    onClick={saveSelectedEvaluationSchedule}
                    disabled={savingSchedule || !!updatingStatus}
                  >
                    {savingSchedule ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarCheck className="mr-2 h-4 w-4" />
                    )}
                    Salvar data e horário
                  </Button>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Status da avaliação</div>
                      <div className="text-xs text-muted-foreground">
                        Atualize o desfecho para refletir nos cards e métricas do mês.
                      </div>
                    </div>
                    {(() => {
                      const status = getEffectiveStatus(selectedEvaluation);
                      const statusConfig = STATUS_UI[status];
                      return (
                        <div className="text-right">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusConfig.badgeClass}`}>
                            <span className={`h-2 w-2 rounded-full ${statusConfig.dotClass}`} />
                            {EVALUATION_STATUS_LABELS[status]}
                          </span>
                          {selectedEvaluation.outcomeReason && (
                            <div className="mt-1 max-w-52 text-xs text-muted-foreground">
                              {selectedEvaluation.outcomeReason}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {EVALUATION_STATUS_VALUES.map((status) => {
                      const statusConfig = STATUS_UI[status];
                      const active = getEffectiveStatus(selectedEvaluation) === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => startOutcomeFlow(status)}
                          disabled={!!updatingStatus}
                          className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${statusConfig.actionClass} ${
                            active ? "ring-2 ring-primary/70" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{EVALUATION_STATUS_LABELS[status]}</span>
                            {updatingStatus === status ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <span className={`h-2.5 w-2.5 rounded-full ${statusConfig.dotClass}`} />
                            )}
                          </div>
                          <div className="mt-1 text-xs opacity-80">{statusConfig.description}</div>
                        </button>
                      );
                    })}
                  </div>

                  {outcomeFlow && (
                    <div ref={outcomeEditorRef} className="mt-3 scroll-mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
                      {outcomeFlow === "attended_decision" && (
                        <div>
                          <div className="font-semibold text-foreground">A cliente fechou o pacote?</div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Registre o resultado comercial para concluir a avaliação.
                          </p>
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <Button type="button" onClick={() => void prepareClosedOutcome()}>
                              Sim, fechou
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setOutcomeFlow("not_closed")}>
                              Não fechou
                            </Button>
                          </div>
                        </div>
                      )}

                      {outcomeFlow === "closed" && (
                        <div className="space-y-3">
                          <div>
                            <div className="font-semibold text-foreground">
                              {editingClosedPackage
                                ? "Edite os procedimentos e valores do orçamento fechado."
                                : "Adicione os procedimentos e informe o valor fechado."}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {editingClosedPackage
                                ? "As alterações substituirão a composição atual, sem criar uma nova venda."
                                : "O valor será refletido no negócio e nos indicadores do Pipeline."}
                            </p>
                          </div>
                          <div className="grid gap-2">
                            <Label>Procedimentos vendidos</Label>
                            <SaleItemsEditor
                              services={catalogServices}
                              items={saleItemsInput}
                              onChange={setSaleItemsInput}
                              campaignOffer={activeCampaignOffer}
                              disabled={!!updatingStatus || loadingCampaignOffer}
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setOutcomeFlow(null);
                                setEditingClosedPackage(false);
                              }}
                            >
                              Cancelar
                            </Button>
                            <Button type="button" onClick={submitClosedOutcome} disabled={!!updatingStatus}>
                              {updatingStatus === "fechou_pacote" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              {editingClosedPackage ? "Salvar alterações" : "Confirmar fechamento"}
                            </Button>
                          </div>
                        </div>
                      )}

                      {outcomeFlow === "not_closed" && (
                        <div className="space-y-3">
                          <div>
                            <div className="font-semibold text-foreground">Por que a cliente não fechou?</div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              O motivo ficará registrado no negócio e no histórico da avaliação.
                            </p>
                          </div>
                          <div className="grid gap-2">
                            <Label>Motivo do não fechamento</Label>
                            <Select value={outcomeReason || null} onValueChange={(value) => setOutcomeReason(value || "")}>
                              <SelectTrigger className="h-10 w-full">
                                <SelectValue placeholder="Selecione um motivo" />
                              </SelectTrigger>
                              <SelectContent>
                                {EVALUATION_NOT_CLOSED_REASONS.map((reason) => (
                                  <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {outcomeReason === "Outro" && (
                            <div className="grid gap-2">
                              <Label htmlFor="evaluationNotClosedDetails">Descreva o motivo</Label>
                              <Textarea
                                id="evaluationNotClosedDetails"
                                value={outcomeDetails}
                                onChange={(event) => setOutcomeDetails(event.target.value)}
                                placeholder="Informe o motivo observado"
                                rows={3}
                              />
                            </div>
                          )}
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setOutcomeFlow(null)}>
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              onClick={() => submitReasonOutcome("nao_fechou")}
                              disabled={!!updatingStatus}
                            >
                              {updatingStatus === "nao_fechou" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Registrar motivo
                            </Button>
                          </div>
                        </div>
                      )}

                      {outcomeFlow === "no_show_decision" && (
                        <div>
                          <div className="font-semibold text-foreground">A cliente reagendou?</div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Se houver uma nova data, o card será movido automaticamente no calendário.
                          </p>
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <Button type="button" onClick={() => setOutcomeFlow("no_show_reschedule")}>
                              Sim, reagendou
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setOutcomeFlow("no_show_reason")}>
                              Não reagendou
                            </Button>
                          </div>
                        </div>
                      )}

                      {outcomeFlow === "no_show_reschedule" && (
                        <div className="space-y-3">
                          <div>
                            <div className="font-semibold text-foreground">Informe a nova data</div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              A ausência será registrada no histórico e a avaliação voltará para Pendente.
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
                            <div className="grid gap-2">
                              <Label>Nova data</Label>
                              <DatePicker
                                value={outcomeDate}
                                onChange={setOutcomeDate}
                                variant="input"
                                placeholder="Nova data"
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="evaluationOutcomeTime">Horário</Label>
                              <Input
                                id="evaluationOutcomeTime"
                                type="time"
                                value={outcomeTime}
                                onChange={(event) => setOutcomeTime(event.target.value)}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setOutcomeFlow(null)}>
                              Cancelar
                            </Button>
                            <Button type="button" onClick={submitNoShowReschedule} disabled={!!updatingStatus}>
                              {updatingStatus === "nao_compareceu" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Confirmar reagendamento
                            </Button>
                          </div>
                        </div>
                      )}

                      {outcomeFlow === "no_show_reason" && (
                        <div className="space-y-3">
                          <div>
                            <div className="font-semibold text-foreground">Por que a cliente não compareceu?</div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              O motivo ficará registrado para análise de faltas e lembretes.
                            </p>
                          </div>
                          <div className="grid gap-2">
                            <Label>Motivo da ausência</Label>
                            <Select value={outcomeReason || null} onValueChange={(value) => setOutcomeReason(value || "")}>
                              <SelectTrigger className="h-10 w-full">
                                <SelectValue placeholder="Selecione um motivo" />
                              </SelectTrigger>
                              <SelectContent>
                                {EVALUATION_NO_SHOW_REASONS.map((reason) => (
                                  <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {outcomeReason === "Outro" && (
                            <div className="grid gap-2">
                              <Label htmlFor="evaluationNoShowDetails">Descreva o motivo</Label>
                              <Textarea
                                id="evaluationNoShowDetails"
                                value={outcomeDetails}
                                onChange={(event) => setOutcomeDetails(event.target.value)}
                                placeholder="Informe o motivo observado"
                                rows={3}
                              />
                            </div>
                          )}
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setOutcomeFlow(null)}>
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              onClick={() => submitReasonOutcome("nao_compareceu")}
                              disabled={!!updatingStatus}
                            >
                              {updatingStatus === "nao_compareceu" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Registrar ausência
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <span
                  className="inline-flex"
                  title={
                    chatLink?.loading
                      ? "Localizando conversa"
                      : chatLink?.reason || "Abrir o chat deste lead"
                  }
                >
                  <Button
                    type="button"
                    onClick={openSelectedEvaluationChat}
                    disabled={
                      !chatLink ||
                      chatLink.loading ||
                      (!chatLink.available && !chatLink.canCreate)
                    }
                    className="gap-2"
                  >
                    {chatLink?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageCircle className="h-4 w-4" />
                    )}
                    Chat
                  </Button>
                </span>
                <Button variant="outline" onClick={() => setSelectedEvaluationId(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
