"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock3, Loader2, Search, UserRound, X } from "lucide-react";

import { DatePicker } from "@/components/ui/date-picker";
import {
  addDaysToDateKey,
  buildEvaluationAvailabilityMessage,
  type EvaluationAvailabilityPeriod,
  type EvaluationAvailabilitySlot,
} from "@/lib/evaluation-availability";
import { saoPauloDateKey } from "@/lib/date-filter";

type EvaluationAssignee = {
  id: string;
  name: string;
  email?: string | null;
};

type EvaluationAvailabilityDialogProps = {
  open: boolean;
  unit: string;
  onOpenChange: (open: boolean) => void;
  onInsertMessage: (message: string) => void;
};

const PERIOD_OPTIONS: Array<{ value: EvaluationAvailabilityPeriod; label: string }> = [
  { value: "all", label: "Dia inteiro" },
  { value: "morning", label: "Manhã · 07h às 11h30" },
  { value: "afternoon", label: "Tarde · 12h às 17h30" },
  { value: "evening", label: "Noite · 18h às 20h30" },
];

function fetchErrorMessage(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

export function EvaluationAvailabilityDialog({
  open,
  unit,
  onOpenChange,
  onInsertMessage,
}: EvaluationAvailabilityDialogProps) {
  const [assignees, setAssignees] = useState<EvaluationAssignee[]>([]);
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [period, setPeriod] = useState<EvaluationAvailabilityPeriod>("all");
  const [slots, setSlots] = useState<EvaluationAvailabilitySlot[]>([]);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [hasConsultedSlots, setHasConsultedSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const today = saoPauloDateKey();
    setStartDate(today);
    setEndDate(addDaysToDateKey(today, 2));
    setPeriod("all");
    setSlots([]);
    setSelectedSlotIds([]);
    setHasConsultedSlots(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || !unit) return;
    const controller = new AbortController();
    setLoadingAssignees(true);
    setAssignees([]);
    setAssigneeUserId("");

    fetch(`/api/crm/evaluations/assignees?unit=${encodeURIComponent(unit)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(fetchErrorMessage(payload, "Não foi possível carregar as responsáveis"));
        const nextAssignees = Array.isArray(payload.assignees) ? payload.assignees : [];
        setAssignees(nextAssignees);
        if (nextAssignees.length === 1) setAssigneeUserId(nextAssignees[0].id);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar as responsáveis");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAssignees(false);
      });

    return () => controller.abort();
  }, [open, unit]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loadingSlots) onOpenChange(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loadingSlots, onOpenChange, open]);

  const groupedSlots = useMemo(() => {
    const groups = new Map<string, EvaluationAvailabilitySlot[]>();
    slots.forEach((slot) => {
      const key = `${slot.weekdayLabel}, ${slot.dateLabel}`;
      groups.set(key, [...(groups.get(key) || []), slot]);
    });
    return Array.from(groups.entries());
  }, [slots]);

  const selectedSlots = useMemo(() => {
    const selected = new Set(selectedSlotIds);
    return slots.filter((slot) => selected.has(slot.id));
  }, [selectedSlotIds, slots]);

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (!endDate || endDate < value || addDaysToDateKey(value, 6) < endDate) {
      setEndDate(value);
    }
    setSlots([]);
    setSelectedSlotIds([]);
    setHasConsultedSlots(false);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    setSlots([]);
    setSelectedSlotIds([]);
    setHasConsultedSlots(false);
  };

  const loadSlots = async () => {
    if (!assigneeUserId) {
      setError("Selecione a responsável pela avaliação");
      return;
    }
    if (!startDate || !endDate) {
      setError("Selecione o período que deseja consultar");
      return;
    }

    setLoadingSlots(true);
    setHasConsultedSlots(false);
    setError(null);
    setSelectedSlotIds([]);
    try {
      const params = new URLSearchParams({
        unit,
        assigneeUserId,
        start: startDate,
        end: endDate,
        period,
      });
      const response = await fetch(`/api/crm/evaluations/availability?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(fetchErrorMessage(payload, "Não foi possível consultar os horários"));
      setSlots(Array.isArray(payload.slots) ? payload.slots : []);
      setHasConsultedSlots(true);
    } catch (requestError) {
      setSlots([]);
      setError(requestError instanceof Error ? requestError.message : "Não foi possível consultar os horários");
    } finally {
      setLoadingSlots(false);
    }
  };

  const toggleSlot = (slotId: string) => {
    setSelectedSlotIds((current) => {
      if (current.includes(slotId)) return current.filter((id) => id !== slotId);
      setError(null);
      return [...current, slotId];
    });
  };

  const insertMessage = () => {
    if (!selectedSlots.length) return;
    onInsertMessage(buildEvaluationAvailabilityMessage(selectedSlots));
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loadingSlots) onOpenChange(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="evaluation-availability-title"
        className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="evaluation-availability-title" className="text-lg font-semibold text-foreground">
                Enviar disponibilidade
              </h2>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Consulte a agenda de {unit} e escolha os horários que deseja oferecer.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loadingSlots}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 touch-pan-y space-y-5 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch] sm:px-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 sm:col-span-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <UserRound className="h-3.5 w-3.5 text-primary" />
                Responsável
              </span>
              <select
                value={assigneeUserId}
                onChange={(event) => {
                  setAssigneeUserId(event.target.value);
                  setSlots([]);
                  setSelectedSlotIds([]);
                  setHasConsultedSlots(false);
                  setError(null);
                }}
                disabled={loadingAssignees}
                className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
              >
                <option value="">{loadingAssignees ? "Carregando responsáveis..." : "Selecione uma responsável"}</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Data inicial</span>
              <DatePicker
                value={startDate}
                onChange={handleStartDateChange}
                variant="input"
                calendarSize="small"
                placeholder="Data inicial"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Data final</span>
              <DatePicker
                value={endDate}
                onChange={handleEndDateChange}
                variant="input"
                calendarSize="small"
                placeholder="Data final"
              />
            </label>

            <label className="space-y-1.5 sm:col-span-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Clock3 className="h-3.5 w-3.5 text-primary" />
                Período
              </span>
              <select
                value={period}
                onChange={(event) => {
                  setPeriod(event.target.value as EvaluationAvailabilityPeriod);
                  setSlots([]);
                  setSelectedSlotIds([]);
                  setHasConsultedSlots(false);
                }}
                className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() => void loadSlots()}
            disabled={loadingSlots || loadingAssignees || !assignees.length}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingSlots ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loadingSlots ? "Consultando agenda..." : "Consultar horários"}
          </button>

          {error && (
            <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-xs leading-5 text-destructive">
              {error}
            </p>
          )}

          {!loadingSlots && slots.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Horários disponíveis</p>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  {selectedSlotIds.length} selecionados
                </span>
              </div>
              {groupedSlots.map(([label, daySlots]) => (
                <div key={label} className="space-y-2">
                  <p className="text-xs font-semibold capitalize text-muted-foreground">{label}</p>
                  <div className="grid grid-cols-3 gap-2 min-[430px]:grid-cols-4 sm:grid-cols-6">
                    {daySlots.map((slot) => {
                      const selected = selectedSlotIds.includes(slot.id);
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => toggleSlot(slot.id)}
                          className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 text-sm font-semibold transition-colors ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5"
                          }`}
                          aria-pressed={selected}
                        >
                          {selected && <Check className="h-3.5 w-3.5" />}
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingSlots && !error && slots.length === 0 && assigneeUserId && (
            <p className="rounded-xl bg-muted/55 px-3 py-3 text-center text-xs leading-5 text-muted-foreground">
              {hasConsultedSlots
                ? "Não há horários livres nesse período. Altere as datas ou o turno e consulte novamente."
                : "Consulte a agenda para visualizar os horários livres de segunda a sábado."}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end sm:px-5 sm:pb-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loadingSlots}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={insertMessage}
            disabled={!selectedSlots.length || loadingSlots}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CalendarDays className="h-4 w-4" />
            Inserir na mensagem
          </button>
        </footer>
      </section>
    </div>
  );
}
