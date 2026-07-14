"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineAnalytics } from "@/components/pipelines/pipeline-analytics";
import { Pipeline, PipelineStage } from "@prisma/client";
import { Deal } from "@/components/pipelines/deal-card";
import { useGlobalUnit } from "@/contexts/UnitContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  CurrencyInput,
  currencyValueToDigits,
  parseCurrencyDigits,
} from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePicker } from "@/components/ui/date-picker";
import { ProcedureSelector, type CatalogService } from "@/components/procedure-selector";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBrazilianPhone } from "@/lib/phone";
import { ArrowDown, ArrowUp, Building2, CalendarDays, Check, ChevronDown, Eye, EyeOff, Loader2, MapPin, MessageCircle, Phone, Plus, Settings2, SlidersHorizontal, Trash2, UserRound, X } from "lucide-react";

type PipelineStageView = PipelineStage & {
  baseName?: string;
  baseColor?: string;
  basePosition?: number;
  customName?: string | null;
  customColor?: string | null;
  customPosition?: number | null;
  isHidden?: boolean;
};
type PipelineWithStages = Pipeline & { stages?: PipelineStageView[] };
type ChatLinkState = {
  loading: boolean;
  available: boolean;
  canCreate?: boolean;
  url?: string;
  reason?: string;
};
type StageDraft = { name: string; color: string; isHidden: boolean };
type EvaluationAssignee = { id: string; name: string; email?: string | null; unit?: string | null };
const NEW_DEAL_SOURCES = ["Instagram", "Facebook", "WhatsApp", "Indicação", "Google", "Outro"];

function normalizeStageName(name?: string | null): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

function isDiscardStageName(name?: string | null): boolean {
  return ["perdido", "finalizado", "encerrado", "descartado", "sem_retorno", "nao_viavel"].includes(
    normalizeStageName(name),
  );
}

function isScheduledStageName(name?: string | null): boolean {
  return normalizeStageName(name) === "agendado";
}

function isClosedStageName(name?: string | null): boolean {
  return normalizeStageName(name) === "fechado";
}

function localDateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeInputValue(value?: string | null): string {
  if (!value) return "09:00";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "09:00";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function buildLocalDateTime(date: string, time: string) {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function buildSaoPauloDateStart(date: string) {
  if (!date) return null;
  const value = new Date(`${date}T00:00:00-03:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function sortStagesByPosition(stageList: PipelineStageView[]): PipelineStageView[] {
  return [...stageList].sort((a, b) => a.position - b.position);
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export default function PipelinePage() {
  const { globalUnit } = useGlobalUnit();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get("targetUserId") || "";
  const targetInstanceId = searchParams.get("targetInstanceId") || "";
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stages, setStages] = useState<PipelineStageView[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchSeqRef = useRef(0);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterOrder, setFilterOrder] = useState("recent");
  const [filterStageIds, setFilterStageIds] = useState<string[]>([]);
  const [canManageStages, setCanManageStages] = useState(false);
  const [evaluationAssignees, setEvaluationAssignees] = useState<EvaluationAssignee[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);

  // Modal for lost reason
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [dealToLose, setDealToLose] = useState<{ dealId: string; stageId: string } | null>(null);
  const [lostReason, setLostReason] = useState("");

  // Modal for scheduling evaluations
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [dealToSchedule, setDealToSchedule] = useState<{ dealId: string; stageId: string } | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleAssigneeUserId, setScheduleAssigneeUserId] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);

  // Modal for closing deals
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [dealToClose, setDealToClose] = useState<{ dealId: string; stageId: string } | null>(null);
  const [closeProcedureName, setCloseProcedureName] = useState("");
  const [closeValueDigits, setCloseValueDigits] = useState("");
  const [isClosingDeal, setIsClosingDeal] = useState(false);

  // Modal for Edit Deal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [dealToEdit, setDealToEdit] = useState<Deal | null>(null);
  const [editProcedureName, setEditProcedureName] = useState("");
  const [editValueDigits, setEditValueDigits] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editEvaluationDate, setEditEvaluationDate] = useState("");
  const [editEvaluationTime, setEditEvaluationTime] = useState("09:00");
  const [editEvaluationAssigneeUserId, setEditEvaluationAssigneeUserId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [chatLink, setChatLink] = useState<ChatLinkState | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addStageId, setAddStageId] = useState("");
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addSource, setAddSource] = useState(NEW_DEAL_SOURCES[0]);
  const [addProcedureName, setAddProcedureName] = useState("");
  const [addValueDigits, setAddValueDigits] = useState("");
  const [addScheduleDate, setAddScheduleDate] = useState("");
  const [addScheduleTime, setAddScheduleTime] = useState("09:00");
  const [addScheduleAssigneeUserId, setAddScheduleAssigneeUserId] = useState("");
  const [isAddingDeal, setIsAddingDeal] = useState(false);

  // Modal for pipeline columns
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [stageDrafts, setStageDrafts] = useState<Record<string, StageDraft>>({});
  const [stageSavingId, setStageSavingId] = useState<string | null>(null);
  const [stageMovingId, setStageMovingId] = useState<string | null>(null);

  const buildChatLinkParams = useCallback((dealId: string) => {
    const params = new URLSearchParams({ dealId });
    if (globalUnit) params.set("unit", globalUnit);
    if (targetUserId) params.set("targetUserId", targetUserId);
    if (targetInstanceId) params.set("targetInstanceId", targetInstanceId);
    return params;
  }, [globalUnit, targetInstanceId, targetUserId]);

  const pickDefaultAssignee = useCallback((assignees: EvaluationAssignee[]) => {
    if ((globalUnit || pipeline?.unit) === "Osasco") {
      return assignees.find((assignee) => normalizeStageName(assignee.name).includes("larissa"))?.id || "";
    }
    return "";
  }, [globalUnit, pipeline?.unit]);

  const fetchEvaluationAssignees = useCallback(async () => {
    setLoadingAssignees(true);
    try {
      const params = new URLSearchParams();
      if (globalUnit) params.set("unit", globalUnit);
      const res = await fetch(`/api/crm/evaluations/assignees${params.toString() ? `?${params.toString()}` : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao carregar responsáveis");
      const assignees = data.assignees || [];
      setEvaluationAssignees(assignees);
      const defaultAssignee = pickDefaultAssignee(assignees);
      setScheduleAssigneeUserId((current) => current || defaultAssignee);
      setEditEvaluationAssigneeUserId((current) => current || defaultAssignee);
    } catch {
      setEvaluationAssignees([]);
    } finally {
      setLoadingAssignees(false);
    }
  }, [globalUnit, pickDefaultAssignee]);

  const fetchData = useCallback(async () => {
    const seq = fetchSeqRef.current + 1;
    fetchSeqRef.current = seq;
    setLoading(true);
    try {
      const pipelineParams = new URLSearchParams();
      if (targetUserId) pipelineParams.set("targetUserId", targetUserId);
      if (targetInstanceId) pipelineParams.set("targetInstanceId", targetInstanceId);
      const pipelineQuery = pipelineParams.toString();
      const res = await fetch(`/api/pipelines${pipelineQuery ? `?${pipelineQuery}` : ""}`);
      if (!res.ok) throw new Error("Failed to load pipelines");
      const data: PipelineWithStages[] = await res.json();
      
      if (data && data.length > 0) {
        const p = data.find((item) => !globalUnit || item.unit === globalUnit) || data[0];
        if (seq !== fetchSeqRef.current) return;
        setPipeline(p);
        const nextStages = p.stages || [];
        setStages(nextStages);
        const nextStageIds = new Set(nextStages.map((stage) => stage.id));
        setFilterStageIds((prev) => {
          const next = prev.filter((id) => nextStageIds.has(id));
          return areStringArraysEqual(prev, next) ? prev : next;
        });

        const params = new URLSearchParams({ pipelineId: p.id, order: filterOrder });
        if (globalUnit) params.set("unit", globalUnit);
        if (filterStartDate) params.set("startDate", filterStartDate);
        if (filterEndDate) params.set("endDate", filterEndDate);
        if (filterStageIds.length) params.set("stageId", filterStageIds.join(","));
        if (targetUserId) params.set("targetUserId", targetUserId);
        if (targetInstanceId) params.set("targetInstanceId", targetInstanceId);
        const dealsRes = await fetch(`/api/pipeline?${params}`);
        if (dealsRes.ok) {
          const dealsData = await dealsRes.json();
          if (seq !== fetchSeqRef.current) return;
          setDeals(dealsData);
        }
      }
    } catch (e) {
      toast.error("Erro ao carregar o funil");
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [filterStartDate, filterEndDate, filterOrder, filterStageIds, globalUnit, targetInstanceId, targetUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!editModalOpen || !dealToEdit) {
      setChatLink(null);
      return;
    }

    let cancelled = false;
    const params = buildChatLinkParams(dealToEdit.id);

    setChatLink({ loading: true, available: false });
    fetch(`/api/pipeline/chat-link?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setChatLink({
          loading: false,
          available: !!data.available,
          canCreate: !!data.canCreate,
          url: data.url,
          reason: data.reason || (res.ok ? undefined : "Chat indisponivel"),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setChatLink({ loading: false, available: false, reason: "Falha ao resolver conversa" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [buildChatLinkParams, dealToEdit, editModalOpen]);

  useEffect(() => {
    setFilterStageIds([]);
    setScheduleAssigneeUserId("");
    setEditEvaluationAssigneeUserId("");
  }, [globalUnit]);

  useEffect(() => {
    fetchEvaluationAssignees();
  }, [fetchEvaluationAssignees]);

  useEffect(() => {
    const unit = globalUnit || pipeline?.unit || "";
    if (!unit) {
      setCatalogServices([]);
      return;
    }

    let cancelled = false;
    fetch(`/api/catalog?unit=${encodeURIComponent(unit)}`)
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
  }, [globalUnit, pipeline?.unit]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const user = data?.user;
        const permissions = user?.permissions || {};
        setCanManageStages(user?.role === "ADMINISTRADOR" || permissions.admin === true || permissions.crmPipelineStages === true);
      })
      .catch(() => {
        setCanManageStages(false);
      });
  }, []);

  const updateDealStage = async (
    dealId: string,
    stageId: string,
    reason?: string,
    evaluation?: { startTime: string; assigneeUserId?: string; durationMinutes?: number },
    closedSale?: { procedureName: string; value: number },
  ) => {
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: dealId, 
          stageId,
          ...(reason ? { lostReason: reason } : {}),
          ...(evaluation
            ? {
                evaluationStartTime: evaluation.startTime,
                evaluationAssigneeUserId: evaluation.assigneeUserId,
                evaluationDurationMinutes: evaluation.durationMinutes || 60,
              }
            : {}),
          ...(closedSale
            ? {
                procedureName: closedSale.procedureName,
                value: closedSale.value,
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao mover o negócio");
      fetchData();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao mover o negócio");
      fetchData(); // revert optimistic
      return false;
    }
  };

  const handleDealMoved = (dealId: string, newStageId: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stageId === newStageId) return;

    const stage = stages.find((s) => s.id === newStageId);

    if (isScheduledStageName(stage?.name)) {
      const defaultAssignee = pickDefaultAssignee(evaluationAssignees);
      setDealToSchedule({ dealId, stageId: newStageId });
      setScheduleDate("");
      setScheduleTime("09:00");
      setScheduleAssigneeUserId(defaultAssignee);
      setScheduleModalOpen(true);
      return;
    }

    if (isClosedStageName(stage?.name)) {
      setDealToClose({ dealId, stageId: newStageId });
      setCloseProcedureName(deal.procedureName || "");
      setCloseValueDigits(currencyValueToDigits(Number(deal.value || 0)));
      setCloseModalOpen(true);
      return;
    }
    
    // Optimistic UI update
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stageId: newStageId } : d))
    );

    // Etapas de descarte/encerramento precisam registrar motivo.
    if (isDiscardStageName(stage?.name)) {
      setDealToLose({ dealId, stageId: newStageId });
      setLostReason("");
      setLostModalOpen(true);
      return;
    }

    updateDealStage(dealId, newStageId);
    toast.success(`Movido para ${stage?.name || "nova fase"}`);
  };

  const cancelCloseDeal = () => {
    setCloseModalOpen(false);
    setDealToClose(null);
    setCloseProcedureName("");
    setCloseValueDigits("");
    setIsClosingDeal(false);
    fetchData();
  };

  const confirmClosedDeal = async () => {
    if (!dealToClose) return;
    const procedureName = closeProcedureName.trim();
    const value = parseCurrencyDigits(closeValueDigits);
    if (!procedureName) {
      toast.error("Informe o procedimento fechado");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor de fechamento válido");
      return;
    }

    setIsClosingDeal(true);
    const ok = await updateDealStage(
      dealToClose.dealId,
      dealToClose.stageId,
      undefined,
      undefined,
      { procedureName, value },
    );
    setIsClosingDeal(false);
    if (!ok) return;

    toast.success("Negócio fechado");
    setCloseModalOpen(false);
    setDealToClose(null);
    setCloseProcedureName("");
    setCloseValueDigits("");
  };

  const confirmLost = () => {
    if (!dealToLose) return;
    updateDealStage(dealToLose.dealId, dealToLose.stageId, lostReason.trim() || "Encerrado sem motivo informado");
    setLostModalOpen(false);
    setDealToLose(null);
    toast.success("Negócio encerrado");
  };

  const cancelLost = () => {
    setLostModalOpen(false);
    setDealToLose(null);
    setLostReason("");
    fetchData();
  };

  const cancelSchedule = () => {
    setScheduleModalOpen(false);
    setDealToSchedule(null);
    setScheduleDate("");
    setScheduleTime("09:00");
    setScheduleAssigneeUserId("");
    setIsScheduling(false);
    fetchData();
  };

  const confirmSchedule = async () => {
    if (!dealToSchedule) return;
    const startTime = buildLocalDateTime(scheduleDate, scheduleTime);
    if (!startTime) {
      toast.error("Informe a data e o horário da avaliação");
      return;
    }
    if ((globalUnit || pipeline?.unit) !== "Osasco" && !scheduleAssigneeUserId) {
      toast.error("Selecione a responsável pela avaliação");
      return;
    }

    const stage = stages.find((item) => item.id === dealToSchedule.stageId);
    setIsScheduling(true);
    const ok = await updateDealStage(dealToSchedule.dealId, dealToSchedule.stageId, undefined, {
      startTime,
      assigneeUserId: scheduleAssigneeUserId || undefined,
      durationMinutes: 60,
    });
    setIsScheduling(false);
    if (!ok) return;

    toast.success(`Avaliação agendada em ${stage?.name || "Agendado"}`);
    setScheduleModalOpen(false);
    setDealToSchedule(null);
    setScheduleDate("");
    setScheduleTime("09:00");
  };

  const handleAddDeal = (stageId: string) => {
    const defaultAssignee = pickDefaultAssignee(evaluationAssignees);
    setAddStageId(stageId);
    setAddName("");
    setAddPhone("");
    setAddSource(NEW_DEAL_SOURCES[0]);
    setAddProcedureName("");
    setAddValueDigits("");
    setAddScheduleDate("");
    setAddScheduleTime("09:00");
    setAddScheduleAssigneeUserId(defaultAssignee);
    setAddModalOpen(true);
  };

  const closeAddDealModal = () => {
    setAddModalOpen(false);
    setAddStageId("");
    setAddName("");
    setAddPhone("");
    setAddSource(NEW_DEAL_SOURCES[0]);
    setAddProcedureName("");
    setAddValueDigits("");
    setAddScheduleDate("");
    setAddScheduleTime("09:00");
    setAddScheduleAssigneeUserId("");
    setIsAddingDeal(false);
  };

  const createDeal = async () => {
    if (!pipeline || !addStageId) return;
    const name = addName.trim();
    const phone = addPhone.trim();
    if (!name) {
      toast.error("Informe o nome do lead");
      return;
    }
    if (!phone) {
      toast.error("Informe o telefone do lead");
      return;
    }

    const stage = stages.find((item) => item.id === addStageId);
    const isScheduledStage = isScheduledStageName(stage?.name);
    const isClosedStage = isClosedStageName(stage?.name);
    const procedureName = addProcedureName.trim();
    const value = parseCurrencyDigits(addValueDigits);
    if (isClosedStage && !procedureName) {
      toast.error("Informe o procedimento fechado");
      return;
    }
    if (isClosedStage && (!Number.isFinite(value) || value <= 0)) {
      toast.error("Informe um valor de fechamento válido");
      return;
    }
    const evaluationStartTime = isScheduledStage ? buildLocalDateTime(addScheduleDate, addScheduleTime) : null;
    if (isScheduledStage && !evaluationStartTime) {
      toast.error("Informe a data e o horário da avaliação");
      return;
    }
    if (isScheduledStage && (globalUnit || pipeline.unit) !== "Osasco" && !addScheduleAssigneeUserId) {
      toast.error("Selecione a responsável pela avaliação");
      return;
    }

    const params = new URLSearchParams();
    if (targetUserId) params.set("targetUserId", targetUserId);
    if (targetInstanceId) params.set("targetInstanceId", targetInstanceId);
    const query = params.toString();

    setIsAddingDeal(true);
    try {
      const res = await fetch(`/api/pipeline${query ? `?${query}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: name,
          contactPhone: phone,
          source: addSource,
          socialSource: addSource,
          stageId: addStageId,
          pipelineId: pipeline.id,
          unit: globalUnit || pipeline.unit,
          notes: `Lead criado manualmente${addSource ? ` via ${addSource}` : ""}`,
          ...(isClosedStage ? { procedureName, value } : {}),
          ...(evaluationStartTime
            ? {
                evaluationStartTime,
                evaluationAssigneeUserId: addScheduleAssigneeUserId || undefined,
                evaluationDurationMinutes: 60,
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao criar negócio");
      toast.success("Negócio criado");
      closeAddDealModal();
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar negócio");
    } finally {
      setIsAddingDeal(false);
    }
  };

  const handleEditDeal = (deal: Deal) => {
    setDealToEdit(deal);
    setEditProcedureName(deal.procedureName || "");
    setEditValueDigits(currencyValueToDigits(Number(deal.value || 0)));
    setEditDate(deal.closedAt ? new Date(deal.closedAt).toISOString().split('T')[0] : "");
    setEditEvaluationDate(localDateInputValue(deal.evaluationStartTime));
    setEditEvaluationTime(localTimeInputValue(deal.evaluationStartTime));
    setEditEvaluationAssigneeUserId(deal.evaluationAssigneeUserId || pickDefaultAssignee(evaluationAssignees));
    setEditNotes(deal.notes || "");
    setChatLink(null);
    setEditModalOpen(true);
  };

  const goToChat = async () => {
    if (chatLink?.available && chatLink.url) {
      router.push(chatLink.url);
      return;
    }
    if (!chatLink?.canCreate || !dealToEdit) return;

    setChatLink((current) => current ? { ...current, loading: true } : { loading: true, available: false });
    try {
      const params = buildChatLinkParams(dealToEdit.id);
      params.set("create", "1");
      const res = await fetch(`/api/pipeline/chat-link?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.available || !data.url) {
        throw new Error(data.reason || "Falha ao iniciar conversa");
      }
      setChatLink({
        loading: false,
        available: true,
        url: data.url,
        reason: data.reason,
      });
      router.push(data.url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Falha ao iniciar conversa";
      setChatLink({ loading: false, available: false, reason });
      toast.error(reason);
    }
  };

  const saveDealEdits = async () => {
    if (!dealToEdit) return;
    const targetStage = stages.find((stage) => stage.id === dealToEdit.stageId);
    const isClosedStage = isClosedStageName(targetStage?.name);
    const procedureName = editProcedureName.trim();
    const value = parseCurrencyDigits(editValueDigits);
    if (isClosedStage && !procedureName) {
      toast.error("Informe o procedimento fechado");
      return;
    }
    if (isClosedStage && (!Number.isFinite(value) || value <= 0)) {
      toast.error("Informe um valor de fechamento válido");
      return;
    }

    setIsSaving(true);
    try {
      const evaluationStartTime = buildLocalDateTime(editEvaluationDate, editEvaluationTime);
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dealToEdit.id,
          value,
          ...(showEditProcedureField ? { procedureName: procedureName || null } : {}),
          closedAt: buildSaoPauloDateStart(editDate),
          notes: editNotes,
          ...(evaluationStartTime
            ? {
                evaluationStartTime,
                evaluationAssigneeUserId: editEvaluationAssigneeUserId || undefined,
                evaluationDurationMinutes: 60,
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar o negócio");
      toast.success("Negócio atualizado!");
      setEditModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar o negócio");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDeal = async () => {
    if (!dealToEdit) return;
    if (!confirm(`Tem certeza que deseja excluir o negócio de ${dealToEdit.clientName}?`)) return;
    
    setIsSaving(true);
    try {
      const res = await fetch(`/api/pipeline?id=${dealToEdit.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Negócio excluído com sucesso!");
      setEditModalOpen(false);
      fetchData();
    } catch {
      toast.error("Erro ao excluir o negócio");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStageFilter = (stageId: string) => {
    setFilterStageIds((prev) => prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId]);
  };

  const clearPipelineFilters = () => {
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterOrder("recent");
    setFilterStageIds([]);
  };

  const openStageManager = () => {
    setStageDrafts(
      Object.fromEntries(
        sortStagesByPosition(stages).map((stage) => [
          stage.id,
          { name: stage.name, color: stage.color, isHidden: stage.isHidden === true },
        ]),
      )
    );
    setStageModalOpen(true);
  };

  const buildStagePreferenceUrl = () => {
    if (!pipeline) return "";
    const params = new URLSearchParams();
    if (targetUserId) params.set("targetUserId", targetUserId);
    if (targetInstanceId) params.set("targetInstanceId", targetInstanceId);
    const query = params.toString();
    return `/api/pipelines/${pipeline.id}/stages${query ? `?${query}` : ""}`;
  };

  const serializeStagePreferences = (
    stageList: PipelineStageView[],
    draftOverride: Record<string, StageDraft> = stageDrafts,
  ) =>
    sortStagesByPosition(stageList).map((stage, position) => {
      const draft = draftOverride[stage.id] || {
        name: stage.name,
        color: stage.color,
        isHidden: stage.isHidden === true,
      };
      return {
        id: stage.id,
        name: draft.name.trim() || stage.name,
        color: draft.color || stage.color,
        position,
        isHidden: draft.isHidden === true,
      };
    });

  const persistStagePreferences = async (
    stageList: PipelineStageView[],
    draftOverride?: Record<string, StageDraft>,
  ) => {
    const res = await fetch(buildStagePreferenceUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "user",
        stages: serializeStagePreferences(stageList, draftOverride),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erro ao salvar preferências das colunas");
  };

  const moveStage = async (stageId: string, direction: -1 | 1) => {
    if (!pipeline) return;

    const orderedStages = sortStagesByPosition(stages);
    const currentIndex = orderedStages.findIndex((stage) => stage.id === stageId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedStages.length) return;

    const reordered = [...orderedStages];
    const [movedStage] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, movedStage);
    const normalized = reordered.map((stage, position) => ({ ...stage, position }));

    setStageMovingId(stageId);
    setStages(normalized);
    try {
      await persistStagePreferences(normalized);
      toast.success("Ordem salva apenas neste perfil");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao reordenar colunas");
      await fetchData();
    } finally {
      setStageMovingId(null);
    }
  };

  const saveStage = async (stage: PipelineStageView) => {
    if (!pipeline) return;
    const draft = stageDrafts[stage.id];
    const name = draft?.name?.trim();
    if (!name) {
      toast.error("Informe o nome da coluna");
      return;
    }
    setStageSavingId(stage.id);
    try {
      const nextStages = stages.map((item) =>
        item.id === stage.id
          ? { ...item, name, color: draft.color, isHidden: draft.isHidden }
          : item,
      );
      setStages(nextStages);
      await persistStagePreferences(nextStages);
      toast.success("Coluna personalizada apenas neste perfil");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar coluna");
    } finally {
      setStageSavingId(null);
    }
  };

  const toggleStageVisibility = async (stage: PipelineStageView) => {
    if (!pipeline) return;
    const currentDraft = stageDrafts[stage.id] || {
      name: stage.name,
      color: stage.color,
      isHidden: stage.isHidden === true,
    };
    const nextHidden = !currentDraft.isHidden;
    const visibleCount = stages.filter((item) => {
      const draft = stageDrafts[item.id];
      return !(draft?.isHidden ?? item.isHidden === true);
    }).length;
    if (nextHidden && visibleCount <= 1) {
      toast.error("O funil precisa ter pelo menos uma coluna visível");
      return;
    }

    const nextDrafts = {
      ...stageDrafts,
      [stage.id]: { ...currentDraft, isHidden: nextHidden },
    };
    const nextStages = stages.map((item) =>
      item.id === stage.id ? { ...item, isHidden: nextHidden } : item,
    );

    setStageSavingId(stage.id);
    setStageDrafts(nextDrafts);
    setStages(nextStages);
    if (nextHidden) {
      setFilterStageIds((prev) => prev.filter((id) => id !== stage.id));
    }
    try {
      await persistStagePreferences(nextStages, nextDrafts);
      toast.success(nextHidden ? "Coluna ocultada apenas neste perfil" : "Coluna exibida neste perfil");
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar visibilidade");
      await fetchData();
    } finally {
      setStageSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Nenhum funil encontrado. Execute a migração do banco de dados.
      </div>
    );
  }

  // Resumo dos filtros ativos — alimenta o badge do botão e os chips removíveis.
  const periodLabel = (() => {
    const fmt = (s: string) => s.split("-").reverse().join("/");
    if (filterStartDate && filterEndDate) return `${fmt(filterStartDate)} → ${fmt(filterEndDate)}`;
    if (filterStartDate) return `A partir de ${fmt(filterStartDate)}`;
    if (filterEndDate) return `Até ${fmt(filterEndDate)}`;
    return "";
  })();
  const hasPeriod = Boolean(filterStartDate || filterEndDate);
  const scopeLabel = globalUnit ? `Mostrando negócios de ${globalUnit}` : "Mostrando todos os negócios";
  const editPhone = formatBrazilianPhone(dealToEdit?.clientPhone);
  const editOriginUnit = dealToEdit?.clientOriginUnit || "Nao informado";
  const editCurrentUnit = dealToEdit?.clientUnit || dealToEdit?.unit || "Nao informado";
  const editStage = dealToEdit ? stages.find((stage) => stage.id === dealToEdit.stageId) : null;
  const showEvaluationFields = !!dealToEdit && (isScheduledStageName(editStage?.name) || !!dealToEdit.evaluationStartTime);
  const showEditProcedureField = isClosedStageName(editStage?.name) || !!dealToEdit?.procedureName;
  const addStage = stages.find((stage) => stage.id === addStageId) || null;
  const showAddScheduleFields = isScheduledStageName(addStage?.name);
  const showAddCloseFields = isClosedStageName(addStage?.name);
  const chatDisabled = !chatLink?.available || (!chatLink?.url && !chatLink?.canCreate) || chatLink.loading;
  const chatTooltip = chatLink?.loading
    ? "Resolvendo conversa..."
    : chatLink?.reason || "Chat indisponivel para este lead";
  const orderedStages = sortStagesByPosition(stages);
  const visibleStages = orderedStages.filter((stage) => stage.isHidden !== true);
  const visibleStageIds = new Set(visibleStages.map((stage) => stage.id));
  const visibleFilterStageIds = filterStageIds.filter((id) => visibleStageIds.has(id));
  const activeFilterCount =
    visibleFilterStageIds.length + (hasPeriod ? 1 : 0) + (filterOrder !== "recent" ? 1 : 0);
  const visibleDeals = deals.filter((deal) => !!deal.stageId && visibleStageIds.has(deal.stageId));

  return (
    <div className="absolute inset-0 flex flex-col bg-background px-4 sm:px-6 pt-4 sm:pt-6 pb-0">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {pipeline.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie suas vendas arrastando e soltando os negócios
          </p>
        </div>
        {canManageStages && (
          <Button variant="outline" size="sm" onClick={openStageManager} className="shrink-0 gap-2">
            <Settings2 className="h-4 w-4" />
            Gerenciar colunas
          </Button>
        )}
      </div>

      <div className="mb-4">
        <PipelineAnalytics stages={visibleStages} deals={visibleDeals} />
      </div>

      {/* Card único: filtros como cabeçalho (com divisória) + funil logo abaixo,
          mesma borda do início ao fim — sem caixas soltas desalinhadas. */}
      <div className="min-h-0 flex-1 flex flex-col rounded-t-xl border border-b-0 bg-card/50 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5 shrink-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              Filtrar
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="grid w-[420px] max-w-[calc(100vw-2rem)] gap-3 rounded-xl border-border bg-card p-3 shadow-xl">
              <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-2">
                <div>
                  <div className="text-sm font-bold text-foreground">Filtros do pipeline</div>
                  <div className="text-xs text-muted-foreground">Combine período, etapa e ordenação.</div>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearPipelineFilters}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Período
                </Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                  <div className="min-w-0">
                    <DatePicker value={filterStartDate} onChange={setFilterStartDate} variant="compact" calendarSize="small" placeholder="Data inicial" />
                  </div>
                  <span className="hidden text-center text-xs text-muted-foreground sm:block">até</span>
                  <div className="min-w-0">
                    <DatePicker value={filterEndDate} onChange={setFilterEndDate} variant="compact" calendarSize="small" placeholder="Data final" />
                  </div>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Ordenar
                </Label>
                <select
                  value={filterOrder}
                  onChange={(e) => setFilterOrder(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="recent">Mais recente primeiro</option>
                  <option value="oldest">Mais antigo primeiro</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Etapas
                </Label>
                <div className="grid max-h-44 gap-0.5 overflow-y-auto pr-1">
                  {visibleStages.map((stage) => {
                    const checked = filterStageIds.includes(stage.id);
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => toggleStageFilter(stage.id)}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                            checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"
                          }`}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                        <span className={`text-sm ${checked ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                          {stage.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>

        {hasPeriod && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
            <CalendarDays className="size-3 text-muted-foreground" />
            {periodLabel}
            <button
              type="button"
              onClick={() => { setFilterStartDate(""); setFilterEndDate(""); }}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        )}

        {visibleFilterStageIds.map((id) => {
          const stage = visibleStages.find((s) => s.id === id);
          if (!stage) return null;
          return (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: stage.color }} />
              {stage.name}
              <button
                type="button"
                onClick={() => toggleStageFilter(id)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}

        {filterOrder !== "recent" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
            Mais antigo primeiro
            <button
              type="button"
              onClick={() => setFilterOrder("recent")}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {activeFilterCount === 0 ? (
            <span>{scopeLabel}</span>
          ) : (
            <button type="button" onClick={clearPipelineFilters} className="font-semibold transition-colors hover:text-foreground">
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 flex flex-col p-4 overflow-hidden">
        <PipelineBoard
          stages={visibleStages}
          deals={visibleDeals}
          onDealMoved={handleDealMoved}
          onAddDeal={handleAddDeal}
          onEditDeal={handleEditDeal}
        />
      </div>
      </div>

      <Dialog open={closeModalOpen} onOpenChange={(open) => (open ? setCloseModalOpen(true) : cancelCloseDeal())}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Concluir fechamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Informe o procedimento vendido e o valor antes de mover o negócio para Fechado.
            </p>
            <div className="grid gap-2">
              <Label>Procedimento</Label>
              <ProcedureSelector
                services={catalogServices}
                value={closeProcedureName}
                onChange={(name, price) => {
                  setCloseProcedureName(name);
                  if (price !== undefined) {
                    setCloseValueDigits(currencyValueToDigits(price));
                  }
                }}
                placeholder="Buscar ou informar procedimento"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="closeDealValue">Valor</Label>
              <CurrencyInput
                id="closeDealValue"
                digits={closeValueDigits}
                onDigitsChange={setCloseValueDigits}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cancelCloseDeal} disabled={isClosingDeal}>
              Cancelar
            </Button>
            <Button onClick={confirmClosedDeal} disabled={isClosingDeal}>
              {isClosingDeal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Confirmar fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lostModalOpen} onOpenChange={(open) => (open ? setLostModalOpen(true) : cancelLost())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo do Encerramento</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-2 text-sm text-muted-foreground">
              Por que este lead foi encerrado ou descartado?
            </p>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Ex: Sem retorno, não viável, sem interesse, valor incompatível, número inválido..."
              className="min-h-[100px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={cancelLost}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmLost}>
              Confirmar Encerramento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleModalOpen} onOpenChange={(open) => (open ? setScheduleModalOpen(true) : cancelSchedule())}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Agendar avaliação</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Informe quando a avaliação vai acontecer antes de mover o lead para Agendado.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
              <div className="grid gap-2">
                <Label>Data</Label>
                <DatePicker value={scheduleDate} onChange={setScheduleDate} variant="input" placeholder="Data da avaliação" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scheduleTime">Horário</Label>
                <Input
                  id="scheduleTime"
                  type="time"
                  value={scheduleTime}
                  onChange={(event) => setScheduleTime(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Responsável</Label>
              {(globalUnit || pipeline?.unit) === "Osasco" && pickDefaultAssignee(evaluationAssignees) ? (
                <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                  <UserRound className="h-4 w-4 text-primary" />
                  {evaluationAssignees.find((assignee) => assignee.id === pickDefaultAssignee(evaluationAssignees))?.name || "Larissa"}
                </div>
              ) : (
                <select
                  value={scheduleAssigneeUserId}
                  onChange={(event) => setScheduleAssigneeUserId(event.target.value)}
                  disabled={loadingAssignees}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="">Selecione a responsável</option>
                  {evaluationAssignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-muted-foreground">
                A lista mostra apenas pessoas da unidade selecionada.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cancelSchedule} disabled={isScheduling}>
              Cancelar
            </Button>
            <Button onClick={confirmSchedule} disabled={isScheduling}>
              {isScheduling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addModalOpen} onOpenChange={(open) => (open ? setAddModalOpen(true) : closeAddDealModal())}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Novo negócio{addStage ? ` em ${addStage.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="addDealName">Nome</Label>
              <Input
                id="addDealName"
                value={addName}
                onChange={(event) => setAddName(event.target.value)}
                placeholder="Nome do lead"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="addDealPhone">Telefone</Label>
              <Input
                id="addDealPhone"
                value={addPhone}
                onChange={(event) => setAddPhone(event.target.value)}
                placeholder="(11) 99999-9999"
                inputMode="tel"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="addDealSource">Rede social</Label>
              <select
                id="addDealSource"
                value={addSource}
                onChange={(event) => setAddSource(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {NEW_DEAL_SOURCES.map((sourceOption) => (
                  <option key={sourceOption} value={sourceOption}>
                    {sourceOption}
                  </option>
                ))}
              </select>
            </div>

            {showAddCloseFields && (
              <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <Label className="text-sm font-semibold">Dados do fechamento</Label>
                <div className="grid gap-2">
                  <Label>Procedimento</Label>
                  <ProcedureSelector
                    services={catalogServices}
                    value={addProcedureName}
                    onChange={(name, price) => {
                      setAddProcedureName(name);
                      if (price !== undefined) {
                        setAddValueDigits(currencyValueToDigits(price));
                      }
                    }}
                    placeholder="Buscar ou informar procedimento"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="addDealValue">Valor</Label>
                  <CurrencyInput
                    id="addDealValue"
                    digits={addValueDigits}
                    onDigitsChange={setAddValueDigits}
                  />
                </div>
              </div>
            )}

            {showAddScheduleFields && (
              <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <div>
                  <Label className="text-sm font-semibold">Avaliação agendada</Label>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                  <div className="grid gap-2">
                    <Label>Data</Label>
                    <DatePicker value={addScheduleDate} onChange={setAddScheduleDate} variant="input" placeholder="Data da avaliação" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="addScheduleTime">Horário</Label>
                    <Input
                      id="addScheduleTime"
                      type="time"
                      value={addScheduleTime}
                      onChange={(event) => setAddScheduleTime(event.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Responsável</Label>
                  {(globalUnit || pipeline?.unit) === "Osasco" && pickDefaultAssignee(evaluationAssignees) ? (
                    <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                      <UserRound className="h-4 w-4 text-primary" />
                      {evaluationAssignees.find((assignee) => assignee.id === pickDefaultAssignee(evaluationAssignees))?.name || "Larissa"}
                    </div>
                  ) : (
                    <select
                      value={addScheduleAssigneeUserId}
                      onChange={(event) => setAddScheduleAssigneeUserId(event.target.value)}
                      disabled={loadingAssignees}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    >
                      <option value="">Selecione a responsável</option>
                      {evaluationAssignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeAddDealModal} disabled={isAddingDeal}>
              Cancelar
            </Button>
            <Button onClick={createDeal} disabled={isAddingDeal}>
              {isAddingDeal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Editar Negócio: {dealToEdit?.clientName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    Telefone
                  </div>
                  <div className="truncate font-mono text-sm text-foreground">
                    {editPhone || "Sem telefone"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    Origem
                  </div>
                  <div className="truncate text-sm font-medium text-foreground">
                    {editOriginUnit}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Atual
                  </div>
                  <div className="truncate text-sm font-medium text-foreground">
                    {editCurrentUnit}
                  </div>
                </div>
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex w-full sm:w-fit" />}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={goToChat}
                      disabled={chatDisabled}
                      className="w-full gap-2 sm:w-fit"
                    >
                      {chatLink?.loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageCircle className="h-4 w-4" />
                      )}
                      {chatLink?.canCreate && !chatLink?.url ? "Iniciar conversa" : "Ir ao chat"}
                    </Button>
                  </TooltipTrigger>
                  {chatDisabled && (
                    <TooltipContent side="bottom" className="max-w-xs text-left">
                      {chatTooltip}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>

            {showEditProcedureField && (
              <div className="grid gap-2">
                <Label>Procedimento</Label>
                <ProcedureSelector
                  services={catalogServices}
                  value={editProcedureName}
                  onChange={(name, price) => {
                    setEditProcedureName(name);
                    if (price !== undefined) {
                      setEditValueDigits(currencyValueToDigits(price));
                    }
                  }}
                  placeholder="Buscar ou informar procedimento"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="value">Valor (R$)</Label>
              <CurrencyInput
                id="value"
                digits={editValueDigits}
                onDigitsChange={setEditValueDigits}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="closedAt">Data de Fechamento</Label>
              <DatePicker value={editDate} onChange={setEditDate} variant="input" placeholder="Data de fechamento" />
            </div>
            {showEvaluationFields && (
              <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <div>
                  <Label className="text-sm font-semibold">Avaliação agendada</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Esta data alimenta a aba Avaliações.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                  <div className="grid gap-2">
                    <Label>Data</Label>
                    <DatePicker value={editEvaluationDate} onChange={setEditEvaluationDate} variant="input" placeholder="Data da avaliação" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="editEvaluationTime">Horário</Label>
                    <Input
                      id="editEvaluationTime"
                      type="time"
                      value={editEvaluationTime}
                      onChange={(event) => setEditEvaluationTime(event.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Responsável</Label>
                  {(globalUnit || pipeline?.unit) === "Osasco" && pickDefaultAssignee(evaluationAssignees) ? (
                    <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                      <UserRound className="h-4 w-4 text-primary" />
                      {evaluationAssignees.find((assignee) => assignee.id === pickDefaultAssignee(evaluationAssignees))?.name || "Larissa"}
                    </div>
                  ) : (
                    <select
                      value={editEvaluationAssigneeUserId}
                      onChange={(event) => setEditEvaluationAssigneeUserId(event.target.value)}
                      disabled={loadingAssignees}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    >
                      <option value="">Selecione a responsável</option>
                      {evaluationAssignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="notes">Pacote / Observações</Label>
              <Textarea
                id="notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Descreva o pacote ou anotações importantes..."
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-row sm:justify-between items-center w-full">
            <Button 
              variant="outline" 
              className="text-destructive hover:bg-destructive/10 hover:text-destructive border-transparent"
              onClick={deleteDeal}
              disabled={isSaving}
              type="button"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditModalOpen(false)} disabled={isSaving}>
                Cancelar
              </Button>
              <Button onClick={saveDealEdits} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stageModalOpen} onOpenChange={setStageModalOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Gerenciar colunas
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-sm font-bold text-foreground">Colunas existentes</div>
                  <div className="text-xs text-muted-foreground">Personalize nomes, cores, ordem e visibilidade só neste perfil.</div>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {visibleStages.length} visíveis de {orderedStages.length}
                </span>
              </div>
              <div className="grid max-h-[46vh] overflow-y-auto p-2">
                {orderedStages
                  .map((stage, index) => {
                    const draft = stageDrafts[stage.id] || {
                      name: stage.name,
                      color: stage.color,
                      isHidden: stage.isHidden === true,
                    };
                    const changed =
                      draft.name.trim() !== stage.name ||
                      draft.color !== stage.color ||
                      draft.isHidden !== (stage.isHidden === true);
                    const moving = stageMovingId === stage.id;
                    const saving = stageSavingId === stage.id;
                    const movementDisabled = !!stageMovingId || !!stageSavingId;
                    return (
                      <div
                        key={stage.id}
                        className={`grid gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40 sm:grid-cols-[74px_36px_1fr_auto_auto] sm:items-center ${
                          draft.isHidden ? "opacity-60" : ""
                        }`}
                      >
                        <div className="flex h-9 items-center gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() => moveStage(stage.id, -1)}
                            disabled={movementDisabled || index === 0}
                            title="Mover para cima"
                            aria-label={`Mover coluna ${stage.name} para cima`}
                            className="h-9 w-9"
                          >
                            {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() => moveStage(stage.id, 1)}
                            disabled={movementDisabled || index === orderedStages.length - 1}
                            title="Mover para baixo"
                            aria-label={`Mover coluna ${stage.name} para baixo`}
                            className="h-9 w-9"
                          >
                            {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />}
                          </Button>
                        </div>
                        <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-background">
                          <span className="h-5 w-5 rounded-md shadow-sm" style={{ backgroundColor: draft.color }} />
                          <Input
                            type="color"
                            value={draft.color}
                            onChange={(e) =>
                              setStageDrafts((prev) => ({
                                ...prev,
                                [stage.id]: { ...draft, color: e.target.value },
                              }))
                            }
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            aria-label={`Cor da coluna ${stage.name}`}
                          />
                        </label>
                        <Input
                          value={draft.name}
                          onChange={(e) =>
                            setStageDrafts((prev) => ({
                              ...prev,
                              [stage.id]: { ...draft, name: e.target.value },
                            }))
                          }
                          placeholder="Nome da coluna"
                          className="h-9"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant={changed ? "default" : "outline"}
                          onClick={() => saveStage(stage)}
                          disabled={!changed || !!stageMovingId || !!stageSavingId}
                          className="h-9 gap-2"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          {saving ? "Salvando..." : "Salvar"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => toggleStageVisibility(stage)}
                          disabled={!!stageMovingId || !!stageSavingId}
                          className="h-9 gap-2"
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : draft.isHidden ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                          {draft.isHidden ? "Mostrar" : "Ocultar"}
                        </Button>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStageModalOpen(false)} className="gap-2">
              <X className="h-4 w-4" />
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
