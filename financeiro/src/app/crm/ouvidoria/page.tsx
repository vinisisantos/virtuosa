"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useGlobalUnit } from "@/contexts/UnitContext";

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
};

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

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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

export default function AvaliacoesAgendaPage() {
  const { globalUnit } = useGlobalUnit();
  const [month, setMonth] = useState(() => new Date());
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [canViewAll, setCanViewAll] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const days = useMemo(() => buildCalendarDays(month), [month]);
  const evaluationsByDay = useMemo(() => {
    const map = new Map<string, Evaluation[]>();
    for (const evaluation of evaluations) {
      const key = dateKey(evaluation.startTime);
      const list = map.get(key) || [];
      list.push(evaluation);
      map.set(key, list);
    }
    return map;
  }, [evaluations]);

  const todayKey = dateKey(new Date());
  const monthIndex = month.getMonth();
  const scheduledCount = evaluations.length;
  const pendingCount = evaluations.filter((item) => item.status === "pendente").length;

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

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mês</div>
          <div className="mt-2 text-xl font-bold capitalize text-foreground">{formatMonth(month)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avaliações</div>
          <div className="mt-2 text-xl font-bold text-foreground">{scheduledCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pendentes</div>
          <div className="mt-2 text-xl font-bold text-foreground">{pendingCount}</div>
        </div>
      </div>

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
              const dayEvaluations = evaluationsByDay.get(key) || [];
              const isCurrentMonth = day.getMonth() === monthIndex;
              const isToday = key === todayKey;

              return (
                <div
                  key={key}
                  className={`min-h-[132px] border-b border-border p-2 sm:border-r ${
                    isCurrentMonth ? "bg-card" : "bg-muted/20 text-muted-foreground"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={`flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {dayEvaluations.length > 0 && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {dayEvaluations.length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {dayEvaluations.slice(0, 4).map((evaluation) => (
                      <div
                        key={evaluation.id}
                        className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          <Clock className="h-3 w-3 text-primary" />
                          {timeLabel(evaluation.startTime)}
                        </div>
                        <div className="mt-0.5 truncate text-foreground">{evaluation.clientName}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                          <UserRound className="h-3 w-3" />
                          {evaluation.profissional?.name || "Sem responsável"}
                        </div>
                      </div>
                    ))}
                    {dayEvaluations.length > 4 && (
                      <div className="text-[11px] font-semibold text-muted-foreground">
                        +{dayEvaluations.length - 4} avaliações
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
