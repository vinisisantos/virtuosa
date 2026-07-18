"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useGlobalUnit } from "@/contexts/UnitContext";
import { toast } from "@/components/toast";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { NewConversationDialog } from "@/components/whatsapp/new-conversation-dialog";
import {
  INBOX_INCREMENTAL_FULL_REFRESH_EVERY,
  INBOX_FULL_CONVERSATION_LIMIT,
  INBOX_INITIAL_CONVERSATION_LIMIT,
  INBOX_POLL_INTERVAL_MS,
  buildLocalDateTime,
  campaignTagStyle,
  conversationMatchesSearch,
  documentMessageMeta,
  extensionFromMimeType,
  fetchProfilePicCached,
  isScheduledPipelineStageName,
  mergeConversation,
  mimeTypeFromDataUrl,
  normalizePipelineStageName,
  normalizeProfilePicCacheKey,
  readConversationListMemoryCache,
  readProfilePicMemoryCache,
  sortConversationsByActivity,
  writeProfilePicMemoryCache,
  writeConversationListMemoryCache,
} from "@/lib/whatsapp/inbox-utils";
import type { Contact, Conversation, Message } from "@/lib/whatsapp/inbox-utils";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  Paperclip,
  Send,
  User,
  Loader2,
  X,
  FileText,
  Check,
  CheckCheck,
  Mic,
  ChevronLeft,
  Phone,
  Mail,
  Tag,
  Info,
  Circle,
  MessageSquare,
  Eye,
  ChevronDown,
  ChevronRight,
  Shield,
  XCircle,
  RotateCcw,
  Trash2,
  Copy,
  Pencil,
  Reply,
  Play,
  MoreVertical,
  Building2,
  Megaphone,
  CalendarDays,
  Download,
  Plus,
  AlertTriangle,
} from "lucide-react";

// Tipo para instâncias de colaboradores (admin)
interface CollaboratorInstance {
  id: string;
  userId: string;
  userName: string;
  displayName?: string | null;
  channel?: InstanceChannel;
  instanceName?: string;
  unit: string;
  status: string;
  phone?: string | null;
}

type InstanceChannel = "whatsapp" | "instagram";

// ─── Helpers ─────────────────────────────────────────────────
function formatTime(dateString: string) {
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Ontem";
    if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" });
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

function formatMessageTime(dateString: string) {
  try {
    return new Date(dateString).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const MESSAGE_TIME_ZONE = "America/Sao_Paulo";
const messageDatePartsFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: MESSAGE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function messageDateKey(dateValue: string | Date) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";

  const parts = messageDatePartsFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function formatMessageDateLabel(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  const dateKey = messageDateKey(date);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  if (dateKey === messageDateKey(today)) return "Hoje";
  if (dateKey === messageDateKey(yesterday)) return "Ontem";

  const [year, month, day] = dateKey.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = messageDateKey(today).split("-").map(Number);
  const daysAgo = Math.round(
    (Date.UTC(todayYear, todayMonth - 1, todayDay) - Date.UTC(year, month - 1, day)) / 86400000,
  );

  if (daysAgo > 1 && daysAgo < 7) {
    return date.toLocaleDateString("pt-BR", {
      timeZone: MESSAGE_TIME_ZONE,
      weekday: "long",
    });
  }

  return date.toLocaleDateString("pt-BR", {
    timeZone: MESSAGE_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: year === todayYear ? undefined : "numeric",
  });
}

const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
const MESSAGE_DELETE_WINDOW_MS = 60 * 60 * 1000;

function messageActionState(msg: Message) {
  const age = Date.now() - new Date(msg.timestamp).getTime();
  const isPersisted = !!msg.messageId && !msg.id.startsWith("temp_");
  const canEdit = !msg.readOnly && isPersisted && msg.fromMe && msg.type === "text" && msg.status !== "deleted" && age <= MESSAGE_EDIT_WINDOW_MS;
  const canDelete = !msg.readOnly && isPersisted && msg.fromMe && msg.status !== "deleted" && age <= MESSAGE_DELETE_WINDOW_MS;
  return { canEdit, canDelete };
}

function messageReplyPreview(msg: Message) {
  const body = (msg.body || "").trim();
  if (body) return body.length > 140 ? `${body.slice(0, 140)}...` : body;
  if (msg.type === "image") return "Imagem";
  if (msg.type === "audio" || msg.type === "ptt") return "Áudio";
  if (msg.type === "video") return "Vídeo";
  if (msg.type === "document") return msg.mediaFileName || "Documento";
  return "Mensagem";
}

function quotedMessageLabel(msg: Message) {
  if (msg.quotedMessageFromMe === true) return "Você";
  if (msg.quotedMessageFromMe === false) return "Contato";
  return "Mensagem citada";
}

function quotedMessageBody(msg: Message) {
  const body = (msg.quotedMessageBody || "").trim();
  if (body) return body.length > 180 ? `${body.slice(0, 180)}...` : body;
  if (msg.quotedMessageType === "image") return "Imagem";
  if (msg.quotedMessageType === "audio" || msg.quotedMessageType === "ptt") return "Áudio";
  if (msg.quotedMessageType === "video") return "Vídeo";
  if (msg.quotedMessageType === "document") return "Documento";
  return "Mensagem";
}

function getInstanceDisplayLabel(instance: CollaboratorInstance | null) {
  if (!instance) return "Meu Inbox";
  return instance.displayName?.trim() || instance.userName || "Instância";
}

function getInstanceChannel(instance?: CollaboratorInstance | null): InstanceChannel {
  return instance?.channel === "instagram" ? "instagram" : "whatsapp";
}

function ChannelIcon({ channel, className = "h-3.5 w-3.5" }: { channel: InstanceChannel; className?: string }) {
  return channel === "instagram" ? (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6Zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Zm-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884Zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.946L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"
      />
    </svg>
  );
}

function ChannelMark({ channel, size = "sm" }: { channel: InstanceChannel; size?: "sm" | "md" | "avatar" }) {
  const boxSize = size === "md" ? "h-6 w-6" : size === "avatar" ? "h-4 w-4" : "h-[18px] w-[18px]";
  const iconSize = size === "md" ? "h-6 w-6" : size === "avatar" ? "h-4 w-4" : "h-[18px] w-[18px]";

  if (channel === "whatsapp") {
    return (
      <span
        className={`inline-flex ${boxSize} items-center justify-center text-[#00A884]`}
        title="WhatsApp"
      >
        <ChannelIcon channel={channel} className={iconSize} />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex ${boxSize} items-center justify-center rounded-md bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400 text-white`}
      title="Instagram"
    >
      <ChannelIcon channel={channel} className={iconSize} />
    </span>
  );
}

function ContactAvatar({
  contact,
  sizeClassName,
  textClassName = "",
  fetchUrl,
  refreshUrl,
  onResolved,
}: {
  contact: Contact;
  sizeClassName: string;
  textClassName?: string;
  fetchUrl?: string;
  refreshUrl?: string;
  onResolved?: (url: string) => void;
}) {
  const initial = contact.name?.charAt(0)?.toUpperCase() || contact.phone?.charAt(0) || "?";
  const [pic, setPic] = React.useState<string | null>(contact.profilePic || null);
  const [refreshTried, setRefreshTried] = React.useState(false);

  React.useEffect(() => {
    const cacheKey = fetchUrl ? normalizeProfilePicCacheKey(fetchUrl) : null;
    const cachedPic = cacheKey ? readProfilePicMemoryCache(cacheKey) : undefined;

    if (contact.profilePic && cacheKey) {
      writeProfilePicMemoryCache(cacheKey, contact.profilePic);
    }

    setPic(contact.profilePic || cachedPic || null);
    setRefreshTried(false);
  }, [contact.id, contact.profilePic, fetchUrl]);

  React.useEffect(() => {
    if (pic || !fetchUrl) return;
    let cancelled = false;
    fetchProfilePicCached(fetchUrl)
      .then((profilePicUrl) => {
        if (!cancelled && profilePicUrl) {
          setPic(profilePicUrl);
          onResolved?.(profilePicUrl);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fetchUrl, onResolved, pic]);

  const refreshProfilePic = () => {
    if (!refreshUrl || refreshTried) {
      setPic(null);
      return;
    }

    setRefreshTried(true);
    fetchProfilePicCached(refreshUrl, true)
      .then((profilePicUrl) => {
        if (profilePicUrl) {
          setPic(profilePicUrl);
          onResolved?.(profilePicUrl);
        } else {
          setPic(null);
        }
      })
      .catch(() => setPic(null));
  };

  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold overflow-hidden ${sizeClassName} ${textClassName}`}>
      {pic ? (
        <img src={pic} alt="" className={`${sizeClassName} object-cover`} onError={refreshProfilePic} />
      ) : (
        initial
      )}
    </span>
  );
}

// ─── Pipeline Stage Selector (Sidebar) ───────────────────────
type EvaluationAssignee = { id: string; name: string; email?: string | null; unit?: string | null };
type ScheduleConflict = {
  clientName: string;
  startTime: string;
  endTime: string;
  unit: string;
  professionalName?: string | null;
};

function formatScheduleConflictDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "horário informado";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function PipelineStageSelector({ contactPhone, contactName, unit, layout = "sidebar", refreshTrigger, showFallback, openEvolutionSignal }: { contactPhone: string; contactName?: string; unit?: string | null; layout?: "sidebar" | "header" | "headerPill" | "inline"; refreshTrigger?: number; showFallback?: boolean; openEvolutionSignal?: number }) {
  const [deal, setDeal] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEvolutionModal, setShowEvolutionModal] = useState(false);
  const [evolutionNotes, setEvolutionNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(false);
  const stageTriggerRef = useRef<HTMLButtonElement>(null);
  const [stageMenuPos, setStageMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const [clientData, setClientData] = useState<any>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [pendingScheduledStageId, setPendingScheduledStageId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleAssigneeUserId, setScheduleAssigneeUserId] = useState("");
  const [evaluationAssignees, setEvaluationAssignees] = useState<EvaluationAssignee[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleConflict, setScheduleConflict] = useState<ScheduleConflict | null>(null);

  const effectiveUnit = unit || clientData?.unit || deal?.unit || "";
  const isOsascoSchedule = effectiveUnit === "Osasco";
  const pickDefaultAssignee = useCallback((assignees: EvaluationAssignee[]) => {
    if (!isOsascoSchedule) return "";
    return assignees.find((assignee) => normalizePipelineStageName(assignee.name).includes("larissa"))?.id || "";
  }, [isOsascoSchedule]);

  // Posiciona o menu de etapas via portal (fixed), fora do painel rolável do
  // "Perfil do Contato". Sem isso, o menu era absolute dentro de um contêiner
  // com overflow-y-auto: com muitas etapas, ele estourava a área visível e o
  // painel inteiro precisava ser rolado para revelar as opções de baixo
  // (ex.: Fechado/Perdido ficavam cortados). Abre para cima quando não há
  // espaço suficiente abaixo do botão.
  const updateStageMenuPos = useCallback(() => {
    const btn = stageTriggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeight = Math.min(stages.length * 34 + 8, 260);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 12 && rect.top > menuHeight;
    setStageMenuPos({
      top: openUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, [stages.length]);

  useEffect(() => {
    if (!openDropdown) return;
    updateStageMenuPos();
    window.addEventListener("scroll", updateStageMenuPos, true);
    window.addEventListener("resize", updateStageMenuPos);
    return () => {
      window.removeEventListener("scroll", updateStageMenuPos, true);
      window.removeEventListener("resize", updateStageMenuPos);
    };
  }, [openDropdown, updateStageMenuPos]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        // 1. Encontrar o client
        const clientParams = new URLSearchParams({ search: contactPhone });
        if (unit) clientParams.set("unit", unit);
        const cRes = await fetch(`/api/clients?${clientParams.toString()}`);
        const clientList = await cRes.json();
        const client = clientList.clients?.[0];
        setClientData(client || null);

        // 2. Encontrar os stages do pipeline default
        const pRes = await fetch('/api/pipelines');
        const pipes = await pRes.json();
        const defaultPipeline = pipes.find((p: any) => !unit || p.unit === unit) || pipes[0];
        if (defaultPipeline) {
          setPipelineId(defaultPipeline.id);
          setStages(defaultPipeline.stages || []);

          // 3. Encontrar o deal pelo telefone, com clientId como reforço quando existir.
          const dealParams = new URLSearchParams({ phone: contactPhone });
          if (unit) dealParams.set("unit", unit);
          const dRes = await fetch(`/api/pipeline?${dealParams.toString()}`);
          const deals = await dRes.json();
          const clientDeal = client
            ? deals.find((d: any) => d.clientId === client.id) || deals[0]
            : deals[0];
          setDeal(clientDeal || null);
          setEvolutionNotes(clientDeal?.notes || "");
        }
      } catch {
        // error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [contactPhone, refreshTrigger, unit]);

  // Abre a modal de evolução quando o menu "⋯" do header dispara o sinal.
  useEffect(() => {
    if (openEvolutionSignal) setShowEvolutionModal(true);
  }, [openEvolutionSignal]);

  useEffect(() => {
    if (!scheduleModalOpen) return;
    let cancelled = false;

    async function loadAssignees() {
      setLoadingAssignees(true);
      try {
        const params = new URLSearchParams();
        if (effectiveUnit) params.set("unit", effectiveUnit);
        const res = await fetch(`/api/crm/evaluations/assignees${params.toString() ? `?${params.toString()}` : ""}`);
        const data = await res.json().catch(() => ({}));
        const assignees = Array.isArray(data.assignees) ? data.assignees : [];
        if (cancelled) return;
        setEvaluationAssignees(assignees);
        const defaultAssignee = pickDefaultAssignee(assignees);
        setScheduleAssigneeUserId((current) => current || defaultAssignee);
      } catch {
        if (!cancelled) setEvaluationAssignees([]);
      } finally {
        if (!cancelled) setLoadingAssignees(false);
      }
    }

    loadAssignees();
    return () => { cancelled = true; };
  }, [effectiveUnit, pickDefaultAssignee, scheduleModalOpen]);

  const closeScheduleModal = () => {
    setScheduleModalOpen(false);
    setPendingScheduledStageId(null);
    setScheduleDate("");
    setScheduleTime("09:00");
    setScheduleAssigneeUserId("");
    setIsScheduling(false);
    setScheduleConflict(null);
  };

  const updateStage = async (
    newStageId: string,
    evaluation?: { startTime: string; assigneeUserId?: string; durationMinutes?: number; forceScheduleConflict?: boolean },
  ): Promise<boolean> => {
    if (!newStageId) return false;

    const targetStage = stages.find((stage) => stage.id === newStageId);
    if (isScheduledPipelineStageName(targetStage?.name) && !evaluation) {
      const defaultAssignee = pickDefaultAssignee(evaluationAssignees);
      setPendingScheduledStageId(newStageId);
      setScheduleDate("");
      setScheduleTime("09:00");
      setScheduleAssigneeUserId(defaultAssignee);
      setScheduleConflict(null);
      setScheduleModalOpen(true);
      return false;
    }
    
    if (!deal) {
      if (!pipelineId) return false;
      // CREATE DEAL
      let targetClientId = clientData?.id;
      let targetClientName = clientData?.name || contactName || contactPhone;

      try {
        if (!targetClientId) {
          // CREATE CLIENT Seeding the contact
          const createRes = await fetch("/api/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: targetClientName, phone: contactPhone, unit, force: true }),
          });
          if (createRes.ok) {
            const newClientRes = await createRes.json();
            targetClientId = newClientRes.client?.id || newClientRes.id;
            setClientData(newClientRes.client || newClientRes);
          } else {
            throw new Error("Erro ao criar cliente");
          }
        }

        const res = await fetch("/api/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: targetClientId,
            clientName: targetClientName,
            pipelineId: pipelineId,
            stageId: newStageId,
            source: "whatsapp",
            unit,
            contactPhone,
            value: 0,
            ...(evaluation
              ? {
                  evaluationStartTime: evaluation.startTime,
                  evaluationAssigneeUserId: evaluation.assigneeUserId,
                  evaluationDurationMinutes: evaluation.durationMinutes || 60,
                  forceScheduleConflict: evaluation.forceScheduleConflict === true,
                }
              : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.scheduleConflict) {
          setScheduleConflict(data.conflict || null);
          return false;
        }
        if (res.ok) {
          const newDeal = data;
          setDeal(newDeal);
          toast("Adicionado ao funil!", "success");
          return true;
        } else {
          toast(data.error || "Erro ao adicionar ao funil", "error");
        }
      } catch {
        toast("Erro ao adicionar ao funil", "error");
      }
      return false;
    }
    
    // UPDATE EXISTING DEAL
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deal.id,
          stageId: newStageId,
          pipelineId: pipelineId || deal.pipelineId,
          ...(evaluation
            ? {
                evaluationStartTime: evaluation.startTime,
                evaluationAssigneeUserId: evaluation.assigneeUserId,
                evaluationDurationMinutes: evaluation.durationMinutes || 60,
                forceScheduleConflict: evaluation.forceScheduleConflict === true,
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.scheduleConflict) {
        setScheduleConflict(data.conflict || null);
        return false;
      }
      if (res.ok) {
        const updatedDeal = data;
        setDeal(updatedDeal || { ...deal, stageId: newStageId, pipelineId: pipelineId || deal.pipelineId });
        toast("Fase atualizada!", "success");
        return true;
      } else {
        toast(data.error || "Erro ao atualizar fase", "error");
      }
    } catch {
      toast("Erro ao atualizar fase", "error");
    }
    return false;
  };

  const confirmSchedule = async (forceScheduleConflict = false) => {
    if (!pendingScheduledStageId) return;

    const startTime = buildLocalDateTime(scheduleDate, scheduleTime);
    if (!startTime) {
      toast("Informe a data e o horário da avaliação", "error");
      return;
    }
    if (!isOsascoSchedule && !scheduleAssigneeUserId) {
      toast("Selecione a responsável pela avaliação", "error");
      return;
    }

    setIsScheduling(true);
    const ok = await updateStage(pendingScheduledStageId, {
      startTime,
      assigneeUserId: scheduleAssigneeUserId || undefined,
      durationMinutes: 60,
      forceScheduleConflict,
    });
    setIsScheduling(false);
    if (ok) closeScheduleModal();
  };

  const saveEvolutionNotes = async () => {
    if (!deal) return;
    setSavingNotes(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id, notes: evolutionNotes }),
      });
      if (res.ok) {
        setDeal({ ...deal, notes: evolutionNotes });
        toast("Observação salva com sucesso!", "success");
        setShowEvolutionModal(false);
      } else {
        toast("Erro ao salvar observação", "error");
      }
    } catch {
      toast("Erro ao salvar observação", "error");
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) return null;
  if (stages.length === 0) {
    if (showFallback) return <p className="text-xs text-muted-foreground italic">Contato sem registro no funil.</p>;
    return null;
  }

  // Modal compartilhado entre todos os layouts
  const evolutionModal = showEvolutionModal ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-foreground">Observação</h3>
        <textarea
          className="w-full h-40 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
          placeholder="Digite o histórico ou observações sobre o contato..."
          value={evolutionNotes}
          onChange={(e) => setEvolutionNotes(e.target.value)}
        />
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => { setEvolutionNotes(deal?.notes || ""); setShowEvolutionModal(false); }}
            disabled={savingNotes}
            className="rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={saveEvolutionNotes}
            disabled={savingNotes || !deal}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {savingNotes ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const defaultOsascoAssigneeId = pickDefaultAssignee(evaluationAssignees);
  const selectedAssignee = evaluationAssignees.find((assignee) => assignee.id === (scheduleAssigneeUserId || defaultOsascoAssigneeId));
  const scheduleModal = scheduleModalOpen ? (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Agendar avaliação</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Informe a data e o horário antes de mover o lead para Agendado.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Data
              <input
                type="date"
                value={scheduleDate}
                onChange={(event) => {
                  setScheduleDate(event.target.value);
                  setScheduleConflict(null);
                }}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Horário
              <input
                type="time"
                value={scheduleTime}
                onChange={(event) => {
                  setScheduleTime(event.target.value);
                  setScheduleConflict(null);
                }}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </label>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-foreground">Responsável</label>
            {isOsascoSchedule && defaultOsascoAssigneeId ? (
              <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                <User className="h-4 w-4 text-primary" />
                {selectedAssignee?.name || "Larissa"}
              </div>
            ) : (
              <select
                value={scheduleAssigneeUserId}
                onChange={(event) => setScheduleAssigneeUserId(event.target.value)}
                disabled={loadingAssignees}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
              >
                <option value="">{loadingAssignees ? "Carregando..." : "Selecione a responsável"}</option>
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
          {scheduleConflict && (
            <div role="alert" className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Já existe uma avaliação neste horário</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{scheduleConflict.clientName}</span> está agendada para{" "}
                  {formatScheduleConflictDateTime(scheduleConflict.startTime)}, na unidade {scheduleConflict.unit}
                  {scheduleConflict.professionalName ? `, com ${scheduleConflict.professionalName}` : ""}. Tem certeza que deseja agendar mesmo assim?
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {scheduleConflict ? (
            <>
              <button
                onClick={() => setScheduleConflict(null)}
                disabled={isScheduling}
                className="rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Voltar
              </button>
              <button
                onClick={() => confirmSchedule(true)}
                disabled={isScheduling}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isScheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                Agendar mesmo assim
              </button>
            </>
          ) : (
            <>
              <button
                onClick={closeScheduleModal}
                disabled={isScheduling}
                className="rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmSchedule()}
                disabled={isScheduling}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isScheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                Confirmar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const currentStageIndex = deal ? stages.findIndex(s => s.id === deal?.stageId) : -1;
  const canGoBack = currentStageIndex > 0;
  const canGoForward = currentStageIndex >= 0 && currentStageIndex < stages.length - 1;

  const goBack = () => {
    if (canGoBack) updateStage(stages[currentStageIndex - 1].id);
  };
  const goForward = () => {
    if (canGoForward) updateStage(stages[currentStageIndex + 1].id);
  };

  // Layout headerPill: só o seletor de fase (‹ etapa ▾ ›) no header do chat.
  // A "Observação" saiu daqui — agora vive no menu "⋯" e no card do contato.
  if (layout === "headerPill") {
    return (
      <>
        <div className="relative shrink-0">
          <select
            value={deal?.stageId || ""}
            onChange={(e) => updateStage(e.target.value)}
            title="Fase do funil"
            className="appearance-none rounded-lg border border-input bg-background pl-3 pr-8 py-1.5 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer w-[128px] sm:w-44 truncate"
          >
            {!deal && <option value="" disabled hidden>Adicionar ao Funil</option>}
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {evolutionModal}
        {scheduleModal}
      </>
    );
  }

  // Layout inline: barra compacta acima do input do chat
  if (layout === "inline") {
    return (
      <>
        <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card/50 px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Fase do Funil:</span>
          
          <div className="flex items-center gap-1 flex-1 max-w-[260px]">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              title="Retroceder Fase"
              className="p-1.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div className="relative flex-1">
              <select
                value={deal?.stageId || ""}
                onChange={(e) => updateStage(e.target.value)}
                className="appearance-none w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary pr-7 truncate"
              >
                {!deal && <option value="" disabled hidden>Adicionar ao Funil</option>}
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <button
              onClick={goForward}
              disabled={!canGoForward}
              title="Avançar Fase"
              className="p-1.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={() => setShowEvolutionModal(true)}
            disabled={!deal}
            className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground hover:bg-muted transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            Observações
          </button>
        </div>
        {evolutionModal}
        {scheduleModal}
      </>
    );
  }

  const isHeader = layout === "header";

  return (
    <>
      <div className={isHeader ? "flex items-center gap-2" : "flex flex-col gap-2"}>
        <div className={isHeader ? "flex items-center gap-2" : "flex flex-col gap-2"}>
          
          <div className="relative w-full">
            <button
              ref={stageTriggerRef}
              onClick={() => {
                if (!openDropdown) updateStageMenuPos();
                setOpenDropdown((o) => !o);
              }}
              className={`flex items-center justify-between w-full rounded-xl border border-transparent bg-muted/40 px-3 py-2.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted/80 focus:outline-none transition-all ${isHeader ? "w-[110px] sm:w-32" : ""}`}
            >
              <span className="truncate">
                {deal ? stages.find(s => s.id === deal.stageId)?.name || "Funil" : "Adicionar ao Funil"}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${openDropdown ? "rotate-180" : "opacity-70"}`} />
            </button>

            {openDropdown && createPortal(
              <>
                <div className="fixed inset-0 z-[55]" onClick={() => setOpenDropdown(false)} />
                <div
                  style={{ position: "fixed", top: stageMenuPos.top, left: stageMenuPos.left, width: stageMenuPos.width }}
                  className="z-[60] max-h-64 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-2xl"
                >
                  {stages.map((stage) => (
                    <button
                      key={stage.id}
                      onClick={() => { updateStage(stage.id); setOpenDropdown(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted ${stage.id === deal?.stageId ? "font-semibold text-primary" : "text-foreground"}`}
                    >
                      <span className="truncate">{stage.name}</span>
                      {stage.id === deal?.stageId && <Check className="ml-auto h-3 w-3 shrink-0" />}
                    </button>
                  ))}
                </div>
              </>,
              document.body
            )}
          </div>

          <button
            onClick={() => setShowEvolutionModal(true)}
            disabled={!deal}
            title="Adicionar Observação"
            className={`flex items-center justify-center rounded-xl border border-transparent bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-all disabled:opacity-50 shadow-sm ${isHeader ? "h-8 px-2.5 sm:px-3 sm:gap-1.5" : "gap-2 px-3 py-2 w-full"}`}
          >
            <FileText className="h-4 w-4" />
            <span className={isHeader ? "hidden sm:inline text-xs whitespace-nowrap" : "text-xs whitespace-nowrap"}>Observação</span>
          </button>
        </div>
      </div>
      {evolutionModal}
      {scheduleModal}
    </>
  );
}

// ─── Campaign Attribution ────────────────────────────────────
// Botão + dropdown por chat: atribui a campanha ao lead (Client.campaignName).
// As opções vêm das campanhas ATIVAS cadastradas na aba Campanhas, filtradas
// pela unidade do lead. Atribuir aqui sobrescreve qualquer registro anterior
// e reflete imediatamente em toda a estatística (que agrega por campaignName).
function CampaignAttributeControl({ contactPhone, contactName, unit }: {
  contactPhone: string; contactName?: string | null; unit?: string | null;
}) {
  const [client, setClient] = useState<{ id: string; campaignName: string | null; unit: string | null } | null>(null);
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ phone: contactPhone });
        if (unit) params.set("unit", unit);
        const summaryRes = await fetch(`/api/whatsapp/contact-summary?${params.toString()}`);
        const summaryJson = await summaryRes.json();
        const cl = summaryJson.client || null;
        if (!cancelled) setClient(cl ? { id: cl.id, campaignName: cl.campaignName ?? null, unit: cl.unit ?? null } : null);
        if (!cancelled && Array.isArray(summaryJson.campaigns)) {
          setCampaigns(summaryJson.campaigns);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [contactPhone, unit]);

  const attribute = async (name: string) => {
    const value = name.trim();
    if (!value) { setOpen(false); setCustom(false); return; }
    setSaving(true);
    try {
      if (!client?.id) {
        // Sem Client ainda → cria o lead já com a campanha
        const createRes = await fetch("/api/clients", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: contactName || contactPhone, phone: contactPhone, campaignName: value, source: "facebook_ad", force: true }),
        });
        if (createRes.ok) {
          const j = await createRes.json();
          setClient({ id: j.client?.id || j.id, campaignName: value, unit: unit ?? null });
          toast("Campanha atribuída!", "success");
        } else toast("Erro ao atribuir campanha", "error");
      } else {
        const res = await fetch("/api/clients", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: client.id, campaignName: value, source: "facebook_ad" }),
        });
        if (res.ok) {
          setClient((c) => (c ? { ...c, campaignName: value } : c));
          toast("Campanha atribuída!", "success");
        } else toast("Erro ao atribuir campanha", "error");
      }
    } catch { toast("Erro ao atribuir campanha", "error"); }
    finally { setSaving(false); setOpen(false); setCustom(false); }
  };

  const current = client?.campaignName || null;
  const hasCampaign = !!current;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving || loading}
        title="Atribuir campanha ao lead"
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all shadow-sm disabled:opacity-60 ${
          hasCampaign
            ? "border-transparent bg-muted/40 text-foreground hover:bg-muted/80"
            : "border-dashed border-muted-foreground/30 bg-transparent text-muted-foreground hover:bg-muted/30"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Megaphone className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {loading ? "Carregando…" : saving ? "Salvando…" : current || "Atribuir campanha"}
          </span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => { setOpen(false); setCustom(false); }} />
          <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-2xl">
            {custom ? (
              <input
                autoFocus
                placeholder="Nome da campanha…"
                defaultValue={current || ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") attribute((e.target as HTMLInputElement).value);
                  if (e.key === "Escape") setCustom(false);
                }}
                onBlur={(e) => { if (e.target.value.trim()) attribute(e.target.value); else setCustom(false); }}
                className="mx-1.5 my-1 w-[calc(100%-12px)] rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : (
              <>
                {campaigns.length === 0 && (
                  <p className="px-3 py-2 text-[11px] italic text-muted-foreground">
                    Nenhuma campanha ativa cadastrada{unit ? ` em ${unit}` : ""}.
                  </p>
                )}
                {campaigns.map((c) => (
                  <button
                    key={c}
                    onClick={() => attribute(c)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${c === current ? "font-semibold text-primary" : "text-foreground"}`}
                  >
                    <Megaphone className="h-3 w-3 shrink-0 opacity-60" />
                    <span className="truncate">{c}</span>
                    {c === current && <Check className="ml-auto h-3 w-3 shrink-0" />}
                  </button>
                ))}
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={() => setCustom(true)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  ✏️ Outra (digitar)…
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}


// ─── Contact Sidebar ─────────────────────────────────────────
function ContactSidebar({
  conversation,
  onClose,
  pipelineRefreshKey,
  profilePicUrl,
  refreshProfilePicUrl,
  onProfilePicResolved,
  onRenameContact,
}: {
  conversation: Conversation;
  onClose: () => void;
  pipelineRefreshKey: number;
  profilePicUrl?: string;
  refreshProfilePicUrl?: string;
  onProfilePicResolved?: (phone: string, url: string) => void;
  onRenameContact: (conversationId: string, name: string) => Promise<Contact>;
}) {
  const { contact } = conversation;
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(contact.name || contact.phone);
  const [savingName, setSavingName] = useState(false);
  const tags: string[] = Array.isArray(contact.tags)
    ? contact.tags
    : typeof contact.tags === "string"
    ? contact.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
    : [];

  const statusMap: Record<string, { label: string; color: string }> = {
    open: { label: "Em aberto", color: "text-emerald-400" },
    resolved: { label: "Resolvido", color: "text-blue-400" },
    closed: { label: "Fechado", color: "text-muted-foreground" },
    waiting_customer: { label: "Aguardando cliente", color: "text-amber-400" },
    waiting_response: { label: "Aguardando resposta", color: "text-orange-400" },
  };
  const statusInfo = statusMap[conversation.status] ?? { label: conversation.status, color: "text-muted-foreground" };

  useEffect(() => {
    setDraftName(contact.name || contact.phone);
    setEditingName(false);
  }, [contact.name, contact.phone]);

  const saveName = async () => {
    const nextName = draftName.trim().replace(/\s+/g, " ");
    if (!nextName) {
      toast("Informe um nome ou mantenha o número.", "error");
      return;
    }
    setSavingName(true);
    try {
      await onRenameContact(conversation.id, nextName);
      toast("Nome do contato atualizado.", "success");
      setEditingName(false);
    } catch (error: any) {
      toast(error.message || "Erro ao atualizar nome", "error");
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-card xl:w-80">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4 pt-2">
        <span className="text-sm font-semibold text-foreground">Perfil do Contato</span>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Avatar + Nome + Status */}
      <div className="flex flex-col items-center gap-2.5 px-4 pb-4 pt-4 sm:gap-3 sm:pt-8">
        <ContactAvatar
          contact={contact}
          sizeClassName="h-16 w-16 sm:h-20 sm:w-20"
          textClassName="text-2xl sm:text-3xl ring-4 ring-background shadow-md"
          fetchUrl={profilePicUrl}
          refreshUrl={refreshProfilePicUrl}
          onResolved={(url) => onProfilePicResolved?.(contact.phone, url)}
        />
        <div className="mt-1 w-full text-center">
          {editingName ? (
            <div className="mx-auto max-w-[220px] space-y-2">
              <input
                autoFocus
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveName();
                  if (event.key === "Escape") {
                    setDraftName(contact.name || contact.phone);
                    setEditingName(false);
                  }
                }}
                disabled={savingName}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-center text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40 disabled:opacity-60"
                placeholder="Nome do contato"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={saveName}
                  disabled={savingName}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {savingName ? "Salvando..." : "Salvar"}
                </button>
                <button
                  onClick={() => {
                    setDraftName(contact.name || contact.phone);
                    setEditingName(false);
                  }}
                  disabled={savingName}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <p className="min-w-0 truncate font-semibold text-foreground text-lg leading-tight">
                {contact.name || <span className="text-muted-foreground italic text-sm">Sem nome</span>}
              </p>
              <button
                onClick={() => setEditingName(true)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Editar nome"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground font-mono mt-1 opacity-80">{contact.phone}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium mt-1 ${
          conversation.status === "open"
            ? "bg-emerald-500/10 text-emerald-500"
            : "bg-muted text-muted-foreground"
        }`}>
          <Circle className="h-1.5 w-1.5 fill-current" />
          {conversation.status === "open" ? "Conversa aberta" : "Conversa fechada"}
        </span>
      </div>

      <div className="flex flex-col space-y-4 px-4 pb-8 pt-2 sm:space-y-6">

        {/* ── Informações de contato ── */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">Contato</p>
          <div className="flex items-center gap-3">
            <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-mono text-foreground select-all">{contact.phone}</span>
          </div>
          {contact.unit && (
            <div className="flex items-center gap-3">
              <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-foreground">{contact.unit}</span>
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex items-start gap-3">
              <Tag className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {tags.map((tag: string) => (
                  <span key={tag} className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Campanha ── */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">Campanha</p>
          <CampaignAttributeControl
            contactPhone={contact.phone}
            contactName={contact.name}
            unit={contact.unit}
          />
        </div>

        {/* ── Funil & Observações ── */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">Funil & Observações</p>
          <PipelineStageSelector
            contactPhone={contact.phone}
            contactName={contact.name || undefined}
            unit={contact.unit}
            layout="sidebar"
            refreshTrigger={pipelineRefreshKey}
            showFallback
          />
        </div>

        {/* ── Dados da conversa ── */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">Conversa</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Status</span>
              <span className={`font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
            {conversation.assignedToName && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Atendente</span>
                <span className="font-medium text-foreground">{conversation.assignedToName}</span>
              </div>
            )}
            {conversation.resolution && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Resolução</span>
                <span className="font-medium text-foreground capitalize">{conversation.resolution}</span>
              </div>
            )}
            {conversation.closedByName && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fechada por</span>
                <span className="font-medium text-foreground">{conversation.closedByName}</span>
              </div>
            )}
            {conversation.closedAt && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fechada em</span>
                <span className="font-medium text-foreground">
                  {new Date(conversation.closedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
            {conversation.satisfactionScore != null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Satisfação</span>
                <span className="font-medium text-foreground">
                  {conversation.satisfactionScore}/5 {"⭐".repeat(Math.max(0, conversation.satisfactionScore))}
                </span>
              </div>
            )}
          </div>
        </div>



      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────
function MessageBubble({
  msg,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onOpenImage,
  onOpenDocument,
}: {
  msg: Message;
  onReply: (msg: Message) => void;
  onCopy: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  onOpenImage: (src: string) => void;
  onOpenDocument: (msg: Message) => void;
}) {
  const isMe = msg.fromMe;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { canEdit, canDelete } = messageActionState(msg);
  const isDeleted = msg.status === "deleted";
  const isMediaMessage = msg.type === "image" || msg.mediaUrl?.startsWith("data:image/");
  const documentMeta = msg.type === "document" && msg.mediaUrl ? documentMessageMeta(msg) : null;

  const menuButtonClass = "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors";

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className={`relative mb-1.5 flex w-full sm:mb-0.5 ${menuOpen ? "z-50" : "z-0"} ${isMe ? "justify-end" : "justify-start"}`}>
      <div className="flex max-w-[82%] flex-col sm:max-w-[min(76%,760px)]">
        <div
          className={`inbox-message-bubble group relative flex flex-col overflow-visible rounded-[18px] text-[15.5px] shadow-[0_4px_16px_rgba(0,0,0,0.1)] sm:rounded-[14px] sm:text-[14.5px] sm:shadow-[0_1px_2px_rgba(0,0,0,0.12)] ${
            isMe
              ? "inbox-message-outgoing ml-auto rounded-br-[6px] border border-primary/55 bg-primary/80 text-primary-foreground sm:rounded-br-[4px] sm:border-0 sm:bg-primary"
              : "inbox-message-incoming rounded-bl-[6px] border border-border bg-card/85 text-foreground backdrop-blur-sm sm:rounded-bl-[4px] sm:border-border/50 sm:bg-card"
          } ${isMediaMessage ? 'p-1 pb-1.5' : 'py-3 pl-4 pr-10 sm:py-2.5 sm:pl-3.5 sm:pr-9'}`}
        >
          <div
            ref={menuRef}
            className={`absolute right-1 top-1 z-20 opacity-0 transition-opacity group-hover:opacity-100 ${menuOpen ? "opacity-100" : ""}`}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              className={`flex h-6 w-6 items-center justify-center rounded-full backdrop-blur transition-colors ${
                isMe
                  ? "bg-primary-foreground/10 text-primary-foreground/85 hover:bg-primary-foreground/20 hover:text-primary-foreground"
                  : "bg-background/50 text-muted-foreground hover:bg-background/80 hover:text-foreground"
              }`}
              aria-label="Opções da mensagem"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-[70] min-w-[150px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
                <button
                  type="button"
                  disabled={!msg.messageId || msg.status === "deleted" || msg.readOnly}
                  onClick={(e) => { e.stopPropagation(); if (msg.messageId && msg.status !== "deleted" && !msg.readOnly) onReply(msg); setMenuOpen(false); }}
                  className={`${menuButtonClass} ${msg.messageId && msg.status !== "deleted" && !msg.readOnly ? "hover:bg-muted" : "cursor-not-allowed opacity-40"}`}
                >
                  <Reply className="h-3.5 w-3.5" />
                  Responder
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCopy(msg); setMenuOpen(false); }}
                  className={`${menuButtonClass} hover:bg-muted`}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={(e) => { e.stopPropagation(); if (canEdit) onEdit(msg); setMenuOpen(false); }}
                  className={`${menuButtonClass} ${canEdit ? "hover:bg-muted" : "cursor-not-allowed opacity-40"}`}
                  title={canEdit ? "Editar mensagem" : "Tempo para editar expirou"}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  disabled={!canDelete}
                  onClick={(e) => { e.stopPropagation(); if (canDelete) onDelete(msg); setMenuOpen(false); }}
                  className={`${menuButtonClass} ${canDelete ? "text-destructive hover:bg-destructive/10" : "cursor-not-allowed text-muted-foreground opacity-40"}`}
                  title={canDelete ? "Apagar para todos" : "Tempo para apagar expirou"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Apagar
                </button>
              </div>
            )}
          </div>

          {msg.quotedMessageId && msg.status !== "deleted" && (
            <div
              className={`mb-1.5 flex overflow-hidden rounded-lg text-left ${
                isMe ? "bg-primary-foreground/12" : "bg-background/55"
              } ${isMediaMessage ? "mx-1.5 mt-1.5" : ""}`}
            >
              <div className={`w-1 shrink-0 ${isMe ? "bg-primary-foreground/70" : "bg-primary"}`} />
              <div className="min-w-0 px-2.5 py-1.5">
                <div className={`text-[11px] font-semibold ${isMe ? "text-primary-foreground/85" : "text-primary"}`}>
                  {quotedMessageLabel(msg)}
                </div>
                <div className={`mt-0.5 truncate text-[12px] ${isMe ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                  {quotedMessageBody(msg)}
                </div>
              </div>
            </div>
          )}

          {/* Image — aceita type "image" ou data URLs de imagem */}
          {isMediaMessage && msg.mediaUrl && (
            <img
              src={msg.mediaUrl}
              alt=""
              className="max-w-full rounded-[12px] mb-1.5 cursor-pointer object-cover max-h-[320px] w-full"
              onClick={(e) => {
                e.stopPropagation();
                onOpenImage(msg.mediaUrl!);
              }}
            />
          )}

          {/* Audio — sem type hardcoded para o browser detectar o codec correto */}
          {(msg.type === "audio" || msg.type === "ptt") && msg.mediaUrl && (
            <div className="w-[240px] max-w-full">
              <audio controls className="w-full h-10 mb-1">
                <source src={msg.mediaUrl} />
              </audio>
            </div>
          )}

          {/* Document */}
          {documentMeta && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDocument(msg);
              }}
              className={`mb-1.5 flex w-[290px] max-w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${
                isMe
                  ? "bg-primary-foreground/10 hover:bg-primary-foreground/15"
                  : "bg-background/45 hover:bg-background/60"
              }`}
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-red-500 text-white shadow-sm">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold leading-tight">
                  {documentMeta.fileName}
                </div>
                <div className={`mt-1 text-[11px] font-medium uppercase tracking-wide ${
                  isMe ? "text-primary-foreground/70" : "text-muted-foreground"
                }`}>
                  {[documentMeta.sizeLabel, documentMeta.extension].filter(Boolean).join(" · ")}
                </div>
              </div>
            </button>
          )}

          {/* Text */}
          {msg.body && (
            <div className={`break-words whitespace-pre-wrap leading-relaxed ${isDeleted ? "italic opacity-70" : ""} ${isMediaMessage ? 'px-2 pt-0.5 pb-1' : ''}`}>
              {msg.body}
            </div>
          )}

          {/* Timestamp + status */}
          <div className={`mt-1 flex items-center justify-end gap-1 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"} ${isMediaMessage ? 'px-2' : ''}`}>
            <span className="text-[11px] font-medium tracking-wide sm:text-[10px]">{formatMessageTime(msg.timestamp)}</span>
            {isMe && (
              <>
                {msg.status === "read" ? (
                  <CheckCheck className="w-3.5 h-3.5 text-blue-300" />
                ) : msg.status === "delivered" ? (
                  <CheckCheck className="w-3.5 h-3.5 opacity-80" />
                ) : (
                  <Check className="w-3.5 h-3.5 opacity-80" />
                )}
              </>
            )}
          </div>
        </div>

        {/* Label de respondido por na base do balão (mais discreto) */}
        {isMe && msg.respondedByName && (
          <div className="mt-1 text-[10px] text-muted-foreground text-right pr-1 flex items-center justify-end gap-1 opacity-70">
            <span className="w-3 h-3 rounded-full bg-muted flex items-center justify-center font-bold text-[8px] uppercase">
              {msg.respondedByName.charAt(0)}
            </span>
            <span>{msg.respondedByName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Conversation Item ────────────────────────────────────────
function ConversationItem({
  conv,
  isActive,
  channel,
  onClick,
}: {
  conv: Conversation;
  isActive: boolean;
  channel: InstanceChannel;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-start gap-3 rounded-xl px-3 py-3.5 text-left transition-all ${
        isActive ? "bg-primary/12 ring-1 ring-inset ring-primary/15" : "hover:bg-muted/65"
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <ContactAvatar
          contact={conv.contact}
          sizeClassName="h-11 w-11"
          textClassName="text-sm"
        />
        {conv.status === "open" && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
        )}
        <span className="absolute -bottom-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-card">
          <ChannelMark channel={channel} size="avatar" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13.5px] font-semibold text-foreground">
            {conv.contact?.name || conv.contact?.phone}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ""}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-[12px] leading-5 text-muted-foreground">
            {conv.lastMessage || "Nova conversa"}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Status badges */}
            {conv.status === 'resolved' && (
              <span className="text-[9px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded-full">Resolvido</span>
            )}
            {conv.status === 'closed' && (
              <span className="text-[9px] bg-gray-500/10 text-gray-400 px-1.5 py-0.5 rounded-full">Fechado</span>
            )}
            {conv.status === 'waiting_customer' && (
              <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-full">Aguardando</span>
            )}
            {(conv.status === 'waiting_response' || (!conv.assignedTo && conv.status === 'open')) && (
              <span className="relative flex items-center gap-1 text-[9px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded-full">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500"></span>
                </span>
                Sem atendente
              </span>
            )}
            {conv.unreadCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conv.unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* Etiqueta da campanha (tag estilo WhatsApp) */}
        {conv.campaignName && (
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <span
              className={`inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset ${campaignTagStyle(conv.campaignName)}`}
              title={`Campanha: ${conv.campaignName}`}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
              <span className="truncate">{conv.campaignName}</span>
            </span>
            {conv.campaignUrl && (
              <span
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(conv.campaignUrl!, "_blank", "noopener,noreferrer");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(conv.campaignUrl!, "_blank", "noopener,noreferrer");
                  }
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/80 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                title="Abrir anúncio"
              >
                <Megaphone className="h-2.5 w-2.5" />
                Ver anúncio
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ═════════════════════════════════════════════════════════════
// ─── Main Inbox Page ──────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
export default function InboxPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { globalUnit } = useGlobalUnit();
  const urlUnit = searchParams.get("unit");
  const urlUnitFilter = urlUnit && urlUnit !== "all" && urlUnit !== "Todas" ? urlUnit : "";
  const effectiveUnit = globalUnit || urlUnitFilter;
  const deepLinkConversationId = searchParams.get("conversationId") || "";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachment, setAttachment] = useState<{ file: File; base64: string; type: string } | null>(null);
  const [contactSidebarOpen, setContactSidebarOpen] = useState(false);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [isMarkingUnread, setIsMarkingUnread] = useState(false);
  const [evoSignal, setEvoSignal] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const [nextConversationCursor, setNextConversationCursor] = useState<string | null>(null);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);

  // ─── Gravação de áudio ─────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationsRequestSeqRef = useRef(0);
  const messagesRequestSeqRef = useRef(0);
  const conversationsInFlightScopeRef = useRef<string | null>(null);
  const conversationsLastSyncRef = useRef<string | null>(null);
  const conversationsIncrementalPollsRef = useRef(0);
  const messagesInFlightKeysRef = useRef<Set<string>>(new Set());
  const activeScopeRef = useRef("");
  const activeConversationListScopeRef = useRef("");
  const conversationsStateScopeRef = useRef("");
  const skipNextConversationCacheWriteRef = useRef(false);
  const conversationsRef = useRef<Conversation[]>([]);
  const selectedConvRef = useRef<Conversation | null>(null);
  const selectedConversationIdRef = useRef<string | null>(null);
  const [tab, setTab] = useState<"all" | "open" | "unread" | "closed">("all");
  // Filtro por etiqueta (campanha). Vazio = mostra todas.
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);

  // ─── Admin: dados do usuário e seletor de colaboradores ───
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canViewCollaborators, setCanViewCollaborators] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaboratorInstance[]>([]);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetInstanceId, setTargetInstanceId] = useState<string | null>(null);
  const [selectedCollaborator, setSelectedCollaborator] = useState<CollaboratorInstance | null>(null);
  const [collaboratorDropdownOpen, setCollaboratorDropdownOpen] = useState(false);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [editingInstanceName, setEditingInstanceName] = useState("");
  const [savingInstanceName, setSavingInstanceName] = useState(false);
  const [savingInstanceChannelId, setSavingInstanceChannelId] = useState<string | null>(null);

  // Pipeline refresh trigger — incrementado após auto-evolução para forçar re-fetch no componente
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);

  // Close modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeResolution, setCloseResolution] = useState('resolved');
  const [closeNote, setCloseNote] = useState('');
  const [sendGoodbye, setSendGoodbye] = useState(true);
  const [sendSurvey, setSendSurvey] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editingMessageBody, setEditingMessageBody] = useState("");
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [imagePreview, setImagePreview] = useState<{ src: string; title: string } | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{
    src: string;
    title: string;
    mimeType: string;
    sizeLabel: string;
    isPdf: boolean;
  } | null>(null);

  // Buscar info do usuário logado
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          const role = String(data.user.role || "").toUpperCase();
          setCurrentUser({ id: data.user.id, name: data.user.name, role });
          setIsAdmin(role === "ADMINISTRADOR");
          setCanViewCollaborators(role === "ADMINISTRADOR" || role === "MARKETING");
        }
      })
      .catch(() => {});
  }, []);

  // Buscar instâncias dos colaboradores: admin gerencia; marketing visualiza/acessa não-admin.
  useEffect(() => {
    if (canViewCollaborators) {
      const params = new URLSearchParams();
      if (effectiveUnit && effectiveUnit !== "all") params.set("unit", effectiveUnit);
      fetch(`/api/whatsapp/admin/instances?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.instances) setCollaborators(d.instances);
        })
        .catch(() => {});
    }
  }, [canViewCollaborators, effectiveUnit]);

  // Ler alvo da URL ao montar
  useEffect(() => {
    const urlTargetInstanceId = searchParams.get("targetInstanceId");
    const urlTargetUserId = searchParams.get("targetUserId");
    setTargetInstanceId(urlTargetInstanceId);
    setTargetUserId(urlTargetUserId);
  }, [searchParams]);

  // Atualizar colaborador selecionado quando o alvo mudar.
  useEffect(() => {
    if ((targetInstanceId || targetUserId) && collaborators.length > 0) {
      const collab = targetInstanceId
        ? collaborators.find((c) => c.id === targetInstanceId)
        : collaborators.find((c) => c.userId === targetUserId);
      setSelectedCollaborator(collab || null);
      if (!collab) {
        setTargetUserId(null);
        setTargetInstanceId(null);
        router.push("/crm/inbox");
      }
    } else {
      setSelectedCollaborator(null);
    }
  }, [targetInstanceId, targetUserId, collaborators, router]);

  // Helper para construir URL do inbox/admin
  const buildUrl = useCallback(
    (baseUrl: string, extraParams?: Record<string, string>) => {
      const url = new URL(baseUrl, window.location.origin);
      if (targetInstanceId) {
        url.searchParams.set("targetInstanceId", targetInstanceId);
      } else if (targetUserId) {
        url.searchParams.set("targetUserId", targetUserId);
      }
      if (effectiveUnit && effectiveUnit !== "all") {
        url.searchParams.set("unit", effectiveUnit);
      }
      if (extraParams) {
        Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));
      }
      return url.pathname + url.search;
    },
    [effectiveUnit, targetInstanceId, targetUserId]
  );

  const leaveConversation = useCallback(() => {
    messagesRequestSeqRef.current += 1;
    selectedConversationIdRef.current = null;
    setSelectedConv(null);
    setMessages([]);
    setReplyingTo(null);
    setContactSidebarOpen(false);
    setContactPopoverOpen(false);
    setKebabOpen(false);
    router.replace(buildUrl("/crm/inbox"));
  }, [buildUrl, router]);

  const selectConversation = useCallback((conversation: Conversation, options?: { updateUrl?: boolean }) => {
    setSelectedConv(conversation);
    setReplyingTo(null);
    setContactSidebarOpen(false);
    setContactPopoverOpen(false);
    setKebabOpen(false);
    if (options?.updateUrl !== false) {
      router.replace(buildUrl("/crm/inbox", { conversationId: conversation.id }));
    }
  }, [buildUrl, router]);

  const selectedContextConversationId = selectedConv?.id;
  useEffect(() => {
    if (!selectedContextConversationId) return;
    const desktopContext = window.matchMedia("(min-width: 1280px)");
    const syncContextVisibility = () => setContactSidebarOpen(desktopContext.matches);
    syncContextVisibility();
    desktopContext.addEventListener("change", syncContextVisibility);
    return () => desktopContext.removeEventListener("change", syncContextVisibility);
  }, [selectedContextConversationId]);

  // Limpar targetUser e voltar ao próprio inbox
  const clearTargetUser = useCallback(() => {
    setTargetUserId(null);
    setTargetInstanceId(null);
    setSelectedCollaborator(null);
    setSelectedConv(null);
    setReplyingTo(null);
    setMessages([]);
    router.push("/crm/inbox");
  }, [router]);

  // Selecionar colaborador
  const selectCollaborator = useCallback(
    (userId: string | null, collaborator?: CollaboratorInstance) => {
      const nextUserId = collaborator?.userId || userId;
      const nextInstanceId = collaborator?.id || null;
      setTargetUserId(nextUserId);
      setTargetInstanceId(nextInstanceId);
      setSelectedCollaborator(collaborator || null);
      setSelectedConv(null);
      setReplyingTo(null);
      setMessages([]);
      setCollaboratorDropdownOpen(false);
      if (nextInstanceId) {
        router.push(`/crm/inbox?targetInstanceId=${nextInstanceId}`);
      } else if (nextUserId) {
        router.push(`/crm/inbox?targetUserId=${nextUserId}`);
      } else {
        router.push("/crm/inbox");
      }
    },
    [router]
  );

  const startEditingInstanceName = useCallback((collaborator: CollaboratorInstance) => {
    setEditingInstanceId(collaborator.id);
    setEditingInstanceName(getInstanceDisplayLabel(collaborator));
  }, []);

  const cancelEditingInstanceName = useCallback(() => {
    setEditingInstanceId(null);
    setEditingInstanceName("");
  }, []);

  const saveInstanceName = useCallback(async (collaborator: CollaboratorInstance) => {
    const nextName = editingInstanceName.trim();
    if (!nextName) {
      toast("Informe um nome para a instância.", "error");
      return;
    }

    setSavingInstanceName(true);
    try {
      const res = await fetch("/api/whatsapp/admin/instances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: collaborator.id, displayName: nextName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao renomear instância");

      const displayName = data.instance?.displayName || nextName;
      setCollaborators((prev) => prev.map((item) => (
        item.id === collaborator.id ? { ...item, displayName } : item
      )));
      setSelectedCollaborator((current) => (
        current?.id === collaborator.id ? { ...current, displayName } : current
      ));
      setEditingInstanceId(null);
      setEditingInstanceName("");
      toast("Nome da instância atualizado.", "success");
    } catch (error: any) {
      toast(error.message || "Erro ao renomear instância", "error");
    } finally {
      setSavingInstanceName(false);
    }
  }, [editingInstanceName]);

  const saveInstanceChannel = useCallback(async (collaborator: CollaboratorInstance, channel: InstanceChannel) => {
    setSavingInstanceChannelId(collaborator.id);
    try {
      const res = await fetch("/api/whatsapp/admin/instances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: collaborator.id, channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao alterar canal");

      const updatedChannel = getInstanceChannel({ ...collaborator, channel: data.instance?.channel || channel });
      setCollaborators((prev) => prev.map((item) => (
        item.id === collaborator.id ? { ...item, channel: updatedChannel } : item
      )));
      setSelectedCollaborator((current) => (
        current?.id === collaborator.id ? { ...current, channel: updatedChannel } : current
      ));
      toast(`Canal alterado para ${updatedChannel === "instagram" ? "Instagram" : "WhatsApp"}.`, "success");
    } catch (error: any) {
      toast(error.message || "Erro ao alterar canal", "error");
    } finally {
      setSavingInstanceChannelId(null);
    }
  }, []);

  // ─── Data fetching ────────────────────────────────────────
  // Note: Sound & browser notifications are handled globally by the sidebar.
  // Monta a query compartilhada (instância explícita ou colaborador + unit).
  const inboxScopeKey = `${targetInstanceId || `user:${targetUserId || "self"}`}|${effectiveUnit || "all"}`;
  const conversationSearch = debouncedSearch.trim();
  const conversationListScopeKey = `${inboxScopeKey}|search:${conversationSearch}`;

  const waParams = useCallback((extra?: Record<string, string>) => {
    const p = new URLSearchParams();
    if (targetInstanceId) {
      p.set("targetInstanceId", targetInstanceId);
    } else if (targetUserId) {
      p.set("targetUserId", targetUserId);
    }
    if (effectiveUnit) p.set("unit", effectiveUnit);
    if (extra) for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  }, [targetInstanceId, targetUserId, effectiveUnit]);

  const profilePicUrlFor = useCallback((phone: string, refresh = false) => {
    const qs = waParams({ phone, ...(refresh ? { refresh: "1" } : {}) });
    return `/api/whatsapp/profile-pic?${qs}`;
  }, [waParams]);

  const newConversationEndpoint = useMemo(() => {
    const qs = waParams();
    return `/api/whatsapp/new-conversation${qs ? `?${qs}` : ""}`;
  }, [waParams]);

  const handleNewConversationReady = useCallback((conversation: Conversation) => {
    setConversations((previous) => {
      const byId = new Map(previous.map((item) => [item.id, item]));
      byId.set(conversation.id, mergeConversation(byId.get(conversation.id), conversation));
      return sortConversationsByActivity(Array.from(byId.values()));
    });
    setMessages([]);
    selectConversation(conversation);
    toast("Conversa pronta para enviar mensagens.", "success");
  }, [selectConversation]);

  const renameContact = useCallback(async (conversationId: string, name: string) => {
    const qs = waParams();
    const res = await fetch(`/api/whatsapp/contact-summary${qs ? `?${qs}` : ""}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Erro ao atualizar nome");
    }

    const contact = data.contact as Contact;
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId
          ? { ...conv, contact: { ...conv.contact, ...contact } }
          : conv
      )
    );
    setSelectedConv((prev) =>
      prev?.id === conversationId
        ? { ...prev, contact: { ...prev.contact, ...contact } }
        : prev
    );
    return contact;
  }, [waParams]);

  const updateContactProfilePic = useCallback((phone: string, profilePic: string) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.contact.phone === phone
          ? { ...conv, contact: { ...conv.contact, profilePic } }
          : conv
      )
    );
    setSelectedConv((prev) =>
      prev?.contact.phone === phone
        ? { ...prev, contact: { ...prev.contact, profilePic } }
        : prev
    );
  }, []);

  useEffect(() => {
    activeScopeRef.current = inboxScopeKey;
  }, [inboxScopeKey]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    selectedConvRef.current = selectedConv;
  }, [selectedConv]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const fetchConversations = useCallback(async (options?: {
    incremental?: boolean;
    phase?: "initial" | "enrich" | "page" | "refresh";
    cursor?: string;
  }) => {
    const scopePrefix = `${conversationListScopeKey}:`;
    if (conversationsInFlightScopeRef.current?.startsWith(scopePrefix)) return null;

    const lastSync = conversationsLastSyncRef.current;
    const incremental = Boolean(options?.incremental && lastSync && !conversationSearch);
    const phase = options?.phase || "refresh";
    const isLightInitial = phase === "initial" && !incremental;
    const isPage = phase === "page" && !incremental;
    const requestKind = incremental ? "delta" : isPage ? `page:${options?.cursor || "none"}` : phase;
    const requestKey = `${conversationListScopeKey}:${requestKind}`;
    conversationsInFlightScopeRef.current = requestKey;
    const requestSeq = ++conversationsRequestSeqRef.current;
    const scopeAtRequestStart = conversationListScopeKey;
    try {
      const qs = waParams({
        limit: String(incremental ? INBOX_FULL_CONVERSATION_LIMIT : INBOX_INITIAL_CONVERSATION_LIMIT),
        includeCampaigns: isLightInitial ? "0" : "1",
        ...(conversationSearch ? { search: conversationSearch } : {}),
        ...(isPage && options?.cursor ? { cursor: options.cursor } : {}),
        ...(!incremental && deepLinkConversationId ? { conversationId: deepLinkConversationId } : {}),
        ...(incremental && lastSync ? { updatedSince: lastSync } : {}),
      });
      const res = await fetch(`/api/whatsapp/conversations${qs ? `?${qs}` : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.details || data.error || "Não foi possível carregar as conversas.");
      }
      if (
        requestSeq === conversationsRequestSeqRef.current &&
        scopeAtRequestStart === activeConversationListScopeRef.current &&
        data.conversations
      ) {
        const incoming = data.conversations as Conversation[];
        const nextServerTime = typeof data.serverTime === "string"
          ? data.serverTime
          : new Date().toISOString();

        if (incremental) {
          const removedIds = new Set<string>(
            Array.isArray(data.removedConversationIds) ? data.removedConversationIds : []
          );

          if (incoming.length > 0 || removedIds.size > 0) {
            setConversations((previous) => {
              const byId = new Map<string, Conversation>();
              previous.forEach((conversation) => {
                if (!removedIds.has(conversation.id)) {
                  byId.set(conversation.id, conversation);
                }
              });
              incoming.forEach((conversation) => {
                byId.set(conversation.id, mergeConversation(byId.get(conversation.id), conversation));
              });
              return sortConversationsByActivity(Array.from(byId.values()));
            });

            setSelectedConv((previous) => {
              if (!previous || removedIds.has(previous.id)) return previous;
              const updated = incoming.find((conversation) => conversation.id === previous.id);
              return updated ? mergeConversation(previous, updated) : previous;
            });
          }
        } else {
          setConversations((previous) => {
            const byId = new Map(previous.map((conversation) => [conversation.id, conversation]));
            incoming.forEach((conversation) => {
              byId.set(conversation.id, mergeConversation(byId.get(conversation.id), conversation));
            });
            return sortConversationsByActivity(Array.from(byId.values()));
          });
          conversationsIncrementalPollsRef.current = 0;
        }

        if (!isPage) {
          conversationsLastSyncRef.current = nextServerTime;
        }

        const responseHasMore = Boolean(data.hasMore);
        const responseCursor = typeof data.nextCursor === "string" ? data.nextCursor : null;
        if (phase === "initial" || isPage || (phase === "enrich" && conversationsRef.current.length <= INBOX_INITIAL_CONVERSATION_LIMIT)) {
          setHasMoreConversations(responseHasMore);
          setNextConversationCursor(responseCursor);
        }
        setConversationLoadError(null);
      }
      return true;
    } catch (e) {
      if (requestSeq === conversationsRequestSeqRef.current) {
        console.error(e);
        if (isPage) {
          setConversationLoadError(e instanceof Error ? e.message : "Não foi possível carregar mais conversas.");
        }
      }
      return false;
    } finally {
      if (conversationsInFlightScopeRef.current === requestKey) {
        conversationsInFlightScopeRef.current = null;
      }
    }
  }, [conversationListScopeKey, conversationSearch, deepLinkConversationId, waParams]);

  useEffect(() => {
    if (!deepLinkConversationId) return;
    if (selectedConvRef.current?.id === deepLinkConversationId) return;

    const linkedConversation = conversations.find((conversation) => conversation.id === deepLinkConversationId);
    if (linkedConversation) {
      selectConversation(linkedConversation, { updateUrl: false });
    }
  }, [conversations, deepLinkConversationId, selectConversation]);

  const isConversationInService = useCallback((conv?: Conversation | null) => {
    return !!conv?.assignedTo;
  }, []);

  const fetchMessages = useCallback(async (convId: string, markAsRead = false) => {
    const requestKey = `${inboxScopeKey}:${convId}:${markAsRead ? "read" : "peek"}`;
    if (messagesInFlightKeysRef.current.has(requestKey)) return;
    messagesInFlightKeysRef.current.add(requestKey);
    const requestSeq = ++messagesRequestSeqRef.current;
    const scopeAtRequestStart = inboxScopeKey;
    try {
      const qs = waParams({ conversationId: convId, limit: "120", ...(markAsRead ? { markAsRead: "1" } : {}) });
      const res = await fetch(`/api/whatsapp/messages?${qs}`);
      const data = await res.json();
      if (
        requestSeq === messagesRequestSeqRef.current &&
        scopeAtRequestStart === activeScopeRef.current &&
        selectedConvRef.current?.id === convId &&
        data.messages
      ) {
        setMessages(data.messages);
        if (markAsRead) {
          setConversations((prev) =>
            prev.map((conv) => conv.id === convId && conv.unreadCount !== 0 ? { ...conv, unreadCount: 0 } : conv)
          );
          setSelectedConv((prev) =>
            prev?.id === convId && prev.unreadCount !== 0 ? { ...prev, unreadCount: 0 } : prev
          );
        }
      }
    } catch (e) {
      if (requestSeq === messagesRequestSeqRef.current) {
        console.error(e);
      }
    } finally {
      messagesInFlightKeysRef.current.delete(requestKey);
    }
  }, [inboxScopeKey, waParams]);

  // Ao trocar o escopo do inbox (instância, colaborador ou unidade), zera a
  // seleção atual e invalida respostas antigas ainda em voo.
  useEffect(() => {
    conversationsRequestSeqRef.current += 1;
    messagesRequestSeqRef.current += 1;
    conversationsInFlightScopeRef.current = null;
    conversationsLastSyncRef.current = null;
    conversationsIncrementalPollsRef.current = 0;
    messagesInFlightKeysRef.current.clear();
    selectedConversationIdRef.current = null;
    setSelectedConv(null);
    setMessages([]);
  }, [inboxScopeKey]);

  useEffect(() => {
    const previousScope = conversationsStateScopeRef.current;
    if (previousScope) {
      writeConversationListMemoryCache(previousScope, conversationsRef.current);
    }

    conversationsRequestSeqRef.current += 1;
    conversationsInFlightScopeRef.current = null;
    conversationsLastSyncRef.current = null;
    conversationsIncrementalPollsRef.current = 0;
    activeConversationListScopeRef.current = conversationListScopeKey;
    conversationsStateScopeRef.current = conversationListScopeKey;
    skipNextConversationCacheWriteRef.current = true;
    const cachedConversations = readConversationListMemoryCache(conversationListScopeKey) || [];
    setConversations(cachedConversations);
    setHasMoreConversations(cachedConversations.length >= INBOX_INITIAL_CONVERSATION_LIMIT);
    setNextConversationCursor(cachedConversations.at(-1)?.id || null);
    setIsLoadingMoreConversations(false);
    setConversationLoadError(null);
  }, [conversationListScopeKey]);

  useEffect(() => {
    if (skipNextConversationCacheWriteRef.current) {
      skipNextConversationCacheWriteRef.current = false;
      return;
    }
    if (conversationsStateScopeRef.current === conversationListScopeKey) {
      writeConversationListMemoryCache(conversationListScopeKey, conversations);
    }
  }, [conversationListScopeKey, conversations]);

  useEffect(() => {
    let cancelled = false;
    let hydrationTimer: number | null = null;
    const hasCachedConversations = Boolean(readConversationListMemoryCache(conversationListScopeKey)?.length);

    const loadConversationList = async () => {
      if (hasCachedConversations) {
        await fetchConversations({ phase: "enrich" });
        return;
      }

      await fetchConversations({ phase: "initial" });
      if (cancelled) return;

      hydrationTimer = window.setTimeout(() => {
        if (!cancelled) void fetchConversations({ phase: "enrich" });
      }, 200);
    };

    void loadConversationList();

    return () => {
      cancelled = true;
      if (hydrationTimer) window.clearTimeout(hydrationTimer);
    };
  }, [conversationListScopeKey, conversationSearch, fetchConversations]);

  const loadMoreConversations = useCallback(async () => {
    if (!hasMoreConversations || !nextConversationCursor || isLoadingMoreConversations) return;

    setIsLoadingMoreConversations(true);
    try {
      await fetchConversations({
        phase: "page",
        cursor: nextConversationCursor,
      });
    } finally {
      setIsLoadingMoreConversations(false);
    }
  }, [fetchConversations, hasMoreConversations, isLoadingMoreConversations, nextConversationCursor]);

  const handleConversationListScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom <= 240) {
      void loadMoreConversations();
    }
  }, [loadMoreConversations]);

  const refreshVisibleInbox = useCallback(() => {
    if (document.visibilityState === "hidden") return;
    const shouldUseIncremental =
      Boolean(conversationsLastSyncRef.current) &&
      conversationsIncrementalPollsRef.current < INBOX_INCREMENTAL_FULL_REFRESH_EVERY;

    fetchConversations({ incremental: shouldUseIncremental });
    conversationsIncrementalPollsRef.current = shouldUseIncremental
      ? conversationsIncrementalPollsRef.current + 1
      : 0;

    const currentConversation = selectedConvRef.current;
    if (currentConversation) {
      fetchMessages(currentConversation.id, isConversationInService(currentConversation));
    }
  }, [fetchConversations, fetchMessages, isConversationInService]);

  useVisiblePolling(refreshVisibleInbox, INBOX_POLL_INTERVAL_MS, { runImmediately: false });

  const selectedConversationId = selectedConv?.id || null;

  // Load messages only when the user opens another conversation. Polling updates
  // the same conversation silently so the chat does not flash a loading state.
  useEffect(() => {
    if (!selectedConversationId) {
      selectedConversationIdRef.current = null;
      setLoadingMessages(false);
      return;
    }

    const isNewSelection = selectedConversationIdRef.current !== selectedConversationId;
    selectedConversationIdRef.current = selectedConversationId;

    if (isNewSelection) {
      setLoadingMessages(true);
      setMessages([]);
    }

    const currentConversation = selectedConvRef.current;
    fetchMessages(selectedConversationId, isConversationInService(currentConversation)).finally(() => {
      if (selectedConversationIdRef.current === selectedConversationId) {
        setLoadingMessages(false);
      }
    });
  }, [selectedConversationId, fetchMessages, isConversationInService]);

  // Auto-scroll
  const prevLengthRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (!imagePreview && !documentPreview) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImagePreview(null);
        setDocumentPreview(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [imagePreview, documentPreview]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;

      // Overlays consume Escape first; a second press then leaves the chat.
      if (imagePreview || documentPreview || editingMessage || showDeleteModal || showCloseModal || showNewConversationDialog) {
        return;
      }
      if (contactSidebarOpen || contactPopoverOpen || kebabOpen) {
        setContactSidebarOpen(false);
        setContactPopoverOpen(false);
        setKebabOpen(false);
        return;
      }
      if (!selectedConvRef.current) return;

      event.preventDefault();
      leaveConversation();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    contactPopoverOpen,
    contactSidebarOpen,
    documentPreview,
    editingMessage,
    imagePreview,
    kebabOpen,
    leaveConversation,
    showCloseModal,
    showDeleteModal,
    showNewConversationDialog,
  ]);

  // ─── File attachment ──────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setAttachment({
          file,
          base64: reader.result as string,
          type: file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "document",
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // ─── Send message ─────────────────────────────────────────
  const handleSendMessage = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !attachment) || !selectedConv) return;

    const wasFirstMessage = messages.length === 0;
    setIsSending(true);
    const tempMsg = newMessage;
    const tempAttach = attachment;
    const replyTarget = replyingTo;
    const tempId = "temp_" + Date.now();

    setNewMessage("");
    setAttachment(null);
    setReplyingTo(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        body: tempMsg,
        type: tempAttach ? tempAttach.type : "text",
        mediaUrl: tempAttach?.base64,
        mediaFileName: tempAttach?.file.name || null,
        mediaMimeType: tempAttach?.file.type || mimeTypeFromDataUrl(tempAttach?.base64) || null,
        mediaSizeBytes: tempAttach?.file.size ?? null,
        quotedMessageId: replyTarget?.messageId || null,
        quotedMessageBody: replyTarget ? messageReplyPreview(replyTarget) : null,
        quotedMessageType: replyTarget?.type || null,
        quotedMessageFromMe: replyTarget?.fromMe ?? null,
        fromMe: true,
        status: "sent",
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const payload: Record<string, any> = {
        conversationId: selectedConv.id,
        contactId: selectedConv.contact.phone,
        body: tempMsg,
        type: tempAttach ? tempAttach.type : "text",
      };
      if (selectedConv.instanceId || targetInstanceId) {
        payload.instanceId = selectedConv.instanceId || targetInstanceId;
      } else if (targetUserId) {
        payload.targetUserId = targetUserId;
      }
      if (tempAttach) {
        payload.file = tempAttach.base64;
        payload.docName = tempAttach.file.name;
        payload.mimeType = tempAttach.file.type || mimeTypeFromDataUrl(tempAttach.base64);
        payload.fileSize = tempAttach.file.size;
      }
      if (replyTarget?.messageId) {
        payload.replyid = replyTarget.messageId;
        payload.replyId = replyTarget.messageId;
      }

      const qs = waParams();
      const res = await fetch(`/api/whatsapp/send${qs ? `?${qs}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Falha no envio:", err);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setNewMessage((current) => current || tempMsg);
        if (tempAttach) setAttachment((current) => current || tempAttach);
        if (replyTarget) setReplyingTo((current) => current || replyTarget);
        toast(err.error || "Não foi possível enviar a mensagem.", "error");
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.message) {
          setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
        }
        if (wasFirstMessage) autoEvolveToServiceStage(selectedConv.contact.phone, selectedConv.contact.unit);
        fetchMessages(selectedConv.id, isConversationInService(selectedConv));
      }
      fetchConversations({ incremental: true });
    } catch (error) {
      console.error(error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage((current) => current || tempMsg);
      if (tempAttach) setAttachment((current) => current || tempAttach);
      if (replyTarget) setReplyingTo((current) => current || replyTarget);
      toast("Erro ao enviar mensagem. Tente novamente.", "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyMessage = async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.body || "");
      toast("Mensagem copiada", "success");
    } catch {
      toast("Não foi possível copiar a mensagem", "error");
    }
  };

  const handleReplyMessage = (msg: Message) => {
    if (!msg.messageId || msg.status === "deleted" || msg.readOnly) return;
    setReplyingTo(msg);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const openEditMessage = (msg: Message) => {
    if (!messageActionState(msg).canEdit) {
      toast("Tempo para editar esta mensagem expirou", "error");
      return;
    }
    setEditingMessage(msg);
    setEditingMessageBody(msg.body || "");
  };

  const saveEditedMessage = async () => {
    if (!editingMessage || !selectedConv) return;
    const nextBody = editingMessageBody.trim();
    if (!nextBody) {
      toast("Digite a nova mensagem", "error");
      return;
    }
    if (nextBody === editingMessage.body) {
      setEditingMessage(null);
      return;
    }

    setMessageActionId(editingMessage.id);
    try {
      const qs = waParams();
      const res = await fetch(`/api/whatsapp/messages${qs ? `?${qs}` : ""}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingMessage.id, body: nextBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.details || "Erro ao editar mensagem");

      setMessages((prev) =>
        prev.map((item) => item.id === editingMessage.id ? { ...item, body: nextBody } : item)
      );
      setEditingMessage(null);
      toast("Mensagem editada", "success");
      fetchConversations({ incremental: true });
    } catch (error: any) {
      toast(error.message || "Não foi possível editar a mensagem", "error");
    } finally {
      setMessageActionId(null);
    }
  };

  const deleteMessageForEveryone = async (msg: Message) => {
    if (!selectedConv) return;
    if (!messageActionState(msg).canDelete) {
      toast("Tempo para apagar esta mensagem expirou", "error");
      return;
    }
    const confirmed = window.confirm("Apagar esta mensagem para todos?");
    if (!confirmed) return;

    setMessageActionId(msg.id);
    try {
      const qs = waParams();
      const res = await fetch(`/api/whatsapp/messages${qs ? `?${qs}` : ""}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: msg.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.details || "Erro ao apagar mensagem");

      setMessages((prev) =>
        prev.map((item) => item.id === msg.id
          ? {
              ...item,
              body: "Mensagem apagada",
              mediaUrl: null,
              mediaFileName: null,
              mediaMimeType: null,
              mediaSizeBytes: null,
              status: "deleted",
            }
          : item)
      );
      toast("Mensagem apagada", "success");
      fetchConversations({ incremental: true });
    } catch (error: any) {
      toast(error.message || "Não foi possível apagar a mensagem", "error");
    } finally {
      setMessageActionId(null);
    }
  };

  // ─── Gravação de áudio ────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Usa webm/opus se disponível, senão fallback para o default
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          sendAudioMessage(base64);
        };
        reader.readAsDataURL(audioBlob);
        // Liberar microfone
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Erro ao acessar microfone:", err);
      toast("Permita o acesso ao microfone para gravar áudio", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      // Remove handler para não enviar o áudio ao parar
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const sendAudioMessage = async (base64: string) => {
    if (!selectedConv) return;
    setIsSending(true);
    try {
      const payload: Record<string, any> = {
        conversationId: selectedConv.id,
        contactId: selectedConv.contact.phone,
        body: "",
        type: "audio",
        file: base64,
      };
      if (selectedConv.instanceId || targetInstanceId) {
        payload.instanceId = selectedConv.instanceId || targetInstanceId;
      } else if (targetUserId) {
        payload.targetUserId = targetUserId;
      }

      const qs = waParams();
      const res = await fetch(`/api/whatsapp/send${qs ? `?${qs}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        fetchMessages(selectedConv.id, isConversationInService(selectedConv));
        fetchConversations({ incremental: true });
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Falha ao enviar áudio:", err);
        toast(err.error || "Erro ao enviar áudio", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Erro ao enviar áudio", "error");
    } finally {
      setIsSending(false);
    }
  };

  // Avança o deal do contato da 1ª fase para a 2ª automaticamente (ex: Novo Lead → Em Atendimento)
  const autoEvolveToServiceStage = useCallback(async (phone: string, unit?: string | null) => {
    try {
      const clientParams = new URLSearchParams({ search: phone });
      if (unit) clientParams.set("unit", unit);
      const [cRes, pRes] = await Promise.all([
        fetch(`/api/clients?${clientParams.toString()}`),
        fetch('/api/pipelines?scope=base'),
      ]);
      const clientsPayload = await cRes.json();
      const client = clientsPayload.clients?.[0];
      const pipes = await pRes.json();
      const pipeline = pipes.find((p: any) => !unit || p.unit === unit) || pipes[0];
      if (!pipeline?.stages || pipeline.stages.length < 2) return;
      const dealParams = new URLSearchParams({ pipelineId: pipeline.id, phone });
      if (unit) dealParams.set("unit", unit);
      const dRes = await fetch(`/api/pipeline?${dealParams.toString()}`);
      const deals = await dRes.json();
      const deal = client ? deals.find((d: any) => d.clientId === client.id) || deals[0] : deals[0];
      if (!deal || deal.stageId !== pipeline.stages[0].id) return; // já avançou
      const targetStage = pipeline.stages[1];
      const res = await fetch('/api/pipeline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deal.id, stageId: targetStage.id }),
      });
      if (res.ok) {
        toast(`Fase atualizada: ${targetStage.name}`, 'success');
        setPipelineRefreshKey((k) => k + 1);
      }
    } catch {
      // falha silenciosa — auto-evolução é best-effort
    }
  }, []);

  // Finalizar conversa
  const handleCloseConversation = async () => {
    if (!selectedConv) return;
    setIsClosing(true);
    try {
      const targetParam = targetInstanceId
        ? `?targetInstanceId=${targetInstanceId}`
        : targetUserId
          ? `?targetUserId=${targetUserId}`
          : '';
      const res = await fetch(`/api/whatsapp/conversations/${selectedConv.id}/close${targetParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution: closeResolution,
          closeNote,
          sendGoodbye,
          sendSurvey,
          unit: globalUnit,
        }),
      });
      if (res.ok) {
        toast('Conversa finalizada com sucesso', 'success');
        setShowCloseModal(false);
        setCloseResolution('resolved');
        setCloseNote('');
        fetchConversations({ incremental: true });
      } else {
        toast('Erro ao finalizar conversa', 'error');
      }
    } catch {
      toast('Erro ao finalizar conversa', 'error');
    } finally {
      setIsClosing(false);
    }
  };

  // Reabrir conversa
  const handleReopenConversation = async () => {
    if (!selectedConv) return;
    try {
      const targetParam = targetInstanceId
        ? `?targetInstanceId=${targetInstanceId}`
        : targetUserId
          ? `?targetUserId=${targetUserId}`
          : '';
      const res = await fetch(`/api/whatsapp/conversations/${selectedConv.id}/reopen${targetParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast('Conversa reaberta', 'success');
        fetchConversations({ incremental: true });
      }
    } catch {
      toast('Erro ao reabrir conversa', 'error');
    }
  };

  const handleMarkConversationUnread = async () => {
    if (!selectedConv || isMarkingUnread) return;

    setIsMarkingUnread(true);
    try {
      const qs = waParams();
      const res = await fetch(
        `/api/whatsapp/conversations/${selectedConv.id}/unread${qs ? `?${qs}` : ""}`,
        { method: "PATCH" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao marcar conversa como não lida");

      setConversations((previous) => previous.map((conversation) => (
        conversation.id === selectedConv.id ? { ...conversation, unreadCount: 1 } : conversation
      )));
      toast("Conversa marcada como não lida", "success");
      leaveConversation();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao marcar conversa como não lida", "error");
    } finally {
      setIsMarkingUnread(false);
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedConv) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${selectedConv.id}/delete`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast('Conversa excluída com sucesso', 'success');
        setShowDeleteModal(false);
        setConversations((previous) => previous.filter((conversation) => conversation.id !== selectedConv.id));
        setSelectedConv(null);
        router.push(buildUrl("/crm/inbox"));
        fetchConversations({ incremental: true });
      } else {
        const data = await res.json();
        toast(data.error || 'Erro ao excluir', 'error');
      }
    } catch {
      toast('Erro ao excluir conversa', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Iniciar atendimento — atribui operador e altera status da conversa para 'open'
  const handleStartService = async () => {
    if (!selectedConv || !currentUser) return;
    try {
      const targetParam = targetInstanceId
        ? `?targetInstanceId=${targetInstanceId}`
        : targetUserId
          ? `?targetUserId=${targetUserId}`
          : '';

      // 1. Atualizar status da conversa para 'open' e atribuir operador no banco de dados
      const res = await fetch(`/api/whatsapp/conversations/${selectedConv.id}/reopen${targetParam}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id,
          'x-user-name': currentUser.name || '',
        },
        body: JSON.stringify({
          assignedTo: currentUser.id,
          assignedToName: currentUser.name || 'Operador',
        }),
      });

      if (res.ok) {
        toast('Atendimento iniciado!', 'success');
        autoEvolveToServiceStage(selectedConv.contact.phone, selectedConv.contact.unit);

        // 2. Atualizar estado local imediatamente
        const updatedConv = {
          ...selectedConv,
          status: 'open',
          assignedTo: currentUser.id,
          assignedToName: currentUser.name || 'Operador',
        };
        setSelectedConv(updatedConv);

        fetchConversations({ incremental: true });
        fetchMessages(selectedConv.id, true);
      } else {
        toast('Erro ao iniciar atendimento', 'error');
      }
    } catch {
      toast('Erro ao iniciar atendimento', 'error');
    }
  };

  // ─── Filtered conversations ───────────────────────────────
  const openCount = conversations.filter((c) => c.status === "open").length;
  const unreadCount = conversations.filter((c) => c.unreadCount > 0).length;

  // Etiquetas (campanhas) presentes nas conversas — alimentam o filtro.
  const availableTags = [...new Set(
    conversations.map((c) => c.campaignName).filter(Boolean) as string[]
  )].sort();

  const filtered = conversations.filter((c) => {
    // Tab filter
    if (tab === "open" && c.status !== "open") return false;
    if (tab === "unread" && c.unreadCount === 0) return false;
    if (tab === "closed" && c.status !== "closed") return false;
    // Tag (campanha) filter
    if (tagFilter.length > 0 && !tagFilter.includes(c.campaignName || "")) return false;
    // Search filter
    if (!search.trim()) return true;
    return conversationMatchesSearch(c, search);
  });
  const activeInstanceChannel = getInstanceChannel(selectedCollaborator);

  // ─── UI ───────────────────────────────────────────────────
  return (
    <div
      data-inbox-thread-open={selectedConv ? "true" : "false"}
      className="absolute inset-0 flex overflow-hidden bg-muted/15 text-foreground"
    >
      <style jsx global>{`
        @media (max-width: 639px) {
          .crm-viewport-lock:has([data-inbox-thread-open="true"]) .crm-shell-header {
            display: none;
          }

          .crm-viewport-lock:has([data-inbox-thread-open="true"]) .crm-shell-content {
            padding: 0;
          }

          html[data-theme="dark"] .inbox-thread-header,
          html[data-theme="dark"] .inbox-thread-composer {
            border-color: rgba(148, 163, 184, 0.16);
            background: rgba(9, 12, 18, 0.96);
          }

          html[data-theme="dark"] .inbox-thread-messages {
            background:
              radial-gradient(circle at 14% 0%, rgba(46, 58, 75, 0.22), transparent 38%),
              radial-gradient(circle at 100% 48%, rgba(35, 43, 61, 0.16), transparent 36%),
              #06080d;
          }

          html[data-theme="dark"] .inbox-message-incoming {
            border-color: rgba(148, 163, 184, 0.28);
            background: linear-gradient(145deg, rgba(31, 36, 44, 0.96), rgba(20, 24, 30, 0.96));
            color: #f8fafc;
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.035),
              0 8px 28px rgba(0, 0, 0, 0.18);
          }

          html[data-theme="dark"] .inbox-message-outgoing {
            border-color: rgba(139, 92, 246, 0.78);
            background: linear-gradient(145deg, rgba(86, 55, 144, 0.88), rgba(59, 40, 101, 0.94));
            color: #f8fafc;
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.05),
              0 8px 28px rgba(23, 12, 50, 0.24);
          }

          html[data-theme="dark"] .inbox-date-divider {
            border-color: rgba(148, 163, 184, 0.2);
            background: rgba(24, 28, 35, 0.9);
            color: rgba(226, 232, 240, 0.72);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
          }
        }
      `}</style>
      
      {/* ── LEFT: Conversation List ── */}
      <div
        className={`flex h-full w-full flex-shrink-0 flex-col border-r border-border/80 bg-card shadow-[4px_0_18px_rgba(0,0,0,0.04)] sm:w-[360px] xl:w-[390px] ${
          selectedConv ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* Workspace Switcher (Admin) — mesma altura fixa (h-16) do cabeçalho
            do chat ao lado, para as duas linhas divisórias ficarem alinhadas. */}
        {canViewCollaborators && (
          <div className="h-16 flex-shrink-0 border-b border-border/70 bg-card/80">
            <div className="relative h-full">
              <button
                onClick={() => setCollaboratorDropdownOpen((o) => !o)}
                className="flex h-full w-full items-center gap-3 px-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {selectedCollaborator ? (
                    <ChannelMark channel={activeInstanceChannel} size="md" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                </div>
                <div className="flex flex-1 flex-col items-start min-w-0">
                  <div className="flex w-full min-w-0 items-center gap-2">
                    {!selectedCollaborator && <ChannelMark channel={activeInstanceChannel} />}
                    <span className="truncate text-left text-sm font-semibold text-foreground">
                      {getInstanceDisplayLabel(selectedCollaborator)}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground truncate w-full text-left">
                    {selectedCollaborator
                      ? `${activeInstanceChannel === "instagram" ? "Instagram" : "WhatsApp"} · Visualizando ${selectedCollaborator.unit}`
                      : "WhatsApp · Principal"}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>

              {collaboratorDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCollaboratorDropdownOpen(false)} />
                  <div className="absolute left-3 right-3 top-[calc(100%-8px)] z-50 rounded-xl border border-border bg-popover shadow-lg overflow-hidden py-1">
                    <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Contas
                    </div>
                    <button
                      onClick={() => selectCollaborator(null)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted ${
                        !selectedCollaborator ? "bg-primary/5 text-primary" : "text-foreground"
                      }`}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </div>
                      <ChannelMark channel="whatsapp" />
                      <span className="truncate">Meu Inbox</span>
                      {!selectedCollaborator && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                    </button>
                    {collaborators.length > 0 && <div className="my-1 border-t border-border" />}
                    <div className="max-h-60 overflow-y-auto">
                      {collaborators.map((collab) => {
                        const label = getInstanceDisplayLabel(collab);
                        const channel = getInstanceChannel(collab);
                        const isEditing = editingInstanceId === collab.id;
                        const isSavingChannel = savingInstanceChannelId === collab.id;

                        return (
                          <div
                            key={collab.id}
                            onClick={() => {
                              if (!isEditing) selectCollaborator(collab.userId, collab);
                            }}
                            className={`group flex w-full gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted ${
                              selectedCollaborator?.id === collab.id ? "bg-primary/5 text-primary" : "text-foreground"
                            } ${isEditing ? "cursor-default items-start" : "cursor-pointer items-center"}`}
                          >
                            <ChannelMark channel={channel} />

                            <div className="min-w-0 flex-1">
                              {isEditing && isAdmin ? (
                                <div className="space-y-2">
                                  <input
                                    autoFocus
                                    value={editingInstanceName}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => setEditingInstanceName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveInstanceName(collab);
                                      if (e.key === "Escape") cancelEditingInstanceName();
                                    }}
                                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="Nome da instância"
                                  />
                                  <div className="grid grid-cols-2 gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <span className="col-span-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                      Canal
                                    </span>
                                    <button
                                      type="button"
                                      disabled={isSavingChannel}
                                      onClick={() => saveInstanceChannel(collab, "whatsapp")}
                                      className={`flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                        channel === "whatsapp"
                                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                                          : "border-border text-muted-foreground hover:bg-muted hover:text-emerald-500"
                                      }`}
                                      title="Marcar como WhatsApp"
                                    >
                                      <ChannelIcon channel="whatsapp" className="h-3.5 w-3.5" />
                                      WhatsApp
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isSavingChannel}
                                      onClick={() => saveInstanceChannel(collab, "instagram")}
                                      className={`flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                        channel === "instagram"
                                          ? "border-pink-500/40 bg-pink-500/15 text-pink-500"
                                          : "border-border text-muted-foreground hover:bg-muted hover:text-pink-500"
                                      }`}
                                      title="Marcar como Instagram"
                                    >
                                      <ChannelIcon channel="instagram" className="h-3.5 w-3.5" />
                                      Instagram
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="block truncate">{label}</span>
                              )}
                            </div>

                            {isEditing && isAdmin ? (
                              <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  disabled={savingInstanceName}
                                  onClick={() => saveInstanceName(collab)}
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
                                  title="Salvar nome"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={savingInstanceName}
                                  onClick={cancelEditingInstanceName}
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50"
                                  title="Cancelar"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingInstanceName(collab);
                                    }}
                                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                                    title="Editar nome da instância"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  collab.status === "connected" ? "bg-emerald-500" : "bg-red-500"
                                }`} />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Search + Tabs */}
        <div className="flex flex-col border-b border-border/70 bg-card">
          <div className="p-4 pb-3">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="text-base font-bold tracking-tight text-foreground">Conversas</span>
              <div className="flex items-center gap-2">
                {openCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {openCount}{hasMoreConversations ? "+" : ""} em aberto
                  </span>
                )}
                {activeInstanceChannel === "whatsapp" && (
                  <button
                    type="button"
                    onClick={() => setShowNewConversationDialog(true)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-500"
                    title="Nova conversa"
                    aria-label="Nova conversa"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar conversas..."
                className="flex h-10 w-full rounded-xl border border-transparent bg-muted/55 px-3 py-1 pl-9 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-primary/30 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto px-4 pb-3 scrollbar-none">
            {([
              { key: "all" as const, label: "Todas", count: undefined },
              { key: "open" as const, label: "Em Aberto", count: openCount },
              { key: "unread" as const, label: "Não Lidos", count: unreadCount },
            ]).map(({ key, label, count }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                    active
                      ? "border-primary/20 bg-primary/12 text-primary"
                      : "border-border/80 bg-background/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                      active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {count}{hasMoreConversations ? "+" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filtro por etiqueta (campanha) */}
          {availableTags.length > 0 && (
            <div className="border-t border-border/60 bg-card px-4 py-2.5">
              <div className="relative">
                <button
                  onClick={() => setTagFilterOpen((o) => !o)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs font-medium transition-colors border ${
                    tagFilter.length > 0
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Tag className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">
                    {tagFilter.length > 0 ? `${tagFilter.length} etiqueta(s)` : "Filtrar por etiqueta"}
                  </span>
                  {tagFilter.length > 0 && (
                    <span
                      onClick={(e) => { e.stopPropagation(); setTagFilter([]); }}
                      className="rounded px-1 text-[10px] text-primary hover:text-primary/80"
                    >
                      limpar
                    </span>
                  )}
                  <ChevronDown className={`h-3 w-3 transition-transform ${tagFilterOpen ? "rotate-180" : ""}`} />
                </button>

                {tagFilterOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setTagFilterOpen(false)} />
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl p-1">
                      {availableTags.map((t) => {
                        const active = tagFilter.includes(t);
                        return (
                          <button
                            key={t}
                            onClick={() =>
                              setTagFilter((prev) => (active ? prev.filter((x) => x !== t) : [...prev, t]))
                            }
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                          >
                            <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${active ? "border-primary bg-primary" : "border-border"}`}>
                              {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                            </span>
                            <span className={`inline-flex min-w-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${campaignTagStyle(t)}`}>
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
                              <span className="truncate">{t}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto" onScroll={handleConversationListScroll}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {search || tagFilter.length > 0 ? "Nenhuma conversa encontrada" : "Nenhuma conversa ainda"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-2">
              {filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={selectedConv?.id === conv.id}
                  channel={activeInstanceChannel}
                  onClick={() => {
                    selectConversation(conv);
                  }}
                />
              ))}
            </div>
          )}

          {hasMoreConversations && (
            <div className="flex flex-col items-center gap-2 px-4 py-4">
              {conversationLoadError && (
                <p className="text-center text-xs text-red-500">{conversationLoadError}</p>
              )}
              <button
                type="button"
                onClick={() => void loadMoreConversations()}
                disabled={isLoadingMoreConversations || !nextConversationCursor}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingMoreConversations && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isLoadingMoreConversations
                  ? "Carregando mais conversas..."
                  : conversationLoadError
                    ? "Tentar novamente"
                    : "Carregar mais conversas"}
              </button>
            </div>
          )}

          {!hasMoreConversations && conversations.length > INBOX_INITIAL_CONVERSATION_LIMIT && (
            <p className="px-4 py-4 text-center text-[11px] text-muted-foreground">
              Todas as conversas foram carregadas.
            </p>
          )}
        </div>
      </div>

      {/* ── CENTER: Message Thread ── */}
      <div
        className={`relative flex h-full min-w-0 flex-1 flex-col bg-background ${
          selectedConv ? "flex" : "hidden lg:flex"
        }`}
      >
        {selectedConv ? (
          <>
            {/* Banner admin no topo do thread */}
            {selectedCollaborator && (
              <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-sm lg:hidden">
                <Eye className="w-4 h-4 text-amber-500" />
                <span className="text-amber-600 dark:text-amber-400">
                  Inbox de <strong>{getInstanceDisplayLabel(selectedCollaborator)}</strong>
                </span>
                <button
                  onClick={clearTargetUser}
                  className="ml-auto text-xs text-amber-500 hover:underline"
                >
                  Voltar
                </button>
              </div>
            )}

            {/* Thread Header */}
            <div className="inbox-thread-header z-10 flex h-[68px] shrink-0 items-center justify-between gap-1 border-b border-border/70 bg-card/95 px-3 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur sm:h-16 sm:gap-0 sm:px-5">
              <div className="relative flex min-w-0 flex-1 items-center gap-1 sm:w-auto sm:gap-2">
                {/* Back (mobile) */}
                <button
                  onClick={leaveConversation}
                  aria-label="Voltar para a lista de conversas"
                  className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted lg:hidden"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>

                {/* Avatar + nome — abre a barra lateral do contato */}
                <button
                  onClick={() => setContactSidebarOpen(true)}
                  className="flex min-w-0 items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-muted/50 sm:gap-3 sm:py-1.5 sm:pl-1.5 sm:pr-3"
                  title="Ver perfil completo"
                >
                  <ContactAvatar
                    contact={selectedConv.contact}
                    sizeClassName="h-10 w-10"
                    textClassName="text-sm shadow-inner"
                    fetchUrl={profilePicUrlFor(selectedConv.contact.phone)}
                    refreshUrl={profilePicUrlFor(selectedConv.contact.phone, true)}
                    onResolved={(url) => updateContactProfilePic(selectedConv.contact.phone, url)}
                  />
                  <span className="flex flex-col min-w-0 text-left">
                    <span className="truncate text-base font-semibold leading-tight text-foreground sm:text-[15px]">
                      {selectedConv.contact.name || selectedConv.contact.phone}
                    </span>
                    <span className="truncate text-xs text-muted-foreground font-mono mt-0.5 opacity-80">
                      {selectedConv.contact.phone}
                    </span>
                  </span>
                </button>
              </div>

              <div className="flex w-auto shrink-0 items-center justify-end gap-1 sm:gap-2">
                <a
                  href={`tel:${selectedConv.contact.phone.replace(/\D/g, "")}`}
                  aria-label={`Ligar para ${selectedConv.contact.name || selectedConv.contact.phone}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
                >
                  <Phone className="h-5 w-5" />
                </a>

                {/* Chip discreto de conversa finalizada */}
                {selectedConv && (selectedConv.status === 'resolved' || selectedConv.status === 'closed') && (
                  <span className="hidden sm:flex h-8 items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 text-xs font-medium text-emerald-600" title="Conversa finalizada">
                    <Check className="h-3.5 w-3.5" />
                    Finalizada
                  </span>
                )}

                {selectedConv?.campaignUrl && (
                  <a
                    href={selectedConv.campaignUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden sm:flex h-8 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                    title={selectedConv.campaignName ? `Abrir anúncio: ${selectedConv.campaignName}` : "Abrir anúncio"}
                  >
                    <Megaphone className="h-3.5 w-3.5" />
                    Ver anúncio
                  </a>
                )}

                {/* Botão de abrir barra lateral */}
                <button
                  onClick={() => setContactSidebarOpen(true)}
                  className="hidden sm:flex h-8 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Perfil & Funil
                </button>

                {/* Menu "⋯" — ações da conversa */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setKebabOpen((o) => !o)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-0 transition-colors sm:h-9 sm:w-9 sm:border sm:border-border ${
                      kebabOpen ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    title="Mais ações"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {kebabOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setKebabOpen(false)} />
                      <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-2xl">
                        {/* Adicionar observação */}
                        <button
                          onClick={() => { setEvoSignal((s) => s + 1); setKebabOpen(false); }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Adicionar observação
                        </button>

                        <button
                          onClick={() => { void handleMarkConversationUnread(); setKebabOpen(false); }}
                          disabled={isMarkingUnread}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isMarkingUnread ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Mail className="h-4 w-4 text-muted-foreground" />
                          )}
                          Marcar como não lida
                        </button>

                        <div className="my-1 h-px bg-border" />

                        {/* Finalizar / Reabrir */}
                        {selectedConv && selectedConv.status !== 'resolved' && selectedConv.status !== 'closed' ? (
                          <button
                            onClick={() => { setShowCloseModal(true); setKebabOpen(false); }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10"
                          >
                            <Check className="h-4 w-4" />
                            Finalizar conversa
                          </button>
                        ) : (
                          <button
                            onClick={() => { handleReopenConversation(); setKebabOpen(false); }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                          >
                            <RotateCcw className="h-4 w-4 text-muted-foreground" />
                            Reabrir conversa
                          </button>
                        )}

                        {/* Excluir — apenas ADMINISTRADOR */}
                        {isAdmin && selectedConv && (
                          <>
                            <div className="my-1 h-px bg-border" />
                            <button
                              onClick={() => { setShowDeleteModal(true); setKebabOpen(false); }}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                              Excluir conversa
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="inbox-thread-messages flex-1 space-y-1.5 overflow-y-auto bg-background px-4 py-4 sm:space-y-1 sm:bg-muted/10 sm:px-6 sm:py-5 lg:px-8">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Carregando mensagens...</p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const prevMsg = idx > 0 ? messages[idx - 1] : undefined;
                  const showDateDivider = !prevMsg || messageDateKey(prevMsg.timestamp) !== messageDateKey(msg.timestamp);
                  const dateDivider = showDateDivider ? (
                    <div className="flex justify-center px-4 py-3">
                      <span className="inbox-date-divider rounded-full border border-border/70 bg-card/90 px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm sm:text-[10px] sm:font-semibold">
                        {formatMessageDateLabel(msg.timestamp)}
                      </span>
                    </div>
                  ) : null;

                  if (msg.type === "handoff_divider") {
                    return (
                      <React.Fragment key={msg.id || idx}>
                        {dateDivider}
                        <div className="flex items-center gap-3 py-2 px-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">
                            {msg.body}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      </React.Fragment>
                    );
                  }

                  const operatorChanged = msg.fromMe && prevMsg?.fromMe &&
                    msg.respondedBy && prevMsg.respondedBy &&
                    msg.respondedBy !== prevMsg.respondedBy;
                  const showOperatorName = msg.fromMe && msg.respondedByName && (
                    !prevMsg?.fromMe || prevMsg?.respondedBy !== msg.respondedBy
                  );

                  return (
                    <React.Fragment key={msg.id || idx}>
                      {dateDivider}
                      {/* Divisor de transferência */}
                      {operatorChanged && (
                        <div className="flex items-center gap-3 py-2 px-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            🔄 Transferido para {msg.respondedByName}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      {/* Nome do operador */}
                      {showOperatorName && !operatorChanged && (
                        <div className="flex justify-end px-4 mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-primary text-[8px] font-bold">
                              {msg.respondedByName!.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-[10px] text-primary font-medium">
                              {msg.respondedByName}
                            </span>
                          </div>
                        </div>
                      )}
                      <MessageBubble
                        msg={msg}
                        onReply={handleReplyMessage}
                        onCopy={handleCopyMessage}
                        onEdit={openEditMessage}
                        onDelete={deleteMessageForEveryone}
                        onOpenImage={(src) => {
                          setImagePreview({
                            src,
                            title: selectedConv?.contact?.name || selectedConv?.contact?.phone || "Imagem",
                          });
                        }}
                        onOpenDocument={(message) => {
                          if (!message.mediaUrl) return;
                          const meta = documentMessageMeta(message);
                          setDocumentPreview({
                            src: message.mediaUrl,
                            title: meta.fileName,
                            mimeType: meta.mimeType,
                            sizeLabel: meta.sizeLabel,
                            isPdf: meta.isPdf,
                          });
                        }}
                      />
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Attachment Preview Overlay */}
            {attachment && (
              <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
                <div className="h-14 px-4 flex items-center bg-card border-b border-border gap-3">
                  <button onClick={() => setAttachment(null)} className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                  <h2 className="font-semibold text-foreground">Pré-visualizar</h2>
                </div>
                <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
                  {attachment.type === "image" ? (
                    <img src={attachment.base64} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
                  ) : attachment.file.type === "application/pdf" ? (
                    <embed src={attachment.base64} type="application/pdf" className="w-full h-full max-w-4xl rounded-lg shadow-xl bg-white" />
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-28 h-28 bg-muted rounded-2xl flex items-center justify-center">
                        <FileText className="w-14 h-14 text-muted-foreground" />
                      </div>
                      <div className="text-center">
                        <h3 className="font-semibold text-foreground text-lg max-w-sm truncate">{attachment.file.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{(attachment.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4 bg-card border-t border-border pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {replyingTo && (
                    <div className="mb-3 flex items-stretch overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                      <div className="w-1 shrink-0 bg-primary" />
                      <div className="min-w-0 flex-1 px-3 py-2">
                        <div className="text-xs font-semibold text-primary">
                          Respondendo {replyingTo.fromMe ? "você" : selectedConv?.contact?.name || selectedConv?.contact?.phone || "contato"}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {messageReplyPreview(replyingTo)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="flex w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Cancelar resposta"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center bg-muted rounded-xl px-4 py-2.5 focus-within:ring-1 focus-within:ring-ring">
                      <input
                        className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-sm"
                        placeholder="Adicione uma legenda..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(e as any); } }}
                        disabled={isSending}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={handleSendMessage as any}
                      disabled={isSending}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Botão Iniciar Atendimento — se a conversa não tem atendente */}
            {selectedConv && (!selectedConv.assignedTo || selectedConv.status === 'waiting_response') && (
              <div className="shrink-0 border-t border-border bg-gradient-to-r from-primary/5 to-primary/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Nenhum atendente neste chat</p>
                    <p className="text-xs text-muted-foreground">Clique para assumir o atendimento</p>
                  </div>
                  <button
                    onClick={handleStartService}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all hover:shadow-lg hover:scale-105"
                  >
                    <Play className="h-4 w-4" />
                    Iniciar Atendimento
                  </button>
                </div>
              </div>
            )}



            {/* Input Bar */}
            <div className="inbox-thread-composer shrink-0 border-t border-border/70 bg-card/95 px-2 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.035)] backdrop-blur sm:px-5 sm:py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {replyingTo && !isRecording && (
                <div className="mb-3 flex items-stretch overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                  <div className="w-1 shrink-0 bg-primary" />
                  <div className="min-w-0 flex-1 px-3 py-2">
                    <div className="text-xs font-semibold text-primary">
                      Respondendo {replyingTo.fromMe ? "você" : selectedConv?.contact?.name || selectedConv?.contact?.phone || "contato"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {messageReplyPreview(replyingTo)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="flex w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Cancelar resposta"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {isRecording ? (
                /* UI de gravação de áudio */
                <div className="flex items-center gap-2">
                  <button
                    onClick={cancelRecording}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10 transition-colors"
                    title="Cancelar gravação"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm text-red-500 font-mono">
                      {Math.floor(recordingTime / 60)
                        .toString()
                        .padStart(2, "0")}
                      :
                      {(recordingTime % 60).toString().padStart(2, "0")}
                    </span>
                    <span className="text-xs text-muted-foreground">Gravando...</span>
                  </div>
                  <button
                    onClick={stopRecording}
                    disabled={isSending}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-transform hover:scale-105 disabled:opacity-50"
                    title="Enviar áudio"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 ml-0.5" />
                    )}
                  </button>
                </div>
              ) : (
                /* Barra de input normal */
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/35 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  />

                  <div className="flex min-h-[44px] flex-1 items-end gap-2 rounded-2xl border border-border/80 bg-muted/30 px-4 py-2 shadow-sm transition-all focus-within:border-primary/50 focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/40">
                    <textarea
                      ref={textareaRef}
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e as any);
                        }
                      }}
                      placeholder="Mensagem..."
                      spellCheck={false}
                      className="flex-1 max-h-[120px] resize-none border-0 bg-transparent py-0.5 text-sm text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 [box-shadow:none]"
                      rows={1}
                    />
                  </div>

                  <button
                    onClick={
                      newMessage.trim() || attachment
                        ? (handleSendMessage as any)
                        : startRecording
                    }
                    disabled={isSending}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(124,58,237,0.22)] transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : newMessage.trim() || attachment ? (
                      <Send className="h-4 w-4 ml-0.5" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex h-full flex-col items-center justify-center bg-background p-8 text-center text-muted-foreground">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5 shadow-sm">
              <MessageSquare className="h-9 w-9 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-foreground">WhatsApp Inbox</h3>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              Selecione uma conversa na lista lateral para visualizar as mensagens e interagir com seus clientes.
            </p>
          </div>
        )}
      </div>

      {/* ── RIGHT: Contact Sidebar (toggleable) ── */}
      {selectedConv && contactSidebarOpen && (
        <>
          {/* Overlay for mobile */}
          <div
            className="fixed inset-0 z-40 bg-black/50 xl:hidden"
            onClick={() => setContactSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-none shadow-2xl sm:max-w-sm xl:relative xl:inset-auto xl:z-auto xl:w-auto xl:shadow-none">
            <ContactSidebar
              conversation={selectedConv}
              onClose={() => setContactSidebarOpen(false)}
              pipelineRefreshKey={pipelineRefreshKey}
              profilePicUrl={profilePicUrlFor(selectedConv.contact.phone)}
              refreshProfilePicUrl={profilePicUrlFor(selectedConv.contact.phone, true)}
              onProfilePicResolved={updateContactProfilePic}
              onRenameContact={renameContact}
            />
          </div>
        </>
      )}

      {imagePreview && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white"
          role="dialog"
          aria-modal="true"
          aria-label="Pré-visualização da imagem"
          onClick={() => setImagePreview(null)}
        >
          <div className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/50 px-4">
            <span className="truncate text-sm font-medium text-white/90">{imagePreview.title}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setImagePreview(null);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Fechar imagem"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
            <img
              src={imagePreview.src}
              alt={imagePreview.title}
              className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {documentPreview && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white"
          role="dialog"
          aria-modal="true"
          aria-label="Pré-visualização do documento"
        >
          <div className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/50 px-4">
            <div className="min-w-0">
              <span className="block truncate text-sm font-medium text-white/90">{documentPreview.title}</span>
              <span className="block truncate text-[11px] text-white/50">
                {[documentPreview.sizeLabel, extensionFromMimeType(documentPreview.mimeType).toUpperCase()].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={documentPreview.src}
                download={documentPreview.title}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Baixar documento"
              >
                <Download className="h-5 w-5" />
              </a>
              <button
                type="button"
                onClick={() => setDocumentPreview(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Fechar documento"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
            {documentPreview.isPdf ? (
              <iframe
                src={documentPreview.src}
                title={documentPreview.title}
                className="h-full w-full max-w-5xl rounded-lg border border-white/10 bg-white shadow-2xl"
              />
            ) : (
              <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-red-500 text-white">
                  <FileText className="h-8 w-8" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{documentPreview.title}</p>
                  <p className="mt-1 text-sm text-white/60">Este tipo de arquivo pode ser baixado para visualização.</p>
                </div>
                <a
                  href={documentPreview.src}
                  download={documentPreview.title}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                >
                  <Download className="h-4 w-4" />
                  Baixar arquivo
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Editar Mensagem */}
      {editingMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Editar mensagem</h3>
              <button
                onClick={() => setEditingMessage(null)}
                disabled={messageActionId === editingMessage.id}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              value={editingMessageBody}
              onChange={(e) => setEditingMessageBody(e.target.value)}
              rows={5}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              autoFocus
            />

            <p className="mt-2 text-xs text-muted-foreground">
              A edição só será salva no CRM depois que o WhatsApp confirmar a alteração.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditingMessage(null)}
                disabled={messageActionId === editingMessage.id}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveEditedMessage}
                disabled={messageActionId === editingMessage.id || !editingMessageBody.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {messageActionId === editingMessage.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Excluir Conversa (apenas ADM) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-destructive/30 bg-card p-6 shadow-2xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Excluir Conversa</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tem certeza? Todas as mensagens serão permanentemente excluídas.<br />
                  <span className="font-medium text-destructive">Esta ação não pode ser desfeita.</span>
                </p>
              </div>
              <div className="flex w-full gap-3 mt-2">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteConversation}
                  disabled={isDeleting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Finalizar Conversa */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Finalizar Conversa</h3>
              <button onClick={() => setShowCloseModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Resolução */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Resolução</label>
                <select
                  value={closeResolution}
                  onChange={(e) => setCloseResolution(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="resolved">✅ Resolvido</option>
                  <option value="unresolved">❌ Não Resolvido</option>
                  <option value="spam">🚫 Spam</option>
                  <option value="duplicate">📋 Duplicado</option>
                </select>
              </div>

              {/* Nota interna */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Nota Interna (opcional)</label>
                <textarea
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  placeholder="Observações sobre o atendimento..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground resize-none"
                  rows={3}
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-foreground">Enviar mensagem de despedida</span>
                  <button
                    type="button"
                    onClick={() => setSendGoodbye(!sendGoodbye)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      sendGoodbye ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      sendGoodbye ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>


              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCloseModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseConversation}
                disabled={isClosing}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isClosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      <NewConversationDialog
        open={showNewConversationDialog}
        endpoint={newConversationEndpoint}
        onOpenChange={setShowNewConversationDialog}
        onConversationReady={handleNewConversationReady}
      />
    </div>
  );
}
