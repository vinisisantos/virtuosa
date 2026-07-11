"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  Loader2,
  TrendingUp,
  UserCheck,
  UserRound,
  UserX,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGlobalUnit } from "@/contexts/UnitContext";
import { formatCurrency } from "@/lib/currency";
import {
  EVALUATION_STATUS_LABELS,
  EVALUATION_STATUS_VALUES,
  type EvaluationStatus,
  isAttendedEvaluationStatus,
  isClosedPackageEvaluationStatus,
  isFinalEvaluationStatus,
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
  pipelineStage?: string | null;
  pipelineClosedAt?: string | null;
};

type StatusUiConfig = {
  description: string;
  dotClass: string;
  badgeClass: string;
  cardClass: string;
  actionClass: string;
};

const STATUS_UI: Record<EvaluationStatus, StatusUiConfig> = {
  pendente: {
    description: "Ainda aguardando avaliação ou desfecho.",
    dotClass: "bg-violet-400",
    badgeClass: "border-violet-500/30 bg-violet-500/15 text-violet-200",
    cardClass: "border-violet-500/25 bg-violet-500/5 hover:border-violet-500/45 hover:bg-violet-500/10",
    actionClass: "border-violet-500/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20",
  },
  compareceu: {
    description: "Cliente compareceu, mas o resultado comercial ainda não foi definido.",
    dotClass: "bg-sky-400",
    badgeClass: "border-sky-500/30 bg-sky-500/15 text-sky-200",
    cardClass: "border-sky-500/25 bg-sky-500/5 hover:border-sky-500/45 hover:bg-sky-500/10",
    actionClass: "border-sky-500/30 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20",
  },
  fechou_pacote: {
    description: "Avaliação convertida em venda/pacote.",
    dotClass: "bg-emerald-400",
    badgeClass: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
    cardClass: "border-emerald-500/25 bg-emerald-500/5 hover:border-emerald-500/45 hover:bg-emerald-500/10",
    actionClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20",
  },
  nao_fechou: {
    description: "Cliente avaliou, mas não comprou.",
    dotClass: "bg-rose-400",
    badgeClass: "border-rose-500/30 bg-rose-500/15 text-rose-200",
    cardClass: "border-rose-500/25 bg-rose-500/5 hover:border-rose-500/45 hover:bg-rose-500/10",
    actionClass: "border-rose-500/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
  },
  nao_compareceu: {
    description: "Cliente não compareceu à avaliação.",
    dotClass: "bg-amber-400",
    badgeClass: "border-amber-500/30 bg-amber-500/15 text-amber-200",
    cardClass: "border-amber-500/25 bg-amber-500/5 hover:border-amber-500/45 hover:bg-amber-500/10",
    actionClass: "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
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
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 min-h-8 text-xl font-bold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
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
}: {
  evaluation: Evaluation;
  onClick: () => void;
  dragBindings?: EvaluationCardDragBindings;
}) {
  const status = getEffectiveStatus(evaluation);
  const statusConfig = STATUS_UI[status];

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
        <span className={`inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${statusConfig.badgeClass}`}>
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
  onOpenEvaluation,
  onOpenDay,
}: {
  day: Date;
  evaluations: Evaluation[];
  isCurrentMonth: boolean;
  isToday: boolean;
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
      className={`min-h-[152px] border-b border-border p-2 transition-colors sm:border-r ${
        isCurrentMonth ? "bg-card" : "bg-muted/20 text-muted-foreground"
      } ${isOver ? "bg-primary/10 outline outline-2 outline-inset outline-primary/70" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-semibold ${
            isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          {day.getDate()}
        </span>
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
  const { globalUnit } = useGlobalUnit();
  const [month, setMonth] = useState(() => new Date());
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [canViewAll, setCanViewAll] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

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
      setProfessionals(data.professionals || []);
      setCanViewAll(data.canViewAll === true);
    } catch {
      setEvaluations([]);
      setProfessionals([]);
      setCanViewAll(false);
      toast.error("Erro ao carregar avaliações");
    } finally {
      setLoading(false);
    }
  }, [globalUnit, month, professionalId]);

  useEffect(() => {
    fetchEvaluations();
  }, [fetchEvaluations]);

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
  }, [selectedEvaluation]);

  const days = useMemo(() => buildCalendarDays(month), [month]);
  const evaluationsByDay = useMemo(() => {
    const map = new Map<string, Evaluation[]>();
    for (const evaluation of evaluations) {
      const key = dateKey(evaluation.startTime);
      const list = map.get(key) || [];
      list.push(evaluation);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
    }
    return map;
  }, [evaluations]);
  const selectedDayEvaluations = useMemo(
    () => (selectedDayKey ? evaluationsByDay.get(selectedDayKey) || [] : []),
    [evaluationsByDay, selectedDayKey],
  );

  const stats = useMemo(() => {
    const total = evaluations.length;
    const pending = evaluations.filter((item) => isPendingEvaluationStatus(getEffectiveStatus(item))).length;
    const attended = evaluations.filter((item) => isAttendedEvaluationStatus(getEffectiveStatus(item))).length;
    const finalized = evaluations.filter((item) => isFinalEvaluationStatus(getEffectiveStatus(item))).length;
    const closed = evaluations.filter((item) => isClosedPackageEvaluationStatus(getEffectiveStatus(item))).length;
    const notClosed = evaluations.filter((item) => isNotClosedEvaluationStatus(getEffectiveStatus(item))).length;
    const noShow = evaluations.filter((item) => isNoShowEvaluationStatus(getEffectiveStatus(item))).length;
    const soldValue = evaluations
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
      conversionRate: attended > 0 ? (closed / attended) * 100 : 0,
      noShowRate: total > 0 ? (noShow / total) * 100 : 0,
      soldValue,
    };
  }, [evaluations]);

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

  const updateEvaluationStatus = async (status: EvaluationStatus) => {
    if (!selectedEvaluation) return;
    setUpdatingStatus(status);
    try {
      const res = await fetch("/api/crm/evaluations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedEvaluation.id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar avaliação");

      const updated = data.evaluation as Evaluation;
      setEvaluations((current) =>
        current.map((evaluation) => (evaluation.id === updated.id ? updated : evaluation)),
      );
      toast.success("Status da avaliação atualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar avaliação");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const todayKey = dateKey(new Date());
  const monthIndex = month.getMonth();

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Avaliações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Calendário das avaliações agendadas pelo Pipeline.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canViewAll && professionals.length > 0 && (
            <select
              value={professionalId}
              onChange={(event) => setProfessionalId(event.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="">Todas as responsáveis</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonth(new Date())}
            className="gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            Hoje
          </Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <MetricCard
          label="Mês"
          value={<span className="capitalize">{formatMonth(month)}</span>}
          icon={CalendarDays}
          iconClass="bg-muted text-muted-foreground"
        />
        <MetricCard
          label="Avaliações"
          value={stats.total}
          hint="Agendadas no mês"
          icon={CalendarCheck}
          iconClass="bg-violet-500/10 text-violet-300"
        />
        <MetricCard
          label="Pendentes"
          value={stats.pending}
          icon={Clock}
          iconClass="bg-amber-500/10 text-amber-300"
        />
        <MetricCard
          label="Finalizadas"
          value={stats.finalized}
          hint="Com desfecho registrado"
          icon={CheckCircle2}
          iconClass="bg-emerald-500/10 text-emerald-300"
        />
        <MetricCard
          label="Compareceram"
          value={stats.attended}
          icon={UserCheck}
          iconClass="bg-sky-500/10 text-sky-300"
        />
        <MetricCard
          label="Fecharam"
          value={stats.closed}
          icon={CheckCircle2}
          iconClass="bg-emerald-500/10 text-emerald-300"
        />
        <MetricCard
          label="Não fecharam"
          value={stats.notClosed}
          icon={XCircle}
          iconClass="bg-rose-500/10 text-rose-300"
        />
        <MetricCard
          label="Não compareceram"
          value={stats.noShow}
          icon={UserX}
          iconClass="bg-orange-500/10 text-orange-300"
        />
        <MetricCard
          label="Taxa de falta"
          value={formatPercent(stats.noShowRate)}
          hint="Não compareceram / mês"
          icon={UserX}
          iconClass="bg-orange-500/10 text-orange-300"
        />
        <MetricCard
          label="Conversão"
          value={formatPercent(stats.conversionRate)}
          hint="Fechados / compareceram"
          icon={TrendingUp}
          iconClass="bg-cyan-500/10 text-cyan-300"
        />
        <MetricCard
          label="Valor vendido"
          value={formatCurrency(stats.soldValue)}
          hint="Avaliações fechadas"
          icon={TrendingUp}
          iconClass="bg-green-500/10 text-green-300"
        />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveEvaluationId(null)}
      >
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-bold capitalize text-foreground">{formatMonth(month)}</div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
              <div key={day} className="px-2 py-2">
                {day}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-7">
              {days.map((day) => {
                const key = dateKey(day);
                return (
                  <CalendarDayCell
                    key={key}
                    day={day}
                    evaluations={evaluationsByDay.get(key) || []}
                    isCurrentMonth={day.getMonth() === monthIndex}
                    isToday={key === todayKey}
                    onOpenEvaluation={setSelectedEvaluationId}
                    onOpenDay={setSelectedDayKey}
                  />
                );
              })}
            </div>
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
        <DialogContent className="sm:max-w-[560px]">
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
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor do negócio</div>
                      <div className="mt-1 font-semibold text-foreground">
                        {formatCurrency(Number(selectedEvaluation.pipelineValue || 0))}
                      </div>
                    </div>
                  </div>
                </div>

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
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusConfig.badgeClass}`}>
                          <span className={`h-2 w-2 rounded-full ${statusConfig.dotClass}`} />
                          {EVALUATION_STATUS_LABELS[status]}
                        </span>
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
                          onClick={() => updateEvaluationStatus(status)}
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
                </div>
              </div>

              <DialogFooter>
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
