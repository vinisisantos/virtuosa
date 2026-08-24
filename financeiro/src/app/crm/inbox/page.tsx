"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { upload } from "@vercel/blob/client";
import { useGlobalUnit } from "@/contexts/UnitContext";
import { toast } from "@/components/toast";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { setBrowserChromeSurface } from "@/lib/color-mode";
import { NewConversationDialog } from "@/components/whatsapp/new-conversation-dialog";
import { SavedRepliesDialog } from "@/components/whatsapp/saved-replies-dialog";
import { EvaluationAvailabilityDialog } from "@/components/whatsapp/evaluation-availability-dialog";
import { EmojiPicker } from "@/components/whatsapp/emoji-picker";
import { ReactionPicker } from "@/components/whatsapp/reaction-picker";
import { DatePicker } from "@/components/ui/date-picker";
import {
  SavedRepliesComposerMenu,
  filterSavedReplies,
  findSavedReplyTrigger,
  type SavedReplyTrigger,
} from "@/components/whatsapp/saved-replies-composer-menu";
import {
  useWhatsAppSavedReplies,
  type SavedReply,
} from "@/hooks/use-whatsapp-saved-replies";
import { useWhatsAppInstanceNotificationMutes } from "@/hooks/use-whatsapp-instance-notification-mutes";
import {
  INBOX_INCREMENTAL_FULL_REFRESH_EVERY,
  INBOX_FULL_CONVERSATION_LIMIT,
  INBOX_INITIAL_CONVERSATION_LIMIT,
  INBOX_POLL_INTERVAL_MS,
  buildLocalDateTime,
  buildVisibleMessageItems,
  campaignTagStyle,
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
import { resolveInboxConversationUnit } from "@/lib/whatsapp/conversation-unit";
import { preserveActiveAudioMediaUrl } from "@/lib/whatsapp/audio-playback";
import { whatsappDeferredMediaUrl } from "@/lib/whatsapp/deferred-media";
import { findQuotedImagePreviewTarget } from "@/lib/whatsapp/quoted-media";
import {
  fixRecordedWebmDuration,
  pauseRecordingDurationClock,
  recordingDurationMs,
  resumeRecordingDurationClock,
  startRecordingDurationClock,
  type RecordingDurationClock,
} from "@/lib/whatsapp/recording-duration";
import { inboxSlaSnapshot } from "@/lib/whatsapp/inbox-sla";
import { renderWhatsAppMessageTemplate } from "@/lib/whatsapp/message-template";
import {
  hasWhatsAppTextFormatting,
  parseWhatsAppText,
  plainWhatsAppText,
  type WhatsAppTextNode,
} from "@/lib/whatsapp/text-format";
import {
  WHATSAPP_MEDIA_MAX_BATCH_FILES,
  WHATSAPP_MEDIA_MAX_FILE_BYTES,
} from "@/lib/whatsapp/media-constraints";
import {
  getEvaluationScheduleUnitConfigByUnit,
  isEvaluationScheduleInstanceId,
} from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  Send,
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
  Pause,
  MoreVertical,
  Building2,
  Megaphone,
  CalendarDays,
  Download,
  Plus,
  AlertTriangle,
  Link2,
  UploadCloud,
  Archive,
  ArchiveRestore,
  Ban,
  MessageSquareText,
  ListChecks,
  Smile,
  Volume2,
  VolumeX,
  Clock3,
  Video,
} from "lucide-react";
import {
  isWhatsAppFollowUpDue,
  whatsAppFollowUpInputFromDate,
  whatsAppFollowUpShortcutInput,
  type WhatsAppFollowUpShortcut,
} from "@/lib/whatsapp/follow-ups";

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
  accessRole?: "OWNER" | "MANAGER" | "AGENT" | "VIEWER" | "ADMIN";
  canReply?: boolean;
  canManage?: boolean;
  canReconnect?: boolean;
  isShared?: boolean;
}

type InstanceChannel = "whatsapp" | "instagram";

const MAX_BULK_FOLLOW_UP_CONVERSATIONS = 10;
const BULK_FOLLOW_UP_SEND_INTERVAL_MS = 1000;
const BULK_FOLLOW_UP_MEDIA_SEND_INTERVAL_MS = 2000;
const CALLBACK_MAX_TEAM_ATTEMPTS = 6;
const MESSAGE_LOAD_RETRY_DELAYS_MS = [350, 1000] as const;

type InboxTab = "all" | "open" | "unread" | "closed" | "archived" | "callback" | "followup" | "lost";

function inboxTabFromSearchParams(searchParams: { get(name: string): string | null }): InboxTab {
  if (searchParams.get("archived") === "1") return "archived";
  const queue = searchParams.get("queue");
  return ["callback", "followup", "lost", "unread", "open"].includes(queue || "")
    ? queue as InboxTab
    : "all";
}

function serverConversationStatusForTab(tab: InboxTab) {
  return ["open", "unread", "callback", "followup", "lost"].includes(tab) ? tab : "all";
}

interface BulkFollowUpProgress {
  total: number;
  completed: number;
  sent: number;
  failed: number;
}

type EvaluationConfirmationAvailability = {
  visible: boolean;
  alreadySent: boolean;
  reason?: string;
  appointmentId?: string;
  startTime?: string;
  eligibleAt?: string;
  windowHours?: number;
};

type CallbackTrackingSnapshot = {
  updatedAt?: string | null;
  lastOutboundAt?: string | null;
  callbackDueAt?: string | null;
  callbackTrackingStartedAt?: string | null;
  callbackStreakCount?: number;
  callbackTotalCount?: number;
  attemptCounted?: boolean;
};

interface ConversationListAnchor {
  conversationId: string;
  offsetTop: number;
  expiresAt: number;
}

interface InternalNoteMention {
  userId: string;
  name: string;
}

interface InternalNote {
  id: string;
  content: string;
  mentions?: InternalNoteMention[] | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

interface MentionableUser {
  id: string;
  name: string;
}

type MessageLoadResult =
  | { status: "applied" }
  | { status: "superseded" }
  | { status: "error"; error: string };

function waitForBulkFollowUpInterval(hasMedia = false) {
  const interval = hasMedia ? BULK_FOLLOW_UP_MEDIA_SEND_INTERVAL_MS : BULK_FOLLOW_UP_SEND_INTERVAL_MS;
  return new Promise((resolve) => window.setTimeout(resolve, interval));
}

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

function isLidPlaceholderContact(contact: Pick<Contact, "name" | "phone">) {
  const phone = (contact.phone || "").trim();
  const name = (contact.name || "").trim();
  return phone.startsWith("lid:") || (/^\d{14,15}$/.test(phone) && (!name || name === phone));
}

function displayContactName(contact: Pick<Contact, "name" | "phone">) {
  return isLidPlaceholderContact(contact)
    ? "Contato sem número"
    : contact.name?.trim() || contact.phone || "Sem nome";
}

function isConversationCallbackDue(conversation: Conversation, now = Date.now()) {
  const dueAt = conversation.callbackDueAt ? new Date(conversation.callbackDueAt).getTime() : Number.POSITIVE_INFINITY;
  return Boolean(
    conversation.callbackTrackingStartedAt
    && dueAt <= now
    && (conversation.callbackStreakCount || 0) < CALLBACK_MAX_TEAM_ATTEMPTS
    && !["closed", "resolved", "lost"].includes(conversation.status),
  );
}

function formatFollowUpSchedule(value?: string | null, now = new Date()) {
  if (!value) return "";
  const date = new Date(value);
  const dateKey = date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const time = date.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (dateKey === todayKey) return `Hoje, ${time}`;
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortConversationsByFollowUpSchedule(conversations: Conversation[]) {
  return [...conversations].sort((a, b) => (
    new Date(a.activeFollowUp?.scheduledAt || 0).getTime()
    - new Date(b.activeFollowUp?.scheduledAt || 0).getTime()
  ));
}

function sortConversationsByCallbackSchedule(conversations: Conversation[]) {
  return [...conversations].sort((a, b) => {
    const dueDifference = new Date(b.callbackDueAt || 0).getTime()
      - new Date(a.callbackDueAt || 0).getTime();
    if (dueDifference !== 0) return dueDifference;
    return (b.id || "").localeCompare(a.id || "");
  });
}

function formatMessageTime(dateString: string) {
  try {
    return new Date(dateString).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatAudioDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function voiceWaveformHeights(seed: string, count = 52) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return Array.from({ length: count }, (_, index) => {
    state = Math.imul(state ^ (index + 1), 2246822519);
    return 7 + Math.abs(state % 19);
  });
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
const ATTACHMENT_DOCUMENT_EXTENSION = /\.(pdf|doc|docx|xls|xlsx)$/i;
const ATTACHMENT_AUDIO_EXTENSION = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i;
const ATTACHMENT_VIDEO_EXTENSION = /\.(m4v|mov|mp4|webm)$/i;

type PendingAttachmentStatus = "ready" | "uploading" | "sending" | "error";

interface PendingAttachment {
  id: string;
  file: File;
  type: "image" | "video" | "audio" | "document";
  previewUrl: string;
  blobUrl?: string;
  progress: number;
  status: PendingAttachmentStatus;
  error?: string;
}

interface ImageBatchAssignment {
  id: string;
  index: number;
  size: number;
}

function createImageBatchAssignments(attachments: PendingAttachment[]) {
  const assignments = new Map<string, ImageBatchAssignment>();
  let index = 0;

  while (index < attachments.length) {
    if (attachments[index].type !== "image") {
      index += 1;
      continue;
    }

    const start = index;
    while (index < attachments.length && attachments[index].type === "image") index += 1;
    const size = index - start;
    if (size < 2) continue;

    const id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    for (let batchIndex = 0; batchIndex < size; batchIndex += 1) {
      assignments.set(attachments[start + batchIndex].id, { id, index: batchIndex, size });
    }
  }

  return assignments;
}

function visibleMediaBody(message: Message) {
  const body = (message.body || "").trim();
  const syntheticLabels: Partial<Record<Message["type"], string[]>> = {
    image: ["📷 Imagem"],
    video: ["🎬 Vídeo"],
    audio: ["🎤 Áudio"],
    ptt: ["🎤 Áudio"],
    document: ["📄 Documento"],
    sticker: ["🏷️ Sticker"],
  };
  if (syntheticLabels[message.type]?.includes(body)) return "";
  return body;
}

function attachmentKind(file: File) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (ATTACHMENT_VIDEO_EXTENSION.test(file.name)) return "video";
  if (ATTACHMENT_AUDIO_EXTENSION.test(file.name)) return "audio";
  if (file.type === "application/pdf" || ATTACHMENT_DOCUMENT_EXTENSION.test(file.name)) return "document";
  return null;
}

function attachmentMessageType(attachment: PendingAttachment) {
  return attachment.type === "audio" ? "ptt" : attachment.type;
}

function audioFilesFromClipboard(clipboardData: DataTransfer) {
  const candidates = [
    ...Array.from(clipboardData.files || []),
    ...Array.from(clipboardData.items || [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file)),
  ];
  const uniqueFiles = new Map<string, File>();

  candidates.forEach((file) => {
    if (attachmentKind(file) !== "audio") return;
    const key = `${file.name}|${file.type}|${file.size}|${file.lastModified}`;
    if (!uniqueFiles.has(key)) uniqueFiles.set(key, file);
  });

  return Array.from(uniqueFiles.values());
}

function formatAttachmentSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeAttachmentPathName(fileName: string) {
  const clean = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "arquivo";
}

function createAttachmentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `attachment_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function messageActionState(msg: Message) {
  const age = Date.now() - new Date(msg.timestamp).getTime();
  const isPersisted = !!msg.messageId && !msg.id.startsWith("temp_");
  const canEdit = !msg.readOnly && isPersisted && msg.fromMe && msg.type === "text" && msg.status !== "deleted" && age <= MESSAGE_EDIT_WINDOW_MS;
  const canDelete = !msg.readOnly && isPersisted && msg.fromMe && msg.status !== "deleted" && age <= MESSAGE_DELETE_WINDOW_MS;
  return { canEdit, canDelete };
}

function messageReplyPreview(msg: Message) {
  const body = plainWhatsAppText(msg.body).trim();
  if (body) return body.length > 140 ? `${body.slice(0, 140)}...` : body;
  if (msg.type === "image") return "Imagem";
  if (msg.type === "audio" || msg.type === "ptt") return "Áudio";
  if (msg.type === "video") return "Vídeo";
  if (msg.type === "document") return msg.mediaFileName || "Documento";
  return "Mensagem";
}

function quotedMessageLabel(msg: Message, contactLabel?: string | null) {
  if (msg.quotedMessageFromMe === true) return "Você";
  if (msg.quotedMessageFromMe === false) return contactLabel?.trim() || "Contato";
  return "Mensagem citada";
}

function quotedMessageBody(msg: Message) {
  const body = plainWhatsAppText(msg.quotedMessageBody).trim();
  if (body) return body.length > 180 ? `${body.slice(0, 180)}...` : body;
  if (msg.quotedMessageType === "image") return "Imagem";
  if (msg.quotedMessageType === "audio" || msg.quotedMessageType === "ptt") return "Áudio";
  if (msg.quotedMessageType === "video") return "Vídeo";
  if (msg.quotedMessageType === "document") return "Documento";
  return "Mensagem";
}

function messageDomId(visibleItemId: string) {
  return `inbox-message-${visibleItemId}`;
}

function findVisibleMessageItemByProviderId(
  items: ReturnType<typeof buildVisibleMessageItems>,
  providerMessageId: string,
) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "album") {
      if (item.images.some((message) => message.messageId === providerMessageId)) return item;
      continue;
    }
    if (item.message.messageId === providerMessageId) return item;
  }
  return null;
}

function renderWhatsAppTextNodes(nodes: WhatsAppTextNode[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return node.value;
    if (node.type === "code") {
      return <code key={key} className="rounded bg-black/10 px-1 font-mono text-[0.92em] dark:bg-white/10">{node.value}</code>;
    }

    const children = renderWhatsAppTextNodes(node.children, key);
    if (node.type === "bold") return <strong key={key} className="font-semibold">{children}</strong>;
    if (node.type === "italic") return <em key={key}>{children}</em>;
    return <s key={key}>{children}</s>;
  });
}

const WhatsAppFormattedText = React.memo(function WhatsAppFormattedText({ text, id }: { text: string; id: string }) {
  const nodes = useMemo(() => parseWhatsAppText(text), [text]);
  return <>{renderWhatsAppTextNodes(nodes, id)}</>;
});

function getInstanceDisplayLabel(instance: CollaboratorInstance | null) {
  if (!instance) return "Meu Inbox";
  return instance.displayName?.trim() || instance.userName || "Instância";
}

function getInstanceChannel(instance?: CollaboratorInstance | null): InstanceChannel {
  return instance?.channel === "instagram" ? "instagram" : "whatsapp";
}

function getInstanceConnectionPresentation(status?: string | null) {
  const normalizedStatus = String(status || "disconnected").toLowerCase();
  if (["connected", "open", "connection.open"].includes(normalizedStatus)) {
    return {
      label: "Conectado",
      historyLabel: "Conectado",
      dotClassName: "bg-emerald-500",
    };
  }
  if (["connecting", "qrcode", "qr", "pairing"].includes(normalizedStatus)) {
    return {
      label: "Conectando",
      historyLabel: "Conectando",
      dotClassName: "bg-amber-500",
    };
  }
  return {
    label: "Desconectado",
    historyLabel: "Desconectado · histórico disponível",
    dotClassName: "bg-red-500",
  };
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
  const initial = displayContactName(contact).charAt(0).toUpperCase() || "?";
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

function PipelineStageSelector({
  contactPhone,
  contactName,
  unit,
  whatsappConversationId,
  whatsappInstanceId,
  layout = "sidebar",
  refreshTrigger,
  showFallback,
  openEvolutionSignal,
  onPipelineChanged,
}: {
  contactPhone: string;
  contactName?: string;
  unit?: string | null;
  whatsappConversationId?: string | null;
  whatsappInstanceId?: string | null;
  layout?: "sidebar" | "header" | "headerPill" | "inline";
  refreshTrigger?: number;
  showFallback?: boolean;
  openEvolutionSignal?: number;
  onPipelineChanged?: () => void;
}) {
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
  const pipelineMutationUrl = useMemo(() => {
    if (!whatsappInstanceId) return "/api/pipeline";
    const params = new URLSearchParams({ targetInstanceId: whatsappInstanceId });
    if (effectiveUnit) params.set("unit", effectiveUnit);
    return `/api/pipeline?${params.toString()}`;
  }, [effectiveUnit, whatsappInstanceId]);
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
          if (whatsappInstanceId) dealParams.set("targetInstanceId", whatsappInstanceId);
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
  }, [contactPhone, refreshTrigger, unit, whatsappInstanceId]);

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

        const res = await fetch(pipelineMutationUrl, {
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
                  whatsappConversationId,
                  whatsappInstanceId,
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
          onPipelineChanged?.();
          if (data.scheduleConfirmation?.status === "sent") {
            toast("Agendamento salvo e confirmação enviada!", "success");
          } else if (data.rescheduleNotification?.status === "sent") {
            toast("Avaliação reagendada e cliente avisada!", "success");
          } else if (data.rescheduleNotification?.status === "failed") {
            toast("Avaliação reagendada, mas a mensagem automática não pôde ser enviada.", "warning", 5500);
          } else if (data.scheduleConfirmation?.status === "failed") {
            toast("Agendamento salvo, mas não foi possível confirmar o envio automático.", "warning", 5500);
          } else {
            toast("Adicionado ao funil!", "success");
          }
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
      const res = await fetch(pipelineMutationUrl, {
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
                contactPhone,
                whatsappConversationId,
                whatsappInstanceId,
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
        onPipelineChanged?.();
        if (data.scheduleConfirmation?.status === "sent") {
          toast("Agendamento salvo e confirmação enviada!", "success");
        } else if (data.rescheduleNotification?.status === "sent") {
          toast("Avaliação reagendada e cliente avisada!", "success");
        } else if (data.rescheduleNotification?.status === "failed") {
          toast("Avaliação reagendada, mas a mensagem automática não pôde ser enviada.", "warning", 5500);
        } else if (data.scheduleConfirmation?.status === "failed") {
          toast("Agendamento salvo, mas não foi possível confirmar o envio automático.", "warning", 5500);
        } else {
          toast("Fase atualizada!", "success");
        }
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
    if (!scheduleAssigneeUserId) {
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
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-foreground">Data</label>
              <DatePicker
                value={scheduleDate}
                onChange={(value) => {
                  setScheduleDate(value);
                  setScheduleConflict(null);
                }}
                variant="input"
                calendarSize="small"
                placeholder="Data da avaliação"
              />
            </div>
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
            <p className="text-xs text-muted-foreground">
              A lista mostra apenas pessoas da unidade selecionada.
            </p>
          </div>
          {scheduleConflict && (
            <div role="alert" className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-800 dark:text-amber-400" />
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
  unit,
  onClose,
  pipelineRefreshKey,
  profilePicUrl,
  refreshProfilePicUrl,
  onProfilePicResolved,
  onRenameContact,
  onPipelineChanged,
}: {
  conversation: Conversation;
  unit?: string | null;
  onClose: () => void;
  pipelineRefreshKey: number;
  profilePicUrl?: string;
  refreshProfilePicUrl?: string;
  onProfilePicResolved?: (phone: string, url: string) => void;
  onRenameContact: (conversationId: string, name: string) => Promise<Contact>;
  onPipelineChanged?: () => void;
}) {
  const { contact } = conversation;
  const operationalUnit = unit || contact.unit || "";
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(contact.name || contact.phone);
  const [savingName, setSavingName] = useState(false);
  const tags: string[] = Array.isArray(contact.tags)
    ? contact.tags
    : typeof contact.tags === "string"
    ? contact.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
    : [];

  const statusMap: Record<string, { label: string; color: string }> = {
    open: { label: "Em aberto", color: "text-emerald-700 dark:text-emerald-400" },
    resolved: { label: "Resolvido", color: "text-blue-700 dark:text-blue-400" },
    closed: { label: "Fechado", color: "text-muted-foreground" },
    waiting_customer: { label: "Aguardando cliente", color: "text-amber-800 dark:text-amber-400" },
    waiting_response: { label: "Aguardando resposta", color: "text-orange-700 dark:text-orange-400" },
    lost: { label: "Perdido", color: "text-red-700 dark:text-red-400" },
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
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : conversation.status === "lost"
              ? "bg-red-500/10 text-red-700 dark:text-red-400"
            : "bg-muted text-muted-foreground"
        }`}>
          <Circle className="h-1.5 w-1.5 fill-current" />
          {statusInfo.label}
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
          {operationalUnit && (
            <div className="flex items-center gap-3">
              <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-foreground">{operationalUnit}</span>
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
            unit={operationalUnit}
          />
        </div>

        {/* ── Funil & Observações ── */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">Funil & Observações</p>
          <PipelineStageSelector
            contactPhone={contact.phone}
            contactName={contact.name || undefined}
            unit={operationalUnit}
            whatsappConversationId={conversation.id}
            whatsappInstanceId={conversation.instanceId}
            layout="sidebar"
            refreshTrigger={pipelineRefreshKey}
            showFallback
            onPipelineChanged={onPipelineChanged}
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
            {conversation.callbackTrackingStartedAt && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Contatos no ciclo</span>
                  <span className="font-semibold text-foreground">
                    {Math.min((conversation.callbackStreakCount || 0) + 1, 7)}/7
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Rechamadas no histórico</span>
                  <span className="font-semibold text-foreground">{conversation.callbackTotalCount || 0}</span>
                </div>
                {conversation.callbackDueAt && conversation.status !== "lost" && (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {isConversationCallbackDue(conversation) ? "Rechamada pendente" : "Nova checagem"}
                    </span>
                    <span className={`text-right font-medium ${isConversationCallbackDue(conversation) ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>
                      {new Date(conversation.callbackDueAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
              </>
            )}
            {conversation.activeFollowUp && (
              <div className={`rounded-xl border px-3 py-2.5 ${
                isWhatsAppFollowUpDue(conversation.activeFollowUp)
                  ? "border-red-500/30 bg-red-500/10"
                  : "border-indigo-500/25 bg-indigo-500/10"
              }`}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-foreground">
                    {isWhatsAppFollowUpDue(conversation.activeFollowUp) ? "Retorno pendente" : "Retorno agendado"}
                  </span>
                  <span className="text-right font-medium text-foreground">
                    {formatFollowUpSchedule(conversation.activeFollowUp.scheduledAt)}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                  {conversation.activeFollowUp.note}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Responsável: {conversation.activeFollowUp.assignedToName}
                </p>
              </div>
            )}
          </div>
        </div>



      </div>
    </div>
  );
}

function MessageTimestamp({
  msg,
  isMe,
  className = "",
}: {
  msg: Message;
  isMe: boolean;
  className?: string;
}) {
  return (
    <div className={`flex shrink-0 items-center justify-end gap-0.5 ${isMe ? "inbox-message-timestamp-outgoing" : "inbox-message-timestamp-incoming"} ${className}`}>
      <span className="text-[10px] font-normal leading-none">{formatMessageTime(msg.timestamp)}</span>
      {isMe && (
        msg.status === "read" ? (
          <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
        ) : msg.status === "delivered" ? (
          <CheckCheck className="h-3.5 w-3.5 opacity-90" />
        ) : (
          <Check className="h-3.5 w-3.5 opacity-90" />
        )
      )}
    </div>
  );
}

function VoiceMessagePlayer({
  msg,
  isMe,
  avatarContact,
  avatarFetchUrl,
  onPlaybackChange,
}: {
  msg: Message;
  isMe: boolean;
  avatarContact: Contact;
  avatarFetchUrl?: string;
  onPlaybackChange: (messageId: string, isPlaying: boolean) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const waveform = useMemo(
    () => voiceWaveformHeights(msg.messageId || msg.id || msg.mediaUrl || "audio"),
    [msg.id, msg.mediaUrl, msg.messageId],
  );
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  useEffect(() => () => {
    onPlaybackChange(msg.id, false);
  }, [msg.id, onPlaybackChange]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    audio.pause();
  };

  const seekAudio = (event: React.MouseEvent<HTMLButtonElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextProgress = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    audio.currentTime = duration * nextProgress;
    setCurrentTime(audio.currentTime);
  };

  return (
    <div className="flex w-[min(74vw,360px)] min-w-[250px] items-center gap-2.5 pb-4 pt-0.5 sm:min-w-[300px]">
      <div className="relative shrink-0">
        <ContactAvatar
          contact={avatarContact}
          sizeClassName="h-11 w-11"
          textClassName="text-sm ring-1 ring-black/15"
          fetchUrl={avatarFetchUrl}
        />
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#00a884] text-white ring-2"
          style={{ "--tw-ring-color": "var(--inbox-message-bubble-color)" } as React.CSSProperties}
        >
          <Mic className="h-2.5 w-2.5" />
        </span>
      </div>

      <button
        type="button"
        onClick={() => void togglePlayback()}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          isMe
            ? "text-[#54656f] hover:bg-black/10 dark:text-[#e9edef] dark:hover:bg-white/10"
            : "text-[#8696a0] hover:bg-black/10 dark:text-[#d1d7db] dark:hover:bg-white/10"
        }`}
        aria-label={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
      >
        {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={seekAudio}
          className="flex h-8 w-full items-center gap-[2px] overflow-hidden"
          aria-label="Avançar ou retroceder áudio"
        >
          {waveform.map((height, index) => (
            <span
              key={`${msg.id}-wave-${index}`}
              className={`w-[3px] min-w-[2px] flex-1 rounded-full transition-colors ${
                index / waveform.length <= progress
                  ? "bg-[#53bdeb]"
                  : isMe
                    ? "bg-[#8cc8bb]/70"
                    : "bg-[#8696a0]/65"
              }`}
              style={{ height }}
            />
          ))}
        </button>
        <span className={`mt-0.5 block text-[11px] leading-none ${isMe ? "text-[#54656f] dark:text-[#b7d5cd]" : "text-[#667781] dark:text-[#8696a0]"}`}>
          {formatAudioDuration(isPlaying || currentTime > 0 ? currentTime : duration)}
        </span>
      </div>

      <audio
        ref={audioRef}
        preload="metadata"
        src={msg.mediaUrl || undefined}
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => {
          setIsPlaying(true);
          onPlaybackChange(msg.id, true);
        }}
        onPause={() => {
          setIsPlaying(false);
          onPlaybackChange(msg.id, false);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          onPlaybackChange(msg.id, false);
        }}
        onError={() => onPlaybackChange(msg.id, false)}
        className="hidden"
      />
    </div>
  );
}

function linkPreviewHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value;
  }
}

function WhatsAppLinkPreviewCard({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const url = msg.linkPreviewUrl;
  if (!url) return null;

  const showImage = Boolean(msg.linkPreviewThumbnailUrl && !imageFailed);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={`mb-1 block w-full overflow-hidden rounded-[7px] text-left transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] ${
        isMe ? "bg-black/[0.07] dark:bg-black/20" : "bg-black/[0.06] dark:bg-black/25"
      }`}
      aria-label={`Abrir prévia de ${msg.linkPreviewTitle || linkPreviewHostname(url)}`}
    >
      {showImage && (
        <img
          src={msg.linkPreviewThumbnailUrl || undefined}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="aspect-[1.91/1] max-h-[188px] w-full bg-black/10 object-cover"
        />
      )}
      <span className="block min-w-0 px-2.5 py-2">
        {msg.linkPreviewTitle && (
          <span className="line-clamp-2 block break-words text-[13px] font-semibold leading-snug">
            {msg.linkPreviewTitle}
          </span>
        )}
        {msg.linkPreviewDescription && (
          <span className={`mt-0.5 line-clamp-2 block break-words text-[11.5px] leading-snug ${
            isMe ? "text-[#54656f] dark:text-[#d1e3df]" : "text-muted-foreground"
          }`}>
            {msg.linkPreviewDescription}
          </span>
        )}
        <span className={`mt-1 flex min-w-0 items-center gap-1 text-[10.5px] ${
          isMe ? "text-[#667781] dark:text-[#c7d8d4]" : "text-muted-foreground"
        }`}>
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{linkPreviewHostname(url)}</span>
        </span>
      </span>
    </a>
  );
}

// ─── Message Bubble ───────────────────────────────────────────
function MessageBubble({
  msg,
  albumImages,
  canReact,
  onReply,
  onReact,
  onCopy,
  onEdit,
  onDelete,
  onOpenImage,
  onOpenDocument,
  onQuotedMessageClick,
  showTail,
  audioAvatarContact,
  audioAvatarFetchUrl,
  onAudioPlaybackChange,
  quotedContactLabel,
  mediaInstanceId,
  domId,
  isHighlighted,
}: {
  msg: Message;
  albumImages?: Message[];
  canReact: boolean;
  onReply: (msg: Message) => void;
  onReact: (msg: Message, reaction: string) => void;
  onCopy: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  onOpenImage: (src: string, gallery?: string[]) => void;
  onOpenDocument: (msg: Message) => void;
  onQuotedMessageClick: (quotedMessageId: string) => void;
  showTail: boolean;
  audioAvatarContact: Contact;
  audioAvatarFetchUrl?: string;
  onAudioPlaybackChange: (messageId: string, isPlaying: boolean) => void;
  quotedContactLabel?: string | null;
  mediaInstanceId?: string;
  domId: string;
  isHighlighted: boolean;
}) {
  const isMe = msg.fromMe;
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [loadDeferredMedia, setLoadDeferredMedia] = useState(false);
  const [deferredMediaFailed, setDeferredMediaFailed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPopupRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const swipeGestureRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    axis: "pending" | "horizontal" | "vertical";
    offset: number;
  }>({ pointerId: null, startX: 0, startY: 0, axis: "pending", offset: 0 });
  const suppressClickUntilRef = useRef(0);
  const { canEdit, canDelete } = messageActionState(msg);
  const isDeleted = msg.status === "deleted";
  const deferredMediaUrl = loadDeferredMedia && msg.mediaPayloadOmitted
    ? whatsappDeferredMediaUrl(msg.id, mediaInstanceId)
    : null;
  const renderedMessage = deferredMediaUrl ? { ...msg, mediaUrl: deferredMediaUrl } : msg;
  const renderedMediaUrl = renderedMessage.mediaUrl;
  const isMediaMessage = Boolean(
    renderedMediaUrl && (msg.type === "image" || renderedMediaUrl.startsWith("data:image/")),
  );
  const isVideoMessage = msg.type === "video" && Boolean(renderedMediaUrl);
  const isAlbumMessage = Boolean(albumImages && albumImages.length >= 2);
  const hasVisualMedia = isMediaMessage || isVideoMessage || isAlbumMessage;
  const hasLinkPreview = Boolean(
    !isDeleted &&
    msg.linkPreviewUrl &&
    (msg.linkPreviewTitle || msg.linkPreviewDescription || msg.linkPreviewThumbnailUrl),
  );
  const hasRichContent = hasVisualMedia || hasLinkPreview;
  const isAudioMessage = (msg.type === "audio" || msg.type === "ptt") && Boolean(renderedMediaUrl);
  const documentMeta = msg.type === "document" && renderedMediaUrl
    ? documentMessageMeta(renderedMessage)
    : null;
  const hasQuotedMessage = Boolean(msg.quotedMessageId && msg.status !== "deleted");
  const albumSources = albumImages?.flatMap((image) => image.mediaUrl ? [image.mediaUrl] : []) || [];
  const visibleBody = isAlbumMessage
    ? albumImages?.map(visibleMediaBody).find(Boolean) || ""
    : visibleMediaBody(msg);
  const canReply = Boolean(msg.messageId && msg.status !== "deleted" && !msg.readOnly);
  const reactionEnabled = canReact && canReply;
  const reactionSummaries = useMemo(() => {
    const reactions = (albumImages?.length ? albumImages : [msg]).flatMap((message) => [
      ...(message.contactReaction ? [{ emoji: message.contactReaction, actor: "Cliente" }] : []),
      ...(message.ownReaction ? [{ emoji: message.ownReaction, actor: "Clínica" }] : []),
    ]);
    const grouped = new Map<string, { emoji: string; count: number; actors: Set<string> }>();

    for (const reaction of reactions) {
      const current = grouped.get(reaction.emoji) || {
        emoji: reaction.emoji,
        count: 0,
        actors: new Set<string>(),
      };
      current.count += 1;
      current.actors.add(reaction.actor);
      grouped.set(reaction.emoji, current);
    }

    return [...grouped.values()].map((reaction) => ({
      emoji: reaction.emoji,
      count: reaction.count,
      label: [...reaction.actors].join(" e "),
    }));
  }, [albumImages, msg]);

  const menuButtonClass = "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors";

  const updateMenuPosition = useCallback(() => {
    const trigger = menuButtonRef.current;
    if (!trigger) return;

    const bounds = trigger.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportLeft = visualViewport?.offsetLeft || 0;
    const viewportTop = visualViewport?.offsetTop || 0;
    const viewportWidth = visualViewport?.width || window.innerWidth;
    const viewportHeight = visualViewport?.height || window.innerHeight;
    const menuWidth = 168;
    const menuHeight = 182;
    const gap = 6;
    const margin = 8;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const fitsBelow = bounds.bottom + gap + menuHeight <= viewportBottom - margin;
    const top = fitsBelow
      ? bounds.bottom + gap
      : Math.max(viewportTop + margin, bounds.top - gap - menuHeight);
    const left = Math.min(
      Math.max(viewportLeft + margin, bounds.right - menuWidth),
      viewportRight - menuWidth - margin,
    );

    setMenuPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (!menuButtonRef.current?.contains(target) && !menuPopupRef.current?.contains(target)) {
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

  useLayoutEffect(() => {
    if (!menuOpen) return;

    updateMenuPosition();
    const visualViewport = window.visualViewport;
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    visualViewport?.addEventListener("resize", updateMenuPosition);
    visualViewport?.addEventListener("scroll", updateMenuPosition);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      visualViewport?.removeEventListener("resize", updateMenuPosition);
      visualViewport?.removeEventListener("scroll", updateMenuPosition);
    };
  }, [menuOpen, updateMenuPosition]);

  const resetSwipe = useCallback(() => {
    swipeGestureRef.current = { pointerId: null, startX: 0, startY: 0, axis: "pending", offset: 0 };
    setIsSwiping(false);
    setSwipeOffset(0);
  }, []);

  const handleSwipePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canReply || menuOpen || event.pointerType === "mouse" || !event.isPrimary) return;

    swipeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: "pending",
      offset: 0,
    };
  };

  const handleSwipePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = swipeGestureRef.current;
    if (gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (gesture.axis === "pending") {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
      gesture.axis = deltaX > 0 && Math.abs(deltaX) > Math.abs(deltaY)
        ? "horizontal"
        : "vertical";
      if (gesture.axis === "horizontal") {
        setIsSwiping(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    if (gesture.axis !== "horizontal") return;
    event.preventDefault();
    const nextOffset = Math.min(82, Math.max(0, deltaX * 0.78));
    gesture.offset = nextOffset;
    setSwipeOffset(nextOffset);
  };

  const handleSwipePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = swipeGestureRef.current;
    if (gesture.pointerId !== event.pointerId) return;

    const shouldReply = gesture.axis === "horizontal" && gesture.offset >= 52;
    if (gesture.axis === "horizontal") {
      suppressClickUntilRef.current = Date.now() + 350;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetSwipe();
    if (shouldReply) onReply(msg);
  };

  const handleSwipeClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() >= suppressClickUntilRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickUntilRef.current = 0;
  };

  return (
    <div id={domId} className={`relative flex w-full scroll-m-20 ${showTail ? "mt-1.5" : "mt-[2px]"} ${menuOpen || reactionPickerOpen ? "z-50" : "z-0"} ${isMe ? "justify-end" : "justify-start"}`}>
      <div className={`relative flex max-w-[88%] flex-col sm:max-w-[72%] lg:max-w-[65%] xl:max-w-[min(60%,760px)] ${isMe ? "items-end" : "items-start"}`}>
        {canReply && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#00a884] text-white shadow-md"
            style={{
              opacity: Math.min(1, swipeOffset / 38),
              transform: `translateY(-50%) scale(${0.72 + Math.min(1, swipeOffset / 52) * 0.28})`,
            }}
          >
            <Reply className="h-4 w-4" />
          </span>
        )}
        <div
          onPointerDown={handleSwipePointerDown}
          onPointerMove={handleSwipePointerMove}
          onPointerUp={handleSwipePointerEnd}
          onPointerCancel={resetSwipe}
          onClickCapture={handleSwipeClickCapture}
          style={{ transform: `translate3d(${swipeOffset}px, 0, 0)` }}
          className={`inbox-message-bubble group relative flex w-fit touch-pan-y flex-col overflow-visible rounded-lg text-[14.5px] leading-[1.35] shadow-[0_1px_1px_rgba(0,0,0,0.16)] transition-[box-shadow,transform] duration-300 will-change-transform sm:text-[14px] ${isSwiping ? "" : "ease-out"} ${
            isMe
              ? `inbox-message-outgoing ml-auto ${showTail ? "inbox-message-tail-outgoing rounded-tr-[3px]" : ""}`
              : `inbox-message-incoming ${showTail ? "inbox-message-tail-incoming rounded-tl-[3px]" : ""}`
          } ${isHighlighted ? "ring-2 ring-[#00a884] ring-offset-4 ring-offset-transparent shadow-[0_0_0_7px_rgba(0,168,132,0.20)]" : ""} ${hasQuotedMessage ? "min-w-48 sm:min-w-52" : ""} ${
            isAlbumMessage
              ? "w-[min(82vw,360px)] p-[3px] pb-5 sm:w-[min(42vw,360px)]"
              : hasLinkPreview
                ? "w-[min(82vw,360px)] p-[3px] pb-5 sm:w-[min(42vw,360px)]"
                : hasVisualMedia
                  ? "max-w-[min(82vw,360px)] items-start p-[3px] pb-5 sm:max-w-[min(42vw,360px)]"
                  : isAudioMessage
                    ? "max-w-full px-2.5 pb-1 pt-2"
                    : documentMeta
                      ? "max-w-full p-1.5 pb-5"
                      : "max-w-full px-2.5 pb-1.5 pt-1.5"
          }`}
        >
          <div
            className={`absolute right-1 top-1 z-20 opacity-0 transition-opacity group-hover:opacity-100 ${menuOpen ? "opacity-100" : ""}`}
          >
            <button
              ref={menuButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!menuOpen) updateMenuPosition();
                setReactionPickerOpen(false);
                setMenuOpen((v) => !v);
              }}
              className={`flex h-6 w-6 items-center justify-center rounded-full backdrop-blur transition-colors ${
                isMe
                  ? "bg-black/5 text-[#54656f] hover:bg-black/10 hover:text-[#111b21] dark:bg-white/10 dark:text-[#e9edef]/85 dark:hover:bg-white/20 dark:hover:text-[#e9edef]"
                  : "bg-background/50 text-muted-foreground hover:bg-background/80 hover:text-foreground"
              }`}
              aria-label="Opções da mensagem"
              aria-expanded={menuOpen}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            {menuOpen && createPortal(
              <div
                ref={menuPopupRef}
                role="menu"
                style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, width: 168 }}
                className="z-[100] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canReply}
                  onClick={(e) => { e.stopPropagation(); if (canReply) onReply(msg); setMenuOpen(false); }}
                  className={`${menuButtonClass} ${canReply ? "hover:bg-muted" : "cursor-not-allowed opacity-40"}`}
                >
                  <Reply className="h-3.5 w-3.5" />
                  Responder
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!reactionEnabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    if (reactionEnabled) setReactionPickerOpen(true);
                  }}
                  className={`${menuButtonClass} ${reactionEnabled ? "hover:bg-muted" : "cursor-not-allowed opacity-40"}`}
                >
                  <Smile className="h-3.5 w-3.5" />
                  Reagir
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); onCopy(msg); setMenuOpen(false); }}
                  className={`${menuButtonClass} hover:bg-muted`}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar
                </button>
                <button
                  type="button"
                  role="menuitem"
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
                  role="menuitem"
                  disabled={!canDelete}
                  onClick={(e) => { e.stopPropagation(); if (canDelete) onDelete(msg); setMenuOpen(false); }}
                  className={`${menuButtonClass} ${canDelete ? "text-destructive hover:bg-destructive/10" : "cursor-not-allowed text-muted-foreground opacity-40"}`}
                  title={canDelete ? "Apagar para todos" : "Tempo para apagar expirou"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Apagar
                </button>
              </div>,
              document.body,
            )}
          </div>

          {reactionPickerOpen && (
            <ReactionPicker
              open
              anchorRef={menuButtonRef}
              currentReaction={msg.ownReaction}
              onClose={() => setReactionPickerOpen(false)}
              onSelect={(reaction) => onReact(msg, reaction)}
            />
          )}

          {hasQuotedMessage && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (msg.quotedMessageId) onQuotedMessageClick(msg.quotedMessageId);
              }}
              aria-label={`Ir para a mensagem original: ${quotedMessageBody(msg)}`}
              className={`mb-1.5 flex max-w-full cursor-pointer overflow-hidden rounded-md text-left outline-none transition-[filter,box-shadow] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:ring-offset-1 ${
                isMe ? "bg-black/5 dark:bg-black/15" : "bg-black/10 dark:bg-black/20"
              } ${hasRichContent ? "mx-1.5 mt-1.5 w-[calc(100%_-_0.75rem)]" : "w-full"}`}
            >
              <div className={`w-1 shrink-0 ${isMe ? "bg-[#02765c] dark:bg-[#53bdeb]" : "bg-[#00a884]"}`} />
              <div className="min-w-0 max-w-full px-2.5 py-1.5">
                <div className={`truncate text-[11px] font-semibold ${isMe ? "text-[#02765c] dark:text-[#53bdeb]" : "text-[#007a62] dark:text-[#00a884]"}`}>
                  {quotedMessageLabel(msg, quotedContactLabel)}
                </div>
                <div className={`mt-0.5 line-clamp-2 break-words text-[12px] leading-snug ${isMe ? "text-[#54656f] dark:text-[#d1e3df]" : "text-muted-foreground"}`}>
                  {quotedMessageBody(msg)}
                </div>
              </div>
            </button>
          )}

          {hasLinkPreview && <WhatsAppLinkPreviewCard msg={msg} isMe={isMe} />}

          {isAlbumMessage && albumImages && (
            <div
              className={`grid w-full gap-[3px] overflow-hidden rounded-[7px] bg-black/10 ${
                albumImages.length === 2
                  ? "aspect-[4/3] grid-cols-2"
                  : "aspect-square grid-cols-2 grid-rows-2"
              }`}
            >
              {albumImages.slice(0, 4).map((imageMessage, imageIndex) => {
                const hiddenImageCount = albumImages.length > 4 && imageIndex === 3
                  ? albumImages.length - 4
                  : 0;
                const spansRows = albumImages.length === 3 && imageIndex === 0;

                return (
                  <button
                    key={imageMessage.id}
                    type="button"
                    className={`group/album relative min-h-0 min-w-0 overflow-hidden bg-black/20 ${spansRows ? "row-span-2" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (imageMessage.mediaUrl) {
                        onOpenImage(
                          imageMessage.mediaUrl,
                          albumSources,
                        );
                      }
                    }}
                    aria-label={`Abrir imagem ${imageIndex + 1} de ${albumImages.length}`}
                  >
                    <img
                      src={imageMessage.mediaUrl || undefined}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-200 group-hover/album:scale-[1.015]"
                    />
                    {hiddenImageCount > 0 && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-medium text-white">
                        +{hiddenImageCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Image — aceita type "image" ou data URLs de imagem */}
          {!isAlbumMessage && isMediaMessage && renderedMediaUrl && (
            <img
              src={renderedMediaUrl}
              alt=""
              className="mb-0.5 block h-auto w-auto max-h-[min(52dvh,440px)] max-w-full cursor-pointer rounded-[7px] object-contain"
              onClick={(e) => {
                e.stopPropagation();
                onOpenImage(renderedMediaUrl);
              }}
            />
          )}

          {isVideoMessage && (
            <video
              src={renderedMediaUrl || undefined}
              controls
              preload="metadata"
              onError={() => {
                if (!deferredMediaUrl) return;
                setLoadDeferredMedia(false);
                setDeferredMediaFailed(true);
              }}
              className="mb-0.5 block h-auto w-auto max-h-[min(52dvh,440px)] max-w-full rounded-[7px] bg-black object-contain"
            />
          )}

          {/* Áudio compacto com avatar e waveform no padrão WhatsApp. */}
          {isAudioMessage && (
            <VoiceMessagePlayer
              msg={renderedMessage}
              isMe={isMe}
              avatarContact={audioAvatarContact}
              avatarFetchUrl={audioAvatarFetchUrl}
              onPlaybackChange={onAudioPlaybackChange}
            />
          )}

          {/* Document */}
          {documentMeta && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDocument(renderedMessage);
              }}
              className={`mb-1.5 flex w-[290px] max-w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${
                isMe
                  ? "bg-black/5 hover:bg-black/10 dark:bg-primary-foreground/10 dark:hover:bg-primary-foreground/15"
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
                  isMe ? "text-[#667781] dark:text-primary-foreground/70" : "text-muted-foreground"
                }`}>
                  {[documentMeta.sizeLabel, documentMeta.extension].filter(Boolean).join(" · ")}
                </div>
              </div>
            </button>
          )}

          {msg.mediaPayloadOmitted && !renderedMediaUrl && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setDeferredMediaFailed(false);
                setLoadDeferredMedia(true);
              }}
              className="mb-1 flex min-h-11 max-w-[290px] items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] dark:bg-white/10 dark:hover:bg-white/15"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                {deferredMediaFailed
                  ? "Não foi possível carregar. Toque para tentar novamente."
                  : `Carregar ${msg.type === "video" ? "vídeo" : "mídia"} preservado no histórico.`}
              </span>
            </button>
          )}

          {/* Text */}
          {visibleBody && (
            <div className={`break-words whitespace-pre-wrap ${isDeleted ? "italic opacity-70" : ""} ${hasRichContent ? "px-2 pb-0.5 pt-1" : ""}`}>
              <WhatsAppFormattedText text={visibleBody} id={msg.id} />
              {!hasRichContent && !isAudioMessage && !documentMeta && (
                <span className={`inline-block ${isMe ? "w-[58px]" : "w-[42px]"}`} aria-hidden="true" />
              )}
            </div>
          )}
          <MessageTimestamp
            msg={msg}
            isMe={isMe}
            className="absolute bottom-1 right-2"
          />
        </div>
        {reactionSummaries.length > 0 && (
          <div
            className={`relative z-10 -mt-1 flex max-w-full flex-wrap gap-1 px-2 ${isMe ? "justify-end" : "justify-start"}`}
            aria-label="Reações da mensagem"
          >
            {reactionSummaries.map((reaction) => (
              <span
                key={reaction.emoji}
                title={reaction.label}
                className="inline-flex min-h-6 items-center gap-1 rounded-full border border-border bg-card px-2 text-sm shadow-sm"
              >
                <span aria-hidden="true">{reaction.emoji}</span>
                {reaction.count > 1 && (
                  <span className="text-[10px] font-semibold text-muted-foreground">{reaction.count}</span>
                )}
                <span className="sr-only">{reaction.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Conversation Item ────────────────────────────────────────
function SecondaryMetaAccountBadge() {
  return (
    <span
      className="inline-flex max-w-[8rem] shrink-0 items-center gap-1 rounded-full border border-sky-400/60 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-sky-700 dark:text-sky-300"
      title="Lead identificado pela conta Meta secundária"
    >
      <Link2 className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">Conta secundária</span>
    </span>
  );
}

function ConversationItem({
  conv,
  isActive,
  selectionMode,
  isSelected,
  channel,
  slaClockNow,
  onClick,
  onToggleSelection,
}: {
  conv: Conversation;
  isActive: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  channel: InstanceChannel;
  slaClockNow: number;
  onClick: () => void;
  onToggleSelection: () => void;
}) {
  const isSecondaryMetaAccount = conv.campaignAccountOrigin === "secondary";
  const callbackDue = isConversationCallbackDue(conv);
  const callbackStreakCount = conv.callbackStreakCount || 0;
  const followUpDue = isWhatsAppFollowUpDue(conv.activeFollowUp);
  const sla = inboxSlaSnapshot({
    lastInboundAt: conv.lastInboundAt,
    lastOutboundAt: conv.lastOutboundAt,
    now: new Date(slaClockNow),
  });
  const compactSlaLabel = sla.minutes === null
    ? ""
    : sla.minutes < 1
      ? "agora"
      : sla.minutes < 60
        ? `${sla.minutes}m`
        : `${Math.floor(sla.minutes / 60)}h${sla.minutes % 60 ? ` ${sla.minutes % 60}m` : ""}`;

  return (
    <button
      data-conversation-id={conv.id}
      onClick={selectionMode ? onToggleSelection : onClick}
      aria-pressed={selectionMode ? isSelected : undefined}
      className={`group relative flex w-full items-start gap-3 rounded-xl px-3 py-3.5 text-left transition-all ${
        isSelected
          ? "bg-primary/15 ring-1 ring-inset ring-primary/35"
          : isActive
          ? "bg-primary/12 ring-1 ring-inset ring-primary/15"
          : isSecondaryMetaAccount
            ? "bg-sky-500/[0.035] hover:bg-sky-500/[0.07]"
            : "hover:bg-muted/65"
      }`}
    >
      {isSecondaryMetaAccount && (
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.55)]"
        />
      )}

      {selectionMode && (
        <span
          aria-hidden="true"
          className={`mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-transparent"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      )}

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
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-foreground">
              {displayContactName(conv.contact)}
            </span>
            {isSecondaryMetaAccount && <SecondaryMetaAccountBadge />}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ""}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-[12px] leading-5 text-muted-foreground">
            {plainWhatsAppText(conv.lastMessage) || "Nova conversa"}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Status badges */}
            {sla.state === "waiting" && ["open", "waiting_response"].includes(conv.status) && (
              <span
                className={`inline-flex max-w-[6rem] items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                  sla.level === "overdue"
                    ? "bg-red-500/15 text-red-700 dark:text-red-300"
                    : sla.level === "attention"
                      ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                      : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                }`}
                title={`${sla.label}. Meta de resposta: até 15 minutos.`}
                aria-label={`${sla.label}. ${sla.level === "overdue" ? "SLA atrasado" : "Dentro do SLA"}.`}
              >
                <Clock3 className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{compactSlaLabel}</span>
              </span>
            )}
            {conv.activeFollowUp && (
              <span
                className={`max-w-[8rem] truncate rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                  followUpDue
                    ? "bg-red-500/15 text-red-700 dark:text-red-300"
                    : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                }`}
                title={`${formatFollowUpSchedule(conv.activeFollowUp.scheduledAt)} · ${conv.activeFollowUp.note}`}
              >
                {followUpDue ? "Retorno atrasado" : formatFollowUpSchedule(conv.activeFollowUp.scheduledAt)}
              </span>
            )}
            {(callbackDue || callbackStreakCount > 0) && conv.status !== "lost" && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                  callbackDue
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                    : "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                }`}
                title={`${conv.callbackTotalCount || 0} rechamada(s) no histórico`}
              >
                {callbackDue ? "Rechamada" : "Aguardando"} {callbackStreakCount}/{CALLBACK_MAX_TEAM_ATTEMPTS}
              </span>
            )}
            {conv.status === "lost" && (
              <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 dark:text-red-300">
                Perdido · 6/6
              </span>
            )}
            {conv.status === 'resolved' && (
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">Resolvido</span>
            )}
            {conv.status === 'closed' && (
              <span className="rounded-full bg-gray-500/10 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:text-gray-400">Fechado</span>
            )}
            {conv.status === 'waiting_customer' && (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-400">Aguardando</span>
            )}
            {(conv.status === 'waiting_response' || (!conv.assignedTo && conv.status === 'open')) && (
              <span className="relative flex items-center gap-1 rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-400">
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
  const notificationMutes = useWhatsAppInstanceNotificationMutes();
  const urlUnit = searchParams.get("unit");
  const urlUnitFilter = urlUnit && urlUnit !== "all" && urlUnit !== "Todas" ? urlUnit : "";
  const effectiveUnit = globalUnit || urlUnitFilter;
  const deepLinkConversationId = searchParams.get("conversationId") || "";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const selectedConversationId = selectedConv?.id || null;
  const newMessage = selectedConversationId ? messageDrafts[selectedConversationId] || "" : "";
  const composerHasFormatting = useMemo(
    () => hasWhatsAppTextFormatting(newMessage),
    [newMessage],
  );
  const setNewMessage = useCallback((next: React.SetStateAction<string>) => {
    if (!selectedConversationId) return;

    setMessageDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[selectedConversationId] || "";
      const nextDraft = typeof next === "function" ? next(currentDraft) : next;

      if (!nextDraft) {
        if (!(selectedConversationId in currentDrafts)) return currentDrafts;
        const remainingDrafts = { ...currentDrafts };
        delete remainingDrafts[selectedConversationId];
        return remainingDrafts;
      }

      if (nextDraft === currentDraft) return currentDrafts;
      return { ...currentDrafts, [selectedConversationId]: nextDraft };
    });
  }, [selectedConversationId]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [conversationSearchTooShort, setConversationSearchTooShort] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [activeAttachmentId, setActiveAttachmentId] = useState<string | null>(null);
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);
  const [contactSidebarOpen, setContactSidebarOpen] = useState(false);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [isMarkingUnread, setIsMarkingUnread] = useState(false);
  const [isArchivingConversation, setIsArchivingConversation] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [isUpdatingContactBlock, setIsUpdatingContactBlock] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [isSavingFollowUp, setIsSavingFollowUp] = useState(false);
  const [evoSignal, setEvoSignal] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageLoadError, setMessageLoadError] = useState<string | null>(null);
  const [messageReloadKey, setMessageReloadKey] = useState(0);
  const [highlightedMessageItemId, setHighlightedMessageItemId] = useState<string | null>(null);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [internalNotesOpen, setInternalNotesOpen] = useState(false);
  const [internalNotesLoading, setInternalNotesLoading] = useState(false);
  const [internalNotesError, setInternalNotesError] = useState<string | null>(null);
  const [internalNotesLoadedConversationId, setInternalNotesLoadedConversationId] = useState<string | null>(null);
  const [internalNotesLoadedVersion, setInternalNotesLoadedVersion] = useState<string | null>(null);
  const [internalNoteDraft, setInternalNoteDraft] = useState("");
  const [internalNoteMentionIds, setInternalNoteMentionIds] = useState<string[]>([]);
  const [isSavingInternalNote, setIsSavingInternalNote] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const [nextConversationCursor, setNextConversationCursor] = useState<string | null>(null);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [conversationListLoading, setConversationListLoading] = useState(true);
  const [conversationListError, setConversationListError] = useState<string | null>(null);
  const [slaClockNow, setSlaClockNow] = useState(() => Date.now());
  const [conversationQueueCounts, setConversationQueueCounts] = useState({
    open: 0,
    unread: 0,
    callback: 0,
    followup: 0,
    lost: 0,
  });
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);
  const [showSavedRepliesDialog, setShowSavedRepliesDialog] = useState(false);
  const [showEvaluationAvailabilityDialog, setShowEvaluationAvailabilityDialog] = useState(false);
  const savedRepliesLibrary = useWhatsAppSavedReplies();
  const {
    replies: savedReplies,
    categories: savedReplyCategories,
    loading: savedRepliesLoading,
    load: loadSavedReplies,
  } = savedRepliesLibrary;
  const [savedReplyTrigger, setSavedReplyTrigger] = useState<SavedReplyTrigger | null>(null);
  const [savedReplyActiveIndex, setSavedReplyActiveIndex] = useState(0);
  const [savedRepliesMenuError, setSavedRepliesMenuError] = useState<string | null>(null);
  const [savedReplyDialogTarget, setSavedReplyDialogTarget] = useState<"single" | "bulk">("single");
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [bulkSelectedConversationIds, setBulkSelectedConversationIds] = useState<string[]>([]);
  const [bulkFollowUpDraft, setBulkFollowUpDraft] = useState("");
  const [bulkFollowUpImage, setBulkFollowUpImage] = useState<PendingAttachment | null>(null);
  const [bulkFollowUpComposerOpen, setBulkFollowUpComposerOpen] = useState(false);
  const [isDraggingBulkImage, setIsDraggingBulkImage] = useState(false);
  const [bulkFollowUpSending, setBulkFollowUpSending] = useState(false);
  const [bulkFollowUpProgress, setBulkFollowUpProgress] = useState<BulkFollowUpProgress | null>(null);
  const [bulkFollowUpConfirmOpen, setBulkFollowUpConfirmOpen] = useState(false);

  // ─── Gravação de áudio ─────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingConversationRef = useRef<Conversation | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingDurationClockRef = useRef<RecordingDurationClock>({
    elapsedMs: 0,
    activeSinceMs: null,
  });

  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const messageHighlightTimerRef = useRef<number | null>(null);
  const conversationListViewportRef = useRef<HTMLDivElement>(null);
  const conversationListAnchorRef = useRef<ConversationListAnchor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const attachmentDragDepthRef = useRef(0);
  const attachmentsRef = useRef<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const composerSelectionRef = useRef({ start: 0, end: 0 });
  const conversationsRequestSeqRef = useRef(0);
  const messagesRequestSeqRef = useRef(0);
  const internalNotesRequestSeqRef = useRef(0);
  const internalNotesDialogRef = useRef<HTMLElement>(null);
  const internalNotesTriggerRef = useRef<HTMLButtonElement>(null);
  const internalNoteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationsInFlightScopeRef = useRef<string | null>(null);
  const conversationsLastSyncRef = useRef<string | null>(null);
  const conversationsIncrementalPollsRef = useRef(0);
  const messagesInFlightRequestsRef = useRef<Map<string, Promise<MessageLoadResult>>>(new Map());
  const loadedMessagesConversationIdRef = useRef<string | null>(null);
  const activeScopeRef = useRef("");
  const activeConversationListScopeRef = useRef("");
  const conversationsStateScopeRef = useRef("");
  const skipNextConversationCacheWriteRef = useRef(false);
  const conversationsRef = useRef<Conversation[]>([]);
  const selectedConvRef = useRef<Conversation | null>(null);
  const selectedConversationIdRef = useRef<string | null>(null);
  const activeAudioMessageIdRef = useRef<string | null>(null);
  const dismissedDeepLinkConversationIdRef = useRef<string | null>(null);
  const [tab, setTab] = useState<InboxTab>(() => inboxTabFromSearchParams(searchParams));
  // Filtro por etiqueta (campanha). Vazio = mostra todas.
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const releaseConversationListAnchor = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        conversationListAnchorRef.current = null;
      });
    });
  }, []);

  const captureConversationListAnchor = useCallback((excludedConversationIds: Set<string>) => {
    const viewport = conversationListViewportRef.current;
    if (!viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    const rows = Array.from(viewport.querySelectorAll<HTMLElement>("[data-conversation-id]"));
    const anchorRow = rows.find((row) => {
      const conversationId = row.dataset.conversationId;
      if (!conversationId || excludedConversationIds.has(conversationId)) return false;
      const rowRect = row.getBoundingClientRect();
      return rowRect.bottom > viewportRect.top + 4 && rowRect.top < viewportRect.bottom - 4;
    });

    const conversationId = anchorRow?.dataset.conversationId;
    if (!anchorRow || !conversationId) return;

    conversationListAnchorRef.current = {
      conversationId,
      offsetTop: anchorRow.getBoundingClientRect().top - viewportRect.top,
      expiresAt: Date.now() + 30_000,
    };
  }, []);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const savedReplyMenuOpen = Boolean(savedReplyTrigger);
  const savedReplyMatches = useMemo(
    () => savedReplyTrigger
      ? filterSavedReplies(
          savedReplies,
          savedReplyTrigger.query,
          savedReplyCategories,
          selectedConv?.campaignName,
        )
      : [],
    [savedReplies, savedReplyCategories, savedReplyTrigger, selectedConv?.campaignName],
  );

  useEffect(() => {
    if (!savedReplyMenuOpen) return;
    setSavedRepliesMenuError(null);
    void loadSavedReplies().catch((requestError) => {
      setSavedRepliesMenuError(
        requestError instanceof Error ? requestError.message : "Não foi possível carregar as respostas rápidas.",
      );
    });
  }, [loadSavedReplies, savedReplyMenuOpen]);

  useEffect(() => {
    setSavedReplyActiveIndex(0);
  }, [savedReplyTrigger?.query, savedReplies.length]);

  useEffect(() => {
    setSavedReplyTrigger(null);
    setSavedRepliesMenuError(null);
    setEmojiPickerOpen(false);
    setHighlightedMessageItemId(null);
    if (messageHighlightTimerRef.current !== null) {
      window.clearTimeout(messageHighlightTimerRef.current);
      messageHighlightTimerRef.current = null;
    }
  }, [selectedConversationId]);

  useEffect(() => {
    if (!emojiPickerOpen) return;

    const closeOnOutsideInteraction = (event: PointerEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        setEmojiPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    return () => document.removeEventListener("pointerdown", closeOnOutsideInteraction);
  }, [emojiPickerOpen]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  useEffect(() => () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder) return;

    mediaRecorder.onstop = null;
    if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const mediaRecorder = mediaRecorderRef.current;
    const recordingConversation = recordingConversationRef.current;
    if (!mediaRecorder || !recordingConversation || recordingConversation.id === selectedConversationId) return;

    mediaRecorder.onstop = null;
    if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    recordingConversationRef.current = null;
    audioChunksRef.current = [];
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingTime(0);
  }, [selectedConversationId]);

  useEffect(() => () => {
    if (messageHighlightTimerRef.current !== null) {
      window.clearTimeout(messageHighlightTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const previewUrl = bulkFollowUpImage?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [bulkFollowUpImage?.previewUrl]);

  const clearAttachments = useCallback(() => {
    const current = attachmentsRef.current;
    attachmentsRef.current = [];
    setAttachments([]);
    setActiveAttachmentId(null);
    current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  const updateAttachment = useCallback((id: string, patch: Partial<PendingAttachment>) => {
    setAttachments((current) => {
      const next = current.map((item) => item.id === id ? { ...item, ...patch } : item);
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  const removeAttachment = useCallback((id: string, deferPreviewCleanup = false) => {
    setAttachments((current) => {
      const removed = current.find((item) => item.id === id);
      const next = current.filter((item) => item.id !== id);
      attachmentsRef.current = next;
      setActiveAttachmentId((activeId) => activeId === id ? next[0]?.id || null : activeId);
      if (removed) {
        if (deferPreviewCleanup) {
          window.setTimeout(() => URL.revokeObjectURL(removed.previewUrl), 30_000);
        } else {
          URL.revokeObjectURL(removed.previewUrl);
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setBrowserChromeSurface("inbox");
    return () => setBrowserChromeSurface("app");
  }, []);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    if (newMessage) {
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [attachments.length, isRecording, newMessage, selectedConversationId]);

  useLayoutEffect(() => {
    const anchor = conversationListAnchorRef.current;
    const viewport = conversationListViewportRef.current;
    if (!anchor || !viewport) return;
    if (anchor.expiresAt < Date.now()) {
      conversationListAnchorRef.current = null;
      return;
    }

    const anchorRow = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-conversation-id]"),
    ).find((row) => row.dataset.conversationId === anchor.conversationId);
    if (!anchorRow) return;

    const currentOffset = anchorRow.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    const adjustment = currentOffset - anchor.offsetTop;
    if (Math.abs(adjustment) > 0.5) {
      viewport.scrollTop += adjustment;
    }
  }, [conversations]);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);

  // ─── Usuário e seletor de instâncias/colaboradores ───
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string; unit?: string | null; phone?: string | null } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canViewCollaborators, setCanViewCollaborators] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaboratorInstance[]>([]);
  const [collaboratorsLoaded, setCollaboratorsLoaded] = useState(false);
  const [ownInstances, setOwnInstances] = useState<CollaboratorInstance[]>([]);
  const [ownInstancesLoaded, setOwnInstancesLoaded] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetInstanceId, setTargetInstanceId] = useState<string | null>(null);
  const [selectedCollaborator, setSelectedCollaborator] = useState<CollaboratorInstance | null>(null);
  const [collaboratorDropdownOpen, setCollaboratorDropdownOpen] = useState(false);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [editingInstanceName, setEditingInstanceName] = useState("");
  const [savingInstanceName, setSavingInstanceName] = useState(false);
  const [savingInstanceChannelId, setSavingInstanceChannelId] = useState<string | null>(null);

  const personalizeMessageForConversation = useCallback((
    message: string,
    conversation: Conversation | null = selectedConv,
  ) => {
    if (!conversation) return message;

    const unit = resolveInboxConversationUnit(
      selectedCollaborator?.unit,
      effectiveUnit,
      conversation.contact.unit,
    );
    const unitConfig = getEvaluationScheduleUnitConfigByUnit(unit);

    return renderWhatsAppMessageTemplate(message, {
      contactName: conversation.contact.name,
      contactPhone: conversation.contact.phone,
      unit: unitConfig?.displayUnitName || unit || currentUser?.unit,
      unitAddress: unitConfig?.address,
      unitLocationUrl: unitConfig?.locationUrl,
      attendantName: currentUser?.name,
    });
  }, [currentUser?.name, currentUser?.unit, effectiveUnit, selectedCollaborator?.unit, selectedConv]);

  useEffect(() => {
    if (!selectedConv || !newMessage.includes("{{")) return;

    const personalizedMessage = personalizeMessageForConversation(newMessage, selectedConv);
    if (personalizedMessage !== newMessage) {
      setNewMessage(personalizedMessage);
    }
  }, [newMessage, personalizeMessageForConversation, selectedConv, setNewMessage]);

  // Pipeline refresh trigger — incrementado após auto-evolução para forçar re-fetch no componente
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);
  const [evaluationConfirmation, setEvaluationConfirmation] = useState<EvaluationConfirmationAvailability | null>(null);
  const [evaluationConfirmationRefreshKey, setEvaluationConfirmationRefreshKey] = useState(0);
  const [isSendingEvaluationConfirmation, setIsSendingEvaluationConfirmation] = useState(false);

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
  const [imagePreview, setImagePreview] = useState<{
    sources: string[];
    index: number;
    title: string;
  } | null>(null);
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
          setCurrentUser({
            id: data.user.id,
            name: data.user.name,
            role,
            unit: data.user.unit || null,
            phone: data.user.phone || null,
          });
          setIsAdmin(role === "ADMINISTRADOR");
          setCanViewCollaborators(role === "ADMINISTRADOR" || role === "MARKETING");
        }
      })
      .catch(() => {});
  }, []);

  // Buscar instâncias dos colaboradores: admin gerencia; marketing visualiza/acessa não-admin.
  useEffect(() => {
    if (canViewCollaborators) {
      let cancelled = false;
      setCollaboratorsLoaded(false);
      const params = new URLSearchParams();
      if (effectiveUnit && effectiveUnit !== "all") params.set("unit", effectiveUnit);
      // Uma desconexão não apaga nem arquiva a caixa. O Inbox mantém a instância
      // no seletor para que o histórico continue acessível e sinaliza seu estado.
      params.set("includeInactive", "true");
      fetch(`/api/whatsapp/admin/instances?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d.instances) setCollaborators(d.instances);
        })
        .catch(() => {
          if (!cancelled) setCollaborators([]);
        })
        .finally(() => {
          if (!cancelled) setCollaboratorsLoaded(true);
        });
      return () => {
        cancelled = true;
      };
    }
    setCollaborators([]);
    setCollaboratorsLoaded(false);
  }, [canViewCollaborators, effectiveUnit]);

  // Usuários comuns recebem somente as próprias instâncias, sem consultar a Evolution.
  useEffect(() => {
    if (!currentUser || canViewCollaborators) {
      setOwnInstances([]);
      setOwnInstancesLoaded(canViewCollaborators);
      return;
    }

    let cancelled = false;
    setOwnInstancesLoaded(false);
    const params = new URLSearchParams();
    if (effectiveUnit && effectiveUnit !== "all") params.set("unit", effectiveUnit);
    fetch(`/api/whatsapp/instances?${params.toString()}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setOwnInstances(Array.isArray(data.instances) ? data.instances : []);
      })
      .catch(() => {
        if (!cancelled) setOwnInstances([]);
      })
      .finally(() => {
        if (!cancelled) setOwnInstancesLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [canViewCollaborators, currentUser, effectiveUnit]);

  const inboxInstanceOptions = canViewCollaborators ? collaborators : ownInstances;
  const inboxInstanceOptionsLoaded = canViewCollaborators ? collaboratorsLoaded : ownInstancesLoaded;
  const selectedConversationInstance = selectedConv?.instanceId
    ? inboxInstanceOptions.find((instance) => instance.id === selectedConv.instanceId)
    : null;
  const selectedConversationUnit = resolveInboxConversationUnit(
    selectedConversationInstance?.unit
      || (selectedCollaborator && selectedCollaborator.id === selectedConv?.instanceId
        ? selectedCollaborator.unit
        : null),
    effectiveUnit,
    selectedConv?.contact.unit,
  );
  const canSwitchInboxInstance = canViewCollaborators || ownInstances.length > 1;
  const canReplyToConversation = useCallback((conversation: Pick<Conversation, "instanceId"> | null | undefined) => {
    if (isAdmin) return true;
    if (!inboxInstanceOptionsLoaded || !conversation?.instanceId) return false;
    const instance = inboxInstanceOptions.find((option) => option.id === conversation.instanceId);
    return instance?.canReply !== false && Boolean(instance);
  }, [inboxInstanceOptions, inboxInstanceOptionsLoaded, isAdmin]);
  const canReplyToSelectedConversation = canReplyToConversation(selectedConv);
  const selectedConversationNeedsStart = Boolean(
    selectedConv &&
    !selectedConv.blockedAt &&
    canReplyToSelectedConversation &&
    (!selectedConv.assignedTo || selectedConv.status === "waiting_response")
  );
  const activeScopeCanReply = selectedCollaborator
    ? selectedCollaborator.canReply !== false
    : inboxInstanceOptions.some((instance) => instance.canReply !== false);

  // Ler alvo da URL ao montar
  useEffect(() => {
    const urlTargetInstanceId = searchParams.get("targetInstanceId");
    const urlTargetUserId = searchParams.get("targetUserId");
    setTargetInstanceId(urlTargetInstanceId);
    setTargetUserId(urlTargetUserId);
  }, [searchParams]);

  // Atualizar a instância selecionada quando o alvo mudar.
  useEffect(() => {
    if (!targetInstanceId && !targetUserId) {
      setSelectedCollaborator(null);
      return;
    }
    if (!inboxInstanceOptionsLoaded) return;

    const selectedInstance = targetInstanceId
      ? inboxInstanceOptions.find((instance) => instance.id === targetInstanceId)
      : inboxInstanceOptions.find((instance) => instance.userId === targetUserId);
    setSelectedCollaborator(selectedInstance || null);
    if (!selectedInstance) {
      setTargetUserId(null);
      setTargetInstanceId(null);
      router.push("/crm/inbox");
    }
  }, [targetInstanceId, targetUserId, inboxInstanceOptions, inboxInstanceOptionsLoaded, router]);

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

  const loadInternalNotes = useCallback(async (conversationId: string) => {
    const requestSeq = ++internalNotesRequestSeqRef.current;
    setInternalNotesLoading(true);
    setInternalNotesError(null);
    try {
      const response = await fetch(
        buildUrl(`/api/whatsapp/conversations/${conversationId}/internal-notes`),
        { cache: "no-store" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível carregar as notas internas.");
      }
      if (requestSeq !== internalNotesRequestSeqRef.current) return;
      setInternalNotes(Array.isArray(data.notes) ? data.notes : []);
      setMentionableUsers(Array.isArray(data.mentionableUsers) ? data.mentionableUsers : []);
      setInternalNotesLoadedConversationId(conversationId);
      setInternalNotesLoadedVersion(typeof data.internalNotesUpdatedAt === "string" ? data.internalNotesUpdatedAt : null);
    } catch (error) {
      if (requestSeq !== internalNotesRequestSeqRef.current) return;
      setInternalNotesError(error instanceof Error ? error.message : "Não foi possível carregar as notas internas.");
    } finally {
      if (requestSeq === internalNotesRequestSeqRef.current) {
        setInternalNotesLoading(false);
      }
    }
  }, [buildUrl]);

  const saveInternalNote = useCallback(async () => {
    const conversationId = selectedConversationId;
    const content = internalNoteDraft.trim();
    if (!conversationId || !content || isSavingInternalNote) return;

    setIsSavingInternalNote(true);
    setInternalNotesError(null);
    try {
      const response = await fetch(
        buildUrl(`/api/whatsapp/conversations/${conversationId}/internal-notes`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, mentionedUserIds: internalNoteMentionIds }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a nota interna.");
      if (selectedConvRef.current?.id !== conversationId) return;
      if (data.note) setInternalNotes((current) => [...current, data.note]);
      if (typeof data.internalNotesUpdatedAt === "string") {
        setInternalNotesLoadedVersion(data.internalNotesUpdatedAt);
        setConversations((current) => current.map((conversation) => (
          conversation.id === conversationId
            ? { ...conversation, internalNotesUpdatedAt: data.internalNotesUpdatedAt }
            : conversation
        )));
        setSelectedConv((current) => current?.id === conversationId
          ? { ...current, internalNotesUpdatedAt: data.internalNotesUpdatedAt }
          : current);
      }
      setInternalNoteDraft("");
      setInternalNoteMentionIds([]);
      toast("Nota interna salva. Ela não foi enviada ao contato.", "success");
    } catch (error) {
      if (selectedConvRef.current?.id !== conversationId) return;
      const message = error instanceof Error ? error.message : "Não foi possível salvar a nota interna.";
      setInternalNotesError(message);
      toast(message, "error");
    } finally {
      setIsSavingInternalNote(false);
    }
  }, [buildUrl, internalNoteDraft, internalNoteMentionIds, isSavingInternalNote, selectedConversationId]);

  useEffect(() => {
    internalNotesRequestSeqRef.current += 1;
    setInternalNotes([]);
    setMentionableUsers([]);
    setInternalNotesLoadedConversationId(null);
    setInternalNotesLoadedVersion(null);
    setInternalNotesError(null);
    setInternalNoteDraft("");
    setInternalNoteMentionIds([]);
    setIsSavingInternalNote(false);
    setInternalNotesOpen(false);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!internalNotesOpen || !selectedConversationId) return;
    const selectedVersion = selectedConv?.internalNotesUpdatedAt || null;
    if (
      internalNotesLoadedConversationId === selectedConversationId
      && (!selectedVersion || selectedVersion === internalNotesLoadedVersion)
    ) return;
    void loadInternalNotes(selectedConversationId);
  }, [
    internalNotesLoadedConversationId,
    internalNotesLoadedVersion,
    internalNotesOpen,
    loadInternalNotes,
    selectedConversationId,
    selectedConv?.internalNotesUpdatedAt,
  ]);

  useEffect(() => {
    if (!internalNotesOpen) return;
    const dialog = internalNotesDialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : internalNotesTriggerRef.current;
    window.requestAnimationFrame(() => (internalNoteTextareaRef.current || dialog).focus());

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSavingInternalNote) {
        event.preventDefault();
        setInternalNotesOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      window.requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, [internalNotesOpen, isSavingInternalNote]);

  const leaveConversation = useCallback((extraParams?: Record<string, string>) => {
    dismissedDeepLinkConversationIdRef.current = selectedConversationIdRef.current || selectedConvRef.current?.id || null;
    messagesRequestSeqRef.current += 1;
    selectedConversationIdRef.current = null;
    loadedMessagesConversationIdRef.current = null;
    setSelectedConv(null);
    setMessages([]);
    setMessageLoadError(null);
    setReplyingTo(null);
    clearAttachments();
    setIsDraggingAttachment(false);
    attachmentDragDepthRef.current = 0;
    setContactSidebarOpen(false);
    setContactPopoverOpen(false);
    setKebabOpen(false);
    router.replace(buildUrl("/crm/inbox", extraParams));
  }, [buildUrl, clearAttachments, router]);

  const selectConversation = useCallback((conversation: Conversation, options?: { updateUrl?: boolean }) => {
    dismissedDeepLinkConversationIdRef.current = null;
    setSelectedConv(conversation);
    setReplyingTo(null);
    clearAttachments();
    setIsDraggingAttachment(false);
    attachmentDragDepthRef.current = 0;
    setContactSidebarOpen(false);
    setContactPopoverOpen(false);
    setKebabOpen(false);
    if (options?.updateUrl !== false) {
      router.replace(buildUrl("/crm/inbox", {
        conversationId: conversation.id,
        ...(conversation.archivedAt ? { archived: "1" } : {}),
      }));
    }
  }, [buildUrl, clearAttachments, router]);

  // Limpar targetUser e voltar ao próprio inbox
  const clearTargetUser = useCallback(() => {
    setTargetUserId(null);
    setTargetInstanceId(null);
    setSelectedCollaborator(null);
    setSelectedConv(null);
    setReplyingTo(null);
    setMessages([]);
    clearAttachments();
    router.push("/crm/inbox");
  }, [clearAttachments, router]);

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
      clearAttachments();
      setCollaboratorDropdownOpen(false);
      if (nextInstanceId) {
        router.push(`/crm/inbox?targetInstanceId=${nextInstanceId}`);
      } else if (nextUserId) {
        router.push(`/crm/inbox?targetUserId=${nextUserId}`);
      } else {
        router.push("/crm/inbox");
      }
    },
    [clearAttachments, router]
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
  const archivedView = tab === "archived";
  const serverConversationStatus = serverConversationStatusForTab(tab);
  const conversationListScopeKey = `${inboxScopeKey}|archived:${archivedView ? "1" : "0"}|status:${serverConversationStatus}|search:${conversationSearch}`;

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
    const updateClock = () => setSlaClockNow(Date.now());
    const interval = window.setInterval(updateClock, 30_000);
    document.addEventListener("visibilitychange", updateClock);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateClock);
    };
  }, []);

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
    const incremental = Boolean(
      options?.incremental
      && lastSync
      && !conversationSearch
      && !["callback", "followup"].includes(serverConversationStatus),
    );
    const phase = options?.phase || "refresh";
    const isPage = phase === "page" && !incremental;
    const replacesFilteredQueue = (
      Boolean(conversationSearch) || ["callback", "followup", "lost"].includes(serverConversationStatus)
    ) && !isPage;
    const requestKind = incremental ? "delta" : isPage ? `page:${options?.cursor || "none"}` : phase;
    const requestKey = `${conversationListScopeKey}:${requestKind}`;
    conversationsInFlightScopeRef.current = requestKey;
    const requestSeq = ++conversationsRequestSeqRef.current;
    const scopeAtRequestStart = conversationListScopeKey;
    if (!incremental && !isPage) {
      setConversationListError(null);
      if (phase === "initial") setConversationListLoading(true);
    }
    try {
      const qs = waParams({
        limit: String(incremental ? INBOX_FULL_CONVERSATION_LIMIT : INBOX_INITIAL_CONVERSATION_LIMIT),
        includeCampaigns: "1",
        archived: archivedView ? "1" : "0",
        status: serverConversationStatus,
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
              if (!previous) return previous;
              if (removedIds.has(previous.id)) {
                if (selectedConversationIdRef.current !== previous.id) return null;
                return serverConversationStatus === "unread" && previous.unreadCount !== 0
                  ? { ...previous, unreadCount: 0 }
                  : previous;
              }
              const updated = incoming.find((conversation) => conversation.id === previous.id);
              return updated ? mergeConversation(previous, updated) : previous;
            });
          }
        } else {
          setConversations((previous) => {
            if (replacesFilteredQueue) {
              return serverConversationStatus === "followup"
                ? sortConversationsByFollowUpSchedule(incoming)
                : serverConversationStatus === "callback"
                  ? sortConversationsByCallbackSchedule(incoming)
                  : sortConversationsByActivity(incoming);
            }
            const byId = new Map(previous.map((conversation) => [conversation.id, conversation]));
            incoming.forEach((conversation) => {
              byId.set(conversation.id, mergeConversation(byId.get(conversation.id), conversation));
            });
            const merged = Array.from(byId.values());
            return serverConversationStatus === "callback"
              ? sortConversationsByCallbackSchedule(merged)
              : sortConversationsByActivity(merged);
          });
          conversationsIncrementalPollsRef.current = 0;
        }

        if (!isPage) {
          conversationsLastSyncRef.current = nextServerTime;
        }

        const responseHasMore = Boolean(data.hasMore);
        const responseCursor = typeof data.nextCursor === "string" ? data.nextCursor : null;
        if (
          phase === "initial"
          || isPage
          || replacesFilteredQueue
          || (phase === "enrich" && conversationsRef.current.length <= INBOX_INITIAL_CONVERSATION_LIMIT)
        ) {
          setHasMoreConversations(responseHasMore);
          setNextConversationCursor(responseCursor);
        }
        setConversationLoadError(null);
        if (data.queueCounts) {
          setConversationQueueCounts({
            open: Number(data.queueCounts.open || 0),
            unread: Number(data.queueCounts.unread || 0),
            callback: Number(data.queueCounts.callback || 0),
            followup: Number(data.queueCounts.followup || 0),
            lost: Number(data.queueCounts.lost || 0),
          });
        }
        setConversationSearchTooShort(Boolean(data.searchTooShort));
        if (!incremental && !isPage) setConversationListError(null);
      }
      return true;
    } catch (e) {
      if (requestSeq === conversationsRequestSeqRef.current) {
        console.error(e);
        if (isPage) {
          setConversationLoadError(e instanceof Error ? e.message : "Não foi possível carregar mais conversas.");
        } else if (!incremental) {
          setConversationListError(e instanceof Error ? e.message : "Não foi possível carregar as conversas.");
        }
      }
      return false;
    } finally {
      if (
        !incremental
        && !isPage
        && requestSeq === conversationsRequestSeqRef.current
        && scopeAtRequestStart === activeConversationListScopeRef.current
      ) {
        setConversationListLoading(false);
      }
      if (conversationsInFlightScopeRef.current === requestKey) {
        conversationsInFlightScopeRef.current = null;
      }
    }
  }, [archivedView, conversationListScopeKey, conversationSearch, deepLinkConversationId, serverConversationStatus, waParams]);

  const applyCallbackTrackingSnapshot = useCallback((
    conversationId: string,
    snapshot?: CallbackTrackingSnapshot | null,
  ) => {
    if (!snapshot) return;

    const callbackFields: Partial<Conversation> = {
      updatedAt: snapshot.updatedAt,
      lastOutboundAt: snapshot.lastOutboundAt,
      callbackDueAt: snapshot.callbackDueAt,
      callbackTrackingStartedAt: snapshot.callbackTrackingStartedAt,
      callbackStreakCount: snapshot.callbackStreakCount,
      callbackTotalCount: snapshot.callbackTotalCount,
    };

    setConversations((current) => {
      const updated = current.map((conversation) => (
        conversation.id === conversationId ? { ...conversation, ...callbackFields } : conversation
      ));
      const visible = serverConversationStatus === "callback"
        ? updated.filter((conversation) => isConversationCallbackDue(conversation))
        : updated;
      return serverConversationStatus === "callback"
        ? sortConversationsByCallbackSchedule(visible)
        : sortConversationsByActivity(visible);
    });
    setSelectedConv((current) => (
      current?.id === conversationId ? { ...current, ...callbackFields } : current
    ));

    if (snapshot.attemptCounted) {
      setConversationQueueCounts((current) => ({
        ...current,
        callback: Math.max(0, current.callback - 1),
      }));
    }
  }, [serverConversationStatus]);

  useEffect(() => {
    if (!deepLinkConversationId) {
      dismissedDeepLinkConversationIdRef.current = null;
      return;
    }
    if (dismissedDeepLinkConversationIdRef.current === deepLinkConversationId) return;
    if (selectedConvRef.current?.id === deepLinkConversationId) return;

    const linkedConversation = conversations.find((conversation) => conversation.id === deepLinkConversationId);
    if (linkedConversation) {
      selectConversation(linkedConversation, { updateUrl: false });
    }
  }, [conversations, deepLinkConversationId, selectConversation]);

  const isConversationInService = useCallback((conv?: Conversation | null) => {
    return !!conv?.assignedTo && conv.status !== "waiting_response";
  }, []);

  const fetchMessages = useCallback((convId: string, markAsRead = false): Promise<MessageLoadResult> => {
    const requestKey = `${inboxScopeKey}:${convId}:${markAsRead ? "read" : "peek"}`;
    const existingRequest = messagesInFlightRequestsRef.current.get(requestKey);
    if (existingRequest) return existingRequest;

    const requestSeq = ++messagesRequestSeqRef.current;
    const scopeAtRequestStart = inboxScopeKey;
    const request = (async (): Promise<MessageLoadResult> => {
      try {
        const qs = waParams({ conversationId: convId, limit: "120", ...(markAsRead ? { markAsRead: "1" } : {}) });
        const res = await fetch(`/api/whatsapp/messages?${qs}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({})) as {
          messages?: Message[];
          markedAsRead?: boolean;
          error?: string;
          details?: string;
        };
        if (!res.ok) {
          throw new Error(data.details || data.error || "Não foi possível carregar as mensagens.");
        }

        if (
          requestSeq !== messagesRequestSeqRef.current ||
          scopeAtRequestStart !== activeScopeRef.current ||
          selectedConvRef.current?.id !== convId ||
          !Array.isArray(data.messages)
        ) {
          return { status: "superseded" };
        }

        loadedMessagesConversationIdRef.current = convId;
        setMessages((currentMessages) => preserveActiveAudioMediaUrl(
          currentMessages,
          data.messages!,
          activeAudioMessageIdRef.current,
        ));
        setMessageLoadError(null);
        setLoadingMessages(false);
        if (markAsRead && data.markedAsRead === true) {
          setConversations((prev) =>
            prev.map((conv) => conv.id === convId && conv.unreadCount !== 0 ? { ...conv, unreadCount: 0 } : conv)
          );
          setSelectedConv((prev) =>
            prev?.id === convId && prev.unreadCount !== 0 ? { ...prev, unreadCount: 0 } : prev
          );
        }
        return { status: "applied" };
      } catch (error) {
        if (requestSeq === messagesRequestSeqRef.current) {
          console.error(error);
        }
        return {
          status: "error",
          error: error instanceof Error ? error.message : "Não foi possível carregar as mensagens.",
        };
      }
    })();

    messagesInFlightRequestsRef.current.set(requestKey, request);
    void request.finally(() => {
      if (messagesInFlightRequestsRef.current.get(requestKey) === request) {
        messagesInFlightRequestsRef.current.delete(requestKey);
      }
    });
    return request;
  }, [inboxScopeKey, waParams]);

  useEffect(() => {
    setEvaluationConfirmation(null);
    setIsSendingEvaluationConfirmation(false);

    if (
      !selectedConversationId
      || !isEvaluationScheduleInstanceId(selectedConv?.instanceId)
      || !canReplyToSelectedConversation
    ) {
      return;
    }

    const controller = new AbortController();
    let boundaryTimer: number | null = null;
    const endpoint = buildUrl(
      `/api/whatsapp/conversations/${selectedConversationId}/evaluation-confirmation`,
    );

    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Não foi possível verificar a confirmação da avaliação.");
        return data as EvaluationConfirmationAvailability;
      })
      .then((data) => {
        if (controller.signal.aborted || selectedConversationIdRef.current !== selectedConversationId) return;
        setEvaluationConfirmation(data);

        const boundaryValue = data.visible ? data.startTime : data.reason === "too_early" ? data.eligibleAt : null;
        const boundaryTime = boundaryValue ? new Date(boundaryValue).getTime() : Number.NaN;
        if (Number.isFinite(boundaryTime)) {
          const delay = Math.max(1000, boundaryTime - Date.now() + 1000);
          boundaryTimer = window.setTimeout(
            () => setEvaluationConfirmationRefreshKey((current) => current + 1),
            Math.min(delay, 2_147_483_647),
          );
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
      });

    return () => {
      controller.abort();
      if (boundaryTimer !== null) window.clearTimeout(boundaryTimer);
    };
  }, [
    buildUrl,
    canReplyToSelectedConversation,
    evaluationConfirmationRefreshKey,
    selectedConversationId,
    selectedConv?.instanceId,
  ]);

  const handleSendEvaluationConfirmation = useCallback(async () => {
    const conversation = selectedConvRef.current;
    if (!conversation || !evaluationConfirmation?.visible || evaluationConfirmation.alreadySent) return;

    setIsSendingEvaluationConfirmation(true);
    try {
      const endpoint = buildUrl(
        `/api/whatsapp/conversations/${conversation.id}/evaluation-confirmation`,
      );
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar a confirmação da avaliação.");

      if (selectedConversationIdRef.current === conversation.id) {
        setEvaluationConfirmation((current) => current ? { ...current, visible: true, alreadySent: true } : current);
        await fetchMessages(conversation.id, false);
      }
      toast(
        data.status === "already_sent" ? "A confirmação já havia sido enviada." : "Confirmação enviada com sucesso!",
        data.status === "already_sent" ? "info" : "success",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível enviar a confirmação da avaliação.", "error");
    } finally {
      setIsSendingEvaluationConfirmation(false);
    }
  }, [buildUrl, evaluationConfirmation, fetchMessages]);

  // Ao trocar o escopo do inbox (instância, colaborador ou unidade), zera a
  // seleção atual e invalida respostas antigas ainda em voo.
  useEffect(() => {
    conversationsRequestSeqRef.current += 1;
    messagesRequestSeqRef.current += 1;
    conversationsInFlightScopeRef.current = null;
    conversationsLastSyncRef.current = null;
    conversationsIncrementalPollsRef.current = 0;
    messagesInFlightRequestsRef.current.clear();
    selectedConversationIdRef.current = null;
    loadedMessagesConversationIdRef.current = null;
    setSelectedConv(null);
    setMessages([]);
    setMessageLoadError(null);
    setBulkSelectionMode(false);
    setBulkSelectedConversationIds([]);
    setBulkFollowUpComposerOpen(false);
    setBulkFollowUpImage(null);
    setBulkFollowUpProgress(null);
    setConversationQueueCounts({ open: 0, unread: 0, callback: 0, followup: 0, lost: 0 });
    conversationListAnchorRef.current = null;
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
    setConversationListLoading(cachedConversations.length === 0);
    setConversationListError(null);
    setHasMoreConversations(cachedConversations.length >= INBOX_INITIAL_CONVERSATION_LIMIT);
    setNextConversationCursor(cachedConversations.at(-1)?.id || null);
    setIsLoadingMoreConversations(false);
    setConversationLoadError(null);
    setConversationSearchTooShort(false);
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
    const hasCachedConversations = Boolean(readConversationListMemoryCache(conversationListScopeKey)?.length);
    void fetchConversations({ phase: hasCachedConversations ? "enrich" : "initial" });
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
    if (currentConversation && !activeAudioMessageIdRef.current) {
      fetchMessages(currentConversation.id, isConversationInService(currentConversation));
    }
  }, [fetchConversations, fetchMessages, isConversationInService]);

  useVisiblePolling(refreshVisibleInbox, INBOX_POLL_INTERVAL_MS, { runImmediately: false });

  const handleAudioPlaybackChange = useCallback((messageId: string, isPlaying: boolean) => {
    if (isPlaying) {
      activeAudioMessageIdRef.current = messageId;
      return;
    }

    if (activeAudioMessageIdRef.current === messageId) {
      activeAudioMessageIdRef.current = null;
    }
  }, []);

  // Load messages only when the user opens another conversation. Polling updates
  // the same conversation silently so the chat does not flash a loading state.
  useEffect(() => {
    if (!selectedConversationId) {
      selectedConversationIdRef.current = null;
      loadedMessagesConversationIdRef.current = null;
      setLoadingMessages(false);
      setMessageLoadError(null);
      return;
    }

    const isNewSelection = selectedConversationIdRef.current !== selectedConversationId;
    selectedConversationIdRef.current = selectedConversationId;
    setLoadingMessages(true);
    setMessageLoadError(null);

    if (isNewSelection) {
      loadedMessagesConversationIdRef.current = null;
      setMessages([]);
    }

    const currentConversation = selectedConvRef.current;
    const markAsRead = isConversationInService(currentConversation);
    let cancelled = false;
    let retryTimer: number | null = null;

    const load = async (attempt: number) => {
      const result = await fetchMessages(selectedConversationId, markAsRead);
      if (cancelled || selectedConversationIdRef.current !== selectedConversationId) return;
      if (result.status === "applied" || loadedMessagesConversationIdRef.current === selectedConversationId) return;

      if (attempt < MESSAGE_LOAD_RETRY_DELAYS_MS.length) {
        retryTimer = window.setTimeout(
          () => void load(attempt + 1),
          MESSAGE_LOAD_RETRY_DELAYS_MS[attempt],
        );
        return;
      }

      setLoadingMessages(false);
      setMessageLoadError(
        result.status === "error"
          ? result.error
          : "A resposta anterior foi interrompida antes de carregar as mensagens.",
      );
    };

    void load(0);
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [selectedConversationId, fetchMessages, isConversationInService, messageReloadKey]);

  const scrollMessagesToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      const viewport = messagesViewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    });
  }, []);

  // Auto-scroll confined to the message pane so the browser viewport and header
  // remain stable when a message arrives or the on-screen keyboard changes size.
  const prevLengthRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      scrollMessagesToEnd(prevLengthRef.current === 0 ? "auto" : "smooth");
    }
    prevLengthRef.current = messages.length;
  }, [messages, scrollMessagesToEnd]);

  useEffect(() => {
    const keepComposerVisible = () => {
      if (document.activeElement === textareaRef.current) {
        scrollMessagesToEnd("auto");
      }
    };

    window.addEventListener("crm:visual-viewport-change", keepComposerVisible);
    return () => window.removeEventListener("crm:visual-viewport-change", keepComposerVisible);
  }, [scrollMessagesToEnd]);

  useEffect(() => {
    if (!imagePreview && !documentPreview) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImagePreview(null);
        setDocumentPreview(null);
      } else if (imagePreview && event.key === "ArrowLeft") {
        setImagePreview((current) => current ? {
          ...current,
          index: (current.index - 1 + current.sources.length) % current.sources.length,
        } : current);
      } else if (imagePreview && event.key === "ArrowRight") {
        setImagePreview((current) => current ? {
          ...current,
          index: (current.index + 1) % current.sources.length,
        } : current);
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
      if (imagePreview || documentPreview || editingMessage || showDeleteModal || showBlockModal || showCloseModal || showNewConversationDialog || showSavedRepliesDialog || showEvaluationAvailabilityDialog) {
        return;
      }
      if (bulkFollowUpConfirmOpen) {
        setBulkFollowUpConfirmOpen(false);
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
      leaveConversation(archivedView ? { archived: "1" } : undefined);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    contactPopoverOpen,
    contactSidebarOpen,
    archivedView,
    documentPreview,
    editingMessage,
    imagePreview,
    kebabOpen,
    leaveConversation,
    showCloseModal,
    showBlockModal,
    showDeleteModal,
    bulkFollowUpConfirmOpen,
    showNewConversationDialog,
    showSavedRepliesDialog,
    showEvaluationAvailabilityDialog,
  ]);

  // ─── File attachment ──────────────────────────────────────
  const loadAttachments = useCallback((files: File[]) => {
    const availableSlots = WHATSAPP_MEDIA_MAX_BATCH_FILES - attachmentsRef.current.length;
    if (availableSlots <= 0) {
      toast(`Você pode enviar até ${WHATSAPP_MEDIA_MAX_BATCH_FILES} arquivos por vez.`, "error");
      return;
    }

    const selectedFiles = files.slice(0, availableSlots);
    const unsupportedFiles = selectedFiles.filter((file) => !attachmentKind(file));
    const oversizedFiles = selectedFiles.filter((file) => file.size > WHATSAPP_MEDIA_MAX_FILE_BYTES);
    const acceptedFiles = selectedFiles.filter((file) => attachmentKind(file) && file.size <= WHATSAPP_MEDIA_MAX_FILE_BYTES);

    if (files.length > availableSlots) {
      toast(`Somente os primeiros ${availableSlots} arquivos foram adicionados.`, "error");
    } else if (unsupportedFiles.length) {
      toast("Alguns formatos não são suportados. Envie imagem, vídeo, áudio, PDF, Word ou Excel.", "error");
    } else if (oversizedFiles.length) {
      toast("Alguns arquivos ultrapassam o limite de 100 MB.", "error");
    }

    if (!acceptedFiles.length) return;

    const added = acceptedFiles.map((file) => ({
      id: createAttachmentId(),
      file,
      type: attachmentKind(file) as PendingAttachment["type"],
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: "ready" as const,
    }));
    const next = [...attachmentsRef.current, ...added];
    attachmentsRef.current = next;
    setAttachments(next);
    setActiveAttachmentId((current) => current || added[0].id);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) loadAttachments(files);
    e.target.value = "";
  };

  const handleComposerPaste = useCallback((event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const audioFiles = audioFilesFromClipboard(event.clipboardData);
    if (!audioFiles.length) return;

    event.preventDefault();
    loadAttachments(audioFiles);
    toast(
      audioFiles.length === 1
        ? "Áudio colado. Revise e toque em enviar."
        : `${audioFiles.length} áudios colados. Revise e toque em enviar.`,
      "success",
    );
  }, [loadAttachments]);

  const dragContainsFiles = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handleAttachmentDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!selectedConv || attachments.length >= WHATSAPP_MEDIA_MAX_BATCH_FILES || !dragContainsFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentDragDepthRef.current += 1;
    setIsDraggingAttachment(true);
  };

  const handleAttachmentDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!selectedConv || attachments.length >= WHATSAPP_MEDIA_MAX_BATCH_FILES || !dragContainsFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleAttachmentDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isDraggingAttachment) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentDragDepthRef.current = Math.max(0, attachmentDragDepthRef.current - 1);
    if (attachmentDragDepthRef.current === 0) setIsDraggingAttachment(false);
  };

  const handleAttachmentDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!selectedConv || attachments.length >= WHATSAPP_MEDIA_MAX_BATCH_FILES || !dragContainsFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentDragDepthRef.current = 0;
    setIsDraggingAttachment(false);
    const files = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    if (files.length) loadAttachments(files);
  };

  const uploadConversationMedia = useCallback(async (
    file: File,
    conversationId: string,
    onProgress?: (percentage: number) => void,
  ) => {
    const uploadQuery = waParams();
    return upload(
      `whatsapp/${conversationId}/${Date.now()}-${safeAttachmentPathName(file.name)}`,
      file,
      {
        access: "private",
        handleUploadUrl: `/api/whatsapp/media/upload${uploadQuery ? `?${uploadQuery}` : ""}`,
        clientPayload: JSON.stringify({ conversationId }),
        contentType: file.type || "application/octet-stream",
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
      },
    );
  }, [waParams]);

  // ─── Send message ─────────────────────────────────────────
  const handleSendMessage = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && attachments.length === 0) || !selectedConv || isSending) return;
    if (!canReplyToConversation(selectedConv)) {
      toast("Esta conta está disponível somente para consulta.", "error");
      return;
    }
    if (selectedConv.blockedAt) {
      toast("Este contato está bloqueado. Desbloqueie-o antes de enviar mensagens.", "error");
      return;
    }

    const sendConversation = selectedConv;
    captureConversationListAnchor(new Set([sendConversation.id]));
    const tempMsg = personalizeMessageForConversation(newMessage, sendConversation);
    const replyTarget = replyingTo;
    const queuedAttachments = [...attachments];
    const imageBatchAssignments = createImageBatchAssignments(queuedAttachments);
    const qs = waParams();
    const sendUrl = `/api/whatsapp/send${qs ? `?${qs}` : ""}`;
    const mediaBatchUrl = `/api/whatsapp/media/batch${qs ? `?${qs}` : ""}`;
    const sentImageBatchMessageIds = new Map<string, Array<string | undefined>>();
    let sentCount = 0;
    let activePendingAttachment: PendingAttachment | null = null;
    setIsSending(true);

    const buildPayload = (messageBody: string, type: string) => {
      const payload: Record<string, any> = {
        conversationId: sendConversation.id,
        contactId: sendConversation.contact.phone,
        body: messageBody,
        type,
      };
      if (sendConversation.instanceId || targetInstanceId) {
        payload.instanceId = sendConversation.instanceId || targetInstanceId;
      } else if (targetUserId) {
        payload.targetUserId = targetUserId;
      }
      return payload;
    };

    try {
      if (queuedAttachments.length === 0) {
        const tempId = `temp_${Date.now()}`;
        const payload = buildPayload(tempMsg, "text");
        if (replyTarget?.messageId) {
          payload.replyid = replyTarget.messageId;
          payload.replyId = replyTarget.messageId;
        }

        setNewMessage("");
        setReplyingTo(null);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        setMessages((prev) => [...prev, {
          id: tempId,
          body: tempMsg,
          type: "text",
          quotedMessageId: replyTarget?.messageId || null,
          quotedMessageBody: replyTarget ? messageReplyPreview(replyTarget) : null,
          quotedMessageType: replyTarget?.type || null,
          quotedMessageFromMe: replyTarget?.fromMe ?? null,
          fromMe: true,
          status: "sent",
          timestamp: new Date().toISOString(),
        }]);

        const res = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessages((prev) => prev.filter((message) => message.id !== tempId));
          setNewMessage((current) => current || tempMsg);
          if (replyTarget) setReplyingTo((current) => current || replyTarget);
          throw new Error(data.error || "Não foi possível enviar a mensagem.");
        }
        if (data.message) {
          setMessages((prev) => prev.map((message) => message.id === tempId ? data.message : message));
        }
        applyCallbackTrackingSnapshot(sendConversation.id, data.callbackTracking);
        sentCount = 1;
      } else {
        let attachmentCaptionSent = false;
        for (let index = 0; index < queuedAttachments.length; index += 1) {
          const pendingAttachment = queuedAttachments[index];
          activePendingAttachment = pendingAttachment;
          const caption = !attachmentCaptionSent && pendingAttachment.type !== "audio" ? tempMsg : "";
          if (caption) attachmentCaptionSent = true;
          const currentReply = index === 0 ? replyTarget : null;
          let blobUrl = pendingAttachment.blobUrl;

          if (!blobUrl) {
            updateAttachment(pendingAttachment.id, { status: "uploading", progress: 0, error: undefined });
            const uploadResult = await uploadConversationMedia(
              pendingAttachment.file,
              sendConversation.id,
              (percentage) => updateAttachment(pendingAttachment.id, { progress: percentage }),
            );
            blobUrl = uploadResult.url;
            updateAttachment(pendingAttachment.id, { blobUrl, progress: 100 });
          }

          updateAttachment(pendingAttachment.id, { status: "sending", progress: 100, error: undefined });
          const messageType = attachmentMessageType(pendingAttachment);
          const tempId = `temp_${Date.now()}_${index}`;
          if (selectedConversationIdRef.current === sendConversation.id) {
            setMessages((prev) => [...prev, {
              id: tempId,
              body: caption,
              type: messageType,
              mediaUrl: pendingAttachment.previewUrl,
              mediaFileName: pendingAttachment.file.name,
              mediaMimeType: pendingAttachment.file.type || null,
              mediaSizeBytes: pendingAttachment.file.size,
              quotedMessageId: currentReply?.messageId || null,
              quotedMessageBody: currentReply ? messageReplyPreview(currentReply) : null,
              quotedMessageType: currentReply?.type || null,
              quotedMessageFromMe: currentReply?.fromMe ?? null,
              fromMe: true,
              status: "sent",
              timestamp: new Date().toISOString(),
            }]);
          }

          const payload = buildPayload(caption, messageType);
          const imageBatch = imageBatchAssignments.get(pendingAttachment.id);
          payload.file = blobUrl;
          payload.docName = pendingAttachment.file.name;
          payload.mimeType = pendingAttachment.file.type || "application/octet-stream";
          payload.fileSize = pendingAttachment.file.size;
          if (currentReply?.messageId) {
            payload.replyid = currentReply.messageId;
            payload.replyId = currentReply.messageId;
          }

          const res = await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (selectedConversationIdRef.current === sendConversation.id) {
              setMessages((prev) => prev.filter((message) => message.id !== tempId));
            }
            const message = data.error || "Não foi possível enviar este arquivo.";
            updateAttachment(pendingAttachment.id, { status: "error", blobUrl, error: message });
            throw new Error(`${pendingAttachment.file.name}: ${message}`);
          }

          if (data.message && selectedConversationIdRef.current === sendConversation.id) {
            setMessages((prev) => prev.map((message) => message.id === tempId ? data.message : message));
          }
          applyCallbackTrackingSnapshot(sendConversation.id, data.callbackTracking);
          if (imageBatch && typeof data.message?.messageId === "string") {
            const messageIds = sentImageBatchMessageIds.get(imageBatch.id) || Array<string | undefined>(imageBatch.size);
            messageIds[imageBatch.index] = data.message.messageId;
            sentImageBatchMessageIds.set(imageBatch.id, messageIds);

            if (messageIds.every((messageId) => typeof messageId === "string")) {
              const batchRes = await fetch(mediaBatchUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  conversationId: sendConversation.id,
                  batchId: imageBatch.id,
                  messageIds,
                }),
              });
              if (!batchRes.ok) {
                console.error("[Inbox] Imagens enviadas, mas o mosaico do lote não foi persistido.");
              }
            }
          }
          removeAttachment(pendingAttachment.id, true);
          sentCount += 1;

          if (caption) {
            setNewMessage("");
            if (textareaRef.current) textareaRef.current.style.height = "auto";
          }
          if (index === 0) {
            setReplyingTo(null);
          }
        }
      }

      if (queuedAttachments.length > 1) {
        toast(`${sentCount} arquivos enviados com sucesso.`, "success");
      }
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Erro ao enviar mensagem. Tente novamente.";
      if (queuedAttachments.length === 0 && sentCount === 0) {
        setNewMessage((current) => current || tempMsg);
        if (replyTarget) setReplyingTo((current) => current || replyTarget);
      } else if (activePendingAttachment) {
        updateAttachment(activePendingAttachment.id, { status: "error", error: errorMessage });
      }
      toast(errorMessage, "error");
    } finally {
      if (selectedConversationIdRef.current === sendConversation.id && sentCount > 0) {
        fetchMessages(sendConversation.id, isConversationInService(sendConversation));
      }
      await fetchConversations({ incremental: true });
      releaseConversationListAnchor();
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

  const handleMessageReaction = useCallback(async (msg: Message, reaction: string) => {
    const conversation = selectedConvRef.current;
    if (!conversation || !canReplyToConversation(conversation) || msg.readOnly || msg.status === "deleted") return;

    const previousReaction = msg.ownReaction || null;
    const nextReaction = reaction || null;
    setMessages((current) => current.map((message) => (
      message.id === msg.id ? { ...message, ownReaction: nextReaction } : message
    )));
    setMessageActionId(msg.id);

    try {
      const qs = waParams();
      const response = await fetch(`/api/whatsapp/messages${qs ? `?${qs}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: msg.id, reaction }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.details || "Não foi possível reagir à mensagem");
      }

      setMessages((current) => current.map((message) => (
        message.id === msg.id
          ? {
              ...message,
              ownReaction: data.message?.ownReaction ?? nextReaction,
              contactReaction: data.message?.contactReaction ?? message.contactReaction,
            }
          : message
      )));
    } catch (error) {
      setMessages((current) => current.map((message) => (
        message.id === msg.id && message.ownReaction === nextReaction
          ? { ...message, ownReaction: previousReaction }
          : message
      )));
      toast(error instanceof Error ? error.message : "Não foi possível reagir à mensagem", "error");
    } finally {
      setMessageActionId(null);
    }
  }, [canReplyToConversation, waParams]);

  const handleSavedReplySelect = useCallback((content: string) => {
    if (savedReplyDialogTarget === "bulk") {
      setBulkFollowUpDraft((current) => current.trim()
        ? `${current.trimEnd()}\n\n${content}`
        : content
      );
      setShowSavedRepliesDialog(false);
      toast("Resposta adicionada ao follow-up", "success");
      return;
    }

    const personalizedContent = personalizeMessageForConversation(content);
    setNewMessage((current) => current.trim()
      ? `${current.trimEnd()}\n\n${personalizedContent}`
      : personalizedContent
    );
    setSavedReplyTrigger(null);
    setShowSavedRepliesDialog(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
    toast("Resposta adicionada ao campo", "success");
  }, [personalizeMessageForConversation, savedReplyDialogTarget, setNewMessage]);

  const handleEvaluationAvailabilityInsert = useCallback((content: string) => {
    const personalizedContent = personalizeMessageForConversation(content);
    setNewMessage((current) => current.trim()
      ? `${current.trimEnd()}\n\n${personalizedContent}`
      : personalizedContent
    );
    requestAnimationFrame(() => textareaRef.current?.focus());
    toast("Horários adicionados ao campo para revisão", "success");
  }, [personalizeMessageForConversation, setNewMessage]);

  const handleComposerValueChange = useCallback((value: string, cursor: number) => {
    const personalizedValue = personalizeMessageForConversation(value);
    const personalizedCursor = personalizeMessageForConversation(value.slice(0, cursor)).length;

    setNewMessage(personalizedValue);
    composerSelectionRef.current = { start: personalizedCursor, end: personalizedCursor };
    setSavedReplyTrigger(findSavedReplyTrigger(personalizedValue, personalizedCursor));

    if (personalizedValue !== value || personalizedCursor !== cursor) {
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(personalizedCursor, personalizedCursor);
      });
    }
  }, [personalizeMessageForConversation, setNewMessage]);

  const handleEmojiSelect = useCallback((emoji: string) => {
    const textarea = textareaRef.current;
    const fallbackCursor = newMessage.length;
    const selectionStart = textarea?.selectionStart ?? composerSelectionRef.current.start ?? fallbackCursor;
    const selectionEnd = textarea?.selectionEnd ?? composerSelectionRef.current.end ?? selectionStart;
    const start = Math.max(0, Math.min(selectionStart, newMessage.length));
    const end = Math.max(start, Math.min(selectionEnd, newMessage.length));
    const nextValue = `${newMessage.slice(0, start)}${emoji}${newMessage.slice(end)}`;
    const nextCursor = start + emoji.length;

    setNewMessage(nextValue);
    composerSelectionRef.current = { start: nextCursor, end: nextCursor };
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }, [newMessage, setNewMessage]);

  const handleSlashSavedReplySelect = useCallback((reply: SavedReply) => {
    if (!savedReplyTrigger) return;

    const personalizedContent = personalizeMessageForConversation(reply.content);
    const nextCursor = savedReplyTrigger.start + personalizedContent.length;
    setNewMessage((current) =>
      `${current.slice(0, savedReplyTrigger.start)}${personalizedContent}${current.slice(savedReplyTrigger.end)}`
    );
    setSavedReplyTrigger(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }, [personalizeMessageForConversation, savedReplyTrigger, setNewMessage]);

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (savedReplyTrigger) {
      if (event.key === "ArrowDown" && savedReplyMatches.length > 0) {
        event.preventDefault();
        setSavedReplyActiveIndex((current) => (current + 1) % savedReplyMatches.length);
        return;
      }
      if (event.key === "ArrowUp" && savedReplyMatches.length > 0) {
        event.preventDefault();
        setSavedReplyActiveIndex((current) => (current - 1 + savedReplyMatches.length) % savedReplyMatches.length);
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && savedReplyMatches.length > 0) {
        event.preventDefault();
        handleSlashSavedReplySelect(savedReplyMatches[Math.min(savedReplyActiveIndex, savedReplyMatches.length - 1)]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSavedReplyTrigger(null);
        return;
      }
      if (event.key === "Enter" && savedRepliesLoading) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage(event as any);
    }
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
  const clearRecordingTimer = () => {
    if (!recordingTimerRef.current) return;
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  };

  const startRecordingTimer = () => {
    clearRecordingTimer();
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime((previous) => previous + 1);
    }, 1000);
  };

  const startRecording = async () => {
    const recordingConversation = selectedConvRef.current;
    if (!recordingConversation || isRecording || isSending) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (selectedConversationIdRef.current !== recordingConversation.id) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      // Usa webm/opus se disponível, senão fallback para o default
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordingConversationRef.current = recordingConversation;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const durationMs = recordingDurationMs(recordingDurationClockRef.current, performance.now());
        const rawAudioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        recordingDurationClockRef.current = { elapsedMs: 0, activeSinceMs: null };

        if (!rawAudioBlob.size) {
          toast("A gravação ficou vazia. Tente novamente.", "error");
          return;
        }

        let audioBlob = rawAudioBlob;
        try {
          audioBlob = await fixRecordedWebmDuration(rawAudioBlob, durationMs);
        } catch (error) {
          console.warn("Não foi possível corrigir a duração WebM antes do envio:", error);
        }

        const extension = extensionFromMimeType(audioBlob.type || "audio/webm");
        const audioFile = new File(
          [audioBlob],
          `audio-gravado-${Date.now()}.${extension}`,
          { type: audioBlob.type || "audio/webm", lastModified: Date.now() },
        );
        await sendAudioMessage(audioFile, recordingConversation);
      };

      mediaRecorder.onerror = (event) => {
        console.error("Erro durante gravação do áudio:", event);
        toast("A gravação foi interrompida. Tente novamente.", "error");
        mediaRecorder.onstop = null;
        clearRecordingTimer();
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        recordingConversationRef.current = null;
        audioChunksRef.current = [];
        recordingDurationClockRef.current = { elapsedMs: 0, activeSinceMs: null };
        setIsRecording(false);
        setIsRecordingPaused(false);
      };

      mediaRecorder.start();
      recordingDurationClockRef.current = startRecordingDurationClock(performance.now());
      setIsRecording(true);
      setIsRecordingPaused(false);
      setRecordingTime(0);
      startRecordingTimer();
    } catch (err) {
      console.error("Erro ao acessar microfone:", err);
      toast("Permita o acesso ao microfone para gravar áudio", "error");
    }
  };

  const toggleRecordingPause = () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;

    if (mediaRecorder.state === "recording") {
      recordingDurationClockRef.current = pauseRecordingDurationClock(
        recordingDurationClockRef.current,
        performance.now(),
      );
      mediaRecorder.pause();
      setIsRecordingPaused(true);
      clearRecordingTimer();
      return;
    }

    if (mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      recordingDurationClockRef.current = resumeRecordingDurationClock(
        recordingDurationClockRef.current,
        performance.now(),
      );
      setIsRecordingPaused(false);
      startRecordingTimer();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      recordingDurationClockRef.current = pauseRecordingDurationClock(
        recordingDurationClockRef.current,
        performance.now(),
      );
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
    clearRecordingTimer();
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
    mediaRecorderRef.current = null;
    recordingConversationRef.current = null;
    recordingDurationClockRef.current = { elapsedMs: 0, activeSinceMs: null };
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingTime(0);
    clearRecordingTimer();
  };

  const sendAudioMessage = async (audioFile: File, sendConversation: Conversation) => {
    if (!canReplyToConversation(sendConversation)) {
      toast("Esta conta está disponível somente para consulta.", "error");
      return;
    }
    if (sendConversation.blockedAt) {
      toast("Este contato está bloqueado. Desbloqueie-o antes de enviar mensagens.", "error");
      return;
    }

    setIsSending(true);
    try {
      const uploadResult = await uploadConversationMedia(audioFile, sendConversation.id);
      const payload: Record<string, any> = {
        conversationId: sendConversation.id,
        contactId: sendConversation.contact.phone,
        body: "",
        type: "ptt",
        file: uploadResult.url,
        docName: audioFile.name,
        mimeType: audioFile.type || "audio/webm",
        fileSize: audioFile.size,
      };
      if (sendConversation.instanceId || targetInstanceId) {
        payload.instanceId = sendConversation.instanceId || targetInstanceId;
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
        const data = await res.json().catch(() => ({}));
        applyCallbackTrackingSnapshot(sendConversation.id, data.callbackTracking);
        if (selectedConversationIdRef.current === sendConversation.id) {
          fetchMessages(sendConversation.id, isConversationInService(sendConversation));
        }
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
      recordingConversationRef.current = null;
      setIsSending(false);
    }
  };

  // Finalizar conversa
  const handleCloseConversation = async () => {
    if (!selectedConv) return;
    if (!canReplyToConversation(selectedConv)) return;
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
    if (!canReplyToConversation(selectedConv)) return;
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
    if (!canReplyToConversation(selectedConv)) return;

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
      leaveConversation(archivedView ? { archived: "1" } : undefined);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao marcar conversa como não lida", "error");
    } finally {
      setIsMarkingUnread(false);
    }
  };

  const handleArchiveConversation = async (archived: boolean) => {
    if (!selectedConv || isArchivingConversation) return;
    if (!canReplyToConversation(selectedConv)) return;

    setIsArchivingConversation(true);
    try {
      const qs = waParams();
      const res = await fetch(
        `/api/whatsapp/conversations/${selectedConv.id}/archive${qs ? `?${qs}` : ""}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar arquivamento");

      setConversations((previous) => previous.filter((conversation) => conversation.id !== selectedConv.id));
      toast(archived ? "Conversa arquivada" : "Conversa restaurada", "success");
      leaveConversation(archivedView ? { archived: "1" } : undefined);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao atualizar arquivamento", "error");
    } finally {
      setIsArchivingConversation(false);
    }
  };

  const handleUpdateContactBlock = async () => {
    const conversation = selectedConvRef.current;
    if (!conversation || isUpdatingContactBlock) return;

    const blocked = !Boolean(conversation.blockedAt);
    setIsUpdatingContactBlock(true);
    try {
      const qs = waParams();
      const response = await fetch(
        `/api/whatsapp/conversations/${conversation.id}/block${qs ? `?${qs}` : ""}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocked }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível atualizar o bloqueio do contato.");
      }

      const blockState = {
        blockedAt: data.conversation?.blockedAt || null,
        blockedByName: data.conversation?.blockedByName || null,
      };
      setConversations((current) => current.map((item) => (
        item.id === conversation.id ? { ...item, ...blockState } : item
      )));
      setSelectedConv((current) => current?.id === conversation.id
        ? { ...current, ...blockState }
        : current
      );
      if (blocked) {
        setNewMessage("");
        setReplyingTo(null);
        clearAttachments();
        if (isRecording) cancelRecording();
      }
      setShowBlockModal(false);
      toast(blocked ? "Contato bloqueado no sistema e no WhatsApp" : "Contato desbloqueado no sistema e no WhatsApp", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao atualizar bloqueio do contato", "error");
    } finally {
      setIsUpdatingContactBlock(false);
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
    if (!canReplyToConversation(selectedConv)) return;
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
          startService: true,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        toast('Atendimento iniciado!', 'success');
        if (data.pipelineTransition?.status === "moved") {
          setPipelineRefreshKey((key) => key + 1);
        }

        // 2. Atualizar estado local imediatamente
        const updatedConv = {
          ...selectedConv,
          status: 'open',
          assignedTo: currentUser.id,
          assignedToName: currentUser.name || 'Operador',
          unreadCount: 0,
        };
        setSelectedConv(updatedConv);
        setConversations((previous) => previous.map((conversation) => (
          conversation.id === updatedConv.id ? { ...conversation, ...updatedConv } : conversation
        )));

        fetchConversations({ incremental: true });
        fetchMessages(selectedConv.id, true);
      } else {
        toast('Erro ao iniciar atendimento', 'error');
      }
    } catch {
      toast('Erro ao iniciar atendimento', 'error');
    }
  };

  const applyFollowUpShortcut = useCallback((shortcut: WhatsAppFollowUpShortcut) => {
    const value = whatsAppFollowUpShortcutInput(shortcut);
    setFollowUpDate(value.date);
    setFollowUpTime(value.time);
  }, []);

  const openFollowUpModal = useCallback(() => {
    const activeFollowUp = selectedConv?.activeFollowUp;
    if (activeFollowUp) {
      const value = whatsAppFollowUpInputFromDate(new Date(activeFollowUp.scheduledAt));
      setFollowUpDate(value.date);
      setFollowUpTime(value.time);
      setFollowUpNote(activeFollowUp.note);
    } else {
      const value = whatsAppFollowUpShortcutInput("tomorrow_morning");
      setFollowUpDate(value.date);
      setFollowUpTime(value.time);
      setFollowUpNote("");
    }
    setShowFollowUpModal(true);
  }, [selectedConv?.activeFollowUp]);

  const syncActiveFollowUp = useCallback((conversationId: string, activeFollowUp: Conversation["activeFollowUp"]) => {
    setConversations((previous) => previous.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, activeFollowUp } : conversation
    )));
    setSelectedConv((previous) => (
      previous?.id === conversationId ? { ...previous, activeFollowUp } : previous
    ));
  }, []);

  const saveFollowUp = useCallback(async () => {
    if (!selectedConv || isSavingFollowUp) return;
    setIsSavingFollowUp(true);
    try {
      const qs = waParams();
      const response = await fetch(`/api/whatsapp/conversations/${selectedConv.id}/follow-up${qs ? `?${qs}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: followUpDate, time: followUpTime, note: followUpNote }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível agendar o retorno");

      syncActiveFollowUp(selectedConv.id, data.followUp);
      setShowFollowUpModal(false);
      toast(selectedConv.activeFollowUp ? "Retorno reagendado." : "Retorno agendado.", "success");
      void fetchConversations({ incremental: true });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível agendar o retorno", "error");
    } finally {
      setIsSavingFollowUp(false);
    }
  }, [fetchConversations, followUpDate, followUpNote, followUpTime, isSavingFollowUp, selectedConv, syncActiveFollowUp, waParams]);

  const updateFollowUp = useCallback(async (action: "complete" | "cancel") => {
    if (!selectedConv?.activeFollowUp || isSavingFollowUp) return;
    setIsSavingFollowUp(true);
    try {
      const qs = waParams();
      const response = await fetch(`/api/whatsapp/conversations/${selectedConv.id}/follow-up${qs ? `?${qs}` : ""}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar o retorno");

      syncActiveFollowUp(selectedConv.id, null);
      setShowFollowUpModal(false);
      toast(action === "complete" ? "Retorno concluído." : "Retorno cancelado.", "success");
      void fetchConversations({ incremental: true });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível atualizar o retorno", "error");
    } finally {
      setIsSavingFollowUp(false);
    }
  }, [fetchConversations, isSavingFollowUp, selectedConv, syncActiveFollowUp, waParams]);

  const leaveBulkSelectionMode = () => {
    if (bulkFollowUpSending) return;
    setBulkSelectionMode(false);
    setBulkFollowUpComposerOpen(false);
    setIsDraggingBulkImage(false);
    setBulkSelectedConversationIds([]);
    setBulkFollowUpImage(null);
    setBulkFollowUpProgress(null);
    setBulkFollowUpConfirmOpen(false);
  };

  const loadBulkFollowUpImage = (files: File[]) => {
    if (bulkFollowUpSending) return;
    const image = files.find((file) => file.type.startsWith("image/"));
    if (!image) {
      toast("Selecione uma imagem válida.", "error");
      return;
    }
    if (image.size > WHATSAPP_MEDIA_MAX_FILE_BYTES) {
      toast("A imagem ultrapassa o limite de 100 MB.", "error");
      return;
    }
    if (files.length > 1) {
      toast("Nesta etapa, envie uma imagem por follow-up em lote.", "error");
    }

    setBulkFollowUpImage({
      id: createAttachmentId(),
      file: image,
      type: "image",
      previewUrl: URL.createObjectURL(image),
      progress: 0,
      status: "ready",
    });
  };

  const handleBulkImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length) loadBulkFollowUpImage(files);
    event.target.value = "";
  };

  const handleBulkImageDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (bulkFollowUpSending || !dragContainsFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingBulkImage(false);
    const files = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    if (files.length) loadBulkFollowUpImage(files);
  };

  const toggleBulkConversation = (conversationId: string) => {
    if (bulkFollowUpSending) return;
    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (conversation && !canReplyToConversation(conversation)) {
      toast("Esta conversa está disponível somente para consulta.", "error");
      return;
    }

    setBulkSelectedConversationIds((current) => {
      if (current.includes(conversationId)) {
        return current.filter((id) => id !== conversationId);
      }
      if (current.length >= MAX_BULK_FOLLOW_UP_CONVERSATIONS) {
        toast(`Selecione no máximo ${MAX_BULK_FOLLOW_UP_CONVERSATIONS} conversas.`, "error");
        return current;
      }
      return [...current, conversationId];
    });
  };

  const openBulkFollowUpConfirmation = () => {
    if (!bulkFollowUpDraft.trim() && !bulkFollowUpImage) {
      toast("Digite uma mensagem ou adicione uma imagem ao follow-up.", "error");
      return;
    }
    if (bulkSelectedConversationIds.length === 0) {
      toast("Selecione pelo menos uma conversa.", "error");
      return;
    }
    setBulkFollowUpConfirmOpen(true);
  };

  const sendBulkFollowUp = async () => {
    if (bulkFollowUpSending || !currentUser) return;

    const messageBody = bulkFollowUpDraft.trim();
    const selectedImage = bulkFollowUpImage;
    const conversationsById = new Map(conversationsRef.current.map((conversation) => [conversation.id, conversation]));
    const selectedConversations = bulkSelectedConversationIds
      .map((conversationId) => conversationsById.get(conversationId))
      .filter((conversation): conversation is Conversation => Boolean(conversation) && canReplyToConversation(conversation))
      .slice(0, MAX_BULK_FOLLOW_UP_CONVERSATIONS);

    if ((!messageBody && !selectedImage) || selectedConversations.length === 0) {
      setBulkFollowUpConfirmOpen(false);
      toast("Revise a mensagem e as conversas selecionadas.", "error");
      return;
    }

    const selectedIds = new Set(selectedConversations.map((conversation) => conversation.id));
    captureConversationListAnchor(selectedIds);
    setBulkFollowUpConfirmOpen(false);
    setBulkFollowUpSending(true);
    setBulkFollowUpProgress({ total: selectedConversations.length, completed: 0, sent: 0, failed: 0 });

    const failedIds: string[] = [];
    let sent = 0;
    let failed = 0;
    const query = waParams();
    const sendUrl = `/api/whatsapp/send${query ? `?${query}` : ""}`;

    try {
      for (let index = 0; index < selectedConversations.length; index += 1) {
        const conversation = selectedConversations[index];

        try {
          let imageBlobUrl: string | undefined;
          if (selectedImage) {
            setBulkFollowUpImage((current) => current?.id === selectedImage.id
              ? { ...current, status: "uploading", progress: Math.round((index / selectedConversations.length) * 100), error: undefined }
              : current);
            const uploadQuery = waParams();
            const uploadResult = await upload(
              `whatsapp/${conversation.id}/bulk-follow-up/${Date.now()}-${index}-${safeAttachmentPathName(selectedImage.file.name)}`,
              selectedImage.file,
              {
                access: "private",
                handleUploadUrl: `/api/whatsapp/media/upload${uploadQuery ? `?${uploadQuery}` : ""}`,
                clientPayload: JSON.stringify({ conversationId: conversation.id }),
                contentType: selectedImage.file.type || "image/jpeg",
                multipart: selectedImage.file.size > 20 * 1024 * 1024,
                onUploadProgress: ({ percentage }) => {
                  const aggregateProgress = Math.round(
                    ((index + (percentage / 100)) / selectedConversations.length) * 100,
                  );
                  setBulkFollowUpImage((current) => current?.id === selectedImage.id
                    ? { ...current, progress: aggregateProgress }
                    : current);
                },
              },
            );
            imageBlobUrl = uploadResult.url;
          }

          const payload: Record<string, unknown> = {
            conversationId: conversation.id,
            contactId: conversation.contact.phone,
            body: messageBody,
            type: selectedImage ? "image" : "text",
            claimConversation: true,
          };
          if (selectedImage && imageBlobUrl) {
            payload.file = imageBlobUrl;
            payload.docName = selectedImage.file.name;
            payload.mimeType = selectedImage.file.type || "image/jpeg";
            payload.fileSize = selectedImage.file.size;
          }
          if (conversation.instanceId || targetInstanceId) {
            payload.instanceId = conversation.instanceId || targetInstanceId;
          } else if (targetUserId) {
            payload.targetUserId = targetUserId;
          }

          const response = await fetch(sendUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": currentUser.id,
              "x-user-name": currentUser.name || "Operador",
            },
            body: JSON.stringify(payload),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || "Não foi possível enviar a mensagem.");
          }

          applyCallbackTrackingSnapshot(conversation.id, data.callbackTracking);
          sent += 1;
          const lastMessageAt = typeof data.message?.timestamp === "string"
            ? data.message.timestamp
            : new Date().toISOString();
          setConversations((current) => sortConversationsByActivity(current.map((item) => (
            item.id === conversation.id
              ? {
                  ...item,
                  status: "open",
                  assignedTo: currentUser.id,
                  assignedToName: currentUser.name || "Operador",
                  unreadCount: 0,
                  lastMessage: messageBody || "📷 Imagem",
                  lastMessageAt,
                }
              : item
          ))));
          setBulkSelectedConversationIds((current) => current.filter((id) => id !== conversation.id));
        } catch (error) {
          console.error("[Inbox] Falha no follow-up em lote", conversation.id, error);
          failed += 1;
          failedIds.push(conversation.id);
        }

        setBulkFollowUpProgress({
          total: selectedConversations.length,
          completed: index + 1,
          sent,
          failed,
        });
        if (selectedImage) {
          setBulkFollowUpImage((current) => current?.id === selectedImage.id
            ? { ...current, progress: Math.round(((index + 1) / selectedConversations.length) * 100) }
            : current);
        }

        if (index < selectedConversations.length - 1) {
          await waitForBulkFollowUpInterval(Boolean(selectedImage));
        }
      }

      await fetchConversations({ incremental: true });
      setBulkSelectedConversationIds(failedIds);

      if (failedIds.length === 0) {
        setBulkFollowUpDraft("");
        setBulkFollowUpImage(null);
        setBulkFollowUpComposerOpen(false);
        setBulkSelectionMode(false);
        setBulkFollowUpProgress(null);
        toast(`${sent} ${sent === 1 ? "follow-up enviado" : "follow-ups enviados"} com sucesso.`, "success");
      } else {
        if (selectedImage) {
          setBulkFollowUpImage((current) => current?.id === selectedImage.id
            ? { ...current, status: "ready", progress: 0, error: undefined }
            : current);
        }
        toast(
          `${sent} enviado(s) e ${failedIds.length} com falha. As falhas continuam selecionadas.`,
          "error",
        );
      }
    } finally {
      releaseConversationListAnchor();
      setBulkFollowUpSending(false);
    }
  };

  // ─── Filtered conversations ───────────────────────────────
  const openCount = conversationQueueCounts.open;
  const unreadCount = conversationQueueCounts.unread;

  // Etiquetas (campanhas) presentes nas conversas — alimentam o filtro.
  const availableTags = [...new Set(
    conversations.map((c) => c.campaignName).filter(Boolean) as string[]
  )].sort();

  const filtered = conversations.filter((c) => {
    // Tab filter
    if (tab === "open" && !["open", "waiting_customer", "waiting_response"].includes(c.status)) return false;
    if (tab === "unread" && c.unreadCount === 0) return false;
    if (tab === "closed" && c.status !== "closed") return false;
    if (tab === "archived" && !c.archivedAt) return false;
    if (tab === "callback" && !isConversationCallbackDue(c)) return false;
    if (tab === "followup" && !isWhatsAppFollowUpDue(c.activeFollowUp)) return false;
    if (tab === "lost" && c.status !== "lost") return false;
    // Tag (campanha) filter
    if (tagFilter.length > 0 && !tagFilter.includes(c.campaignName || "")) return false;
    return true;
  });
  const activeInstanceChannel = getInstanceChannel(selectedCollaborator);
  const isOsascoFollowUpPilotScope = activeInstanceChannel === "whatsapp" && (
    selectedCollaborator
      ? selectedCollaborator.unit === "Osasco"
        || (selectedCollaborator.unit === "Todas" && effectiveUnit === "Osasco")
      : effectiveUnit === "Osasco"
        || (!effectiveUnit && currentUser?.unit === "Osasco")
  );
  const selectedInstanceConnection = getInstanceConnectionPresentation(selectedCollaborator?.status);
  const mutedInstanceIdSet = useMemo(
    () => new Set(notificationMutes.mutedInstanceIds),
    [notificationMutes.mutedInstanceIds],
  );
  const activeNotificationInstance = selectedCollaborator
    || (inboxInstanceOptions.length === 1 ? inboxInstanceOptions[0] : null);
  const showCollaboratorInboxBanner = canViewCollaborators && !!selectedCollaborator;
  const outgoingAudioPhone = selectedCollaborator?.phone || currentUser?.phone || "";
  const outgoingAudioContact = useMemo<Contact>(() => ({
    id: `sender:${inboxScopeKey}`,
    phone: outgoingAudioPhone,
    name: selectedCollaborator ? getInstanceDisplayLabel(selectedCollaborator) : currentUser?.name || "Você",
  }), [currentUser?.name, inboxScopeKey, outgoingAudioPhone, selectedCollaborator]);
  const outgoingAudioAvatarUrl = outgoingAudioPhone ? profilePicUrlFor(outgoingAudioPhone) : undefined;
  const visibleMessageItems = useMemo(
    () => buildVisibleMessageItems(messages),
    [messages],
  );
  const handleQuotedMessageNavigation = useCallback((quotedMessageId: string) => {
    const targetItem = findVisibleMessageItemByProviderId(visibleMessageItems, quotedMessageId);
    if (!targetItem) {
      toast("A mensagem original não está no trecho carregado desta conversa.", "info");
      return;
    }

    document.getElementById(messageDomId(targetItem.id))?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    const quotedImage = findQuotedImagePreviewTarget(visibleMessageItems, quotedMessageId);
    if (quotedImage) {
      setImagePreview({
        sources: quotedImage.sources,
        index: quotedImage.index,
        title: selectedConv?.contact?.name || selectedConv?.contact?.phone || "Imagem",
      });
    }

    setHighlightedMessageItemId(targetItem.id);
    if (messageHighlightTimerRef.current !== null) {
      window.clearTimeout(messageHighlightTimerRef.current);
    }
    messageHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageItemId((current) => current === targetItem.id ? null : current);
      messageHighlightTimerRef.current = null;
    }, 1800);
  }, [selectedConv?.contact?.name, selectedConv?.contact?.phone, visibleMessageItems]);
  const activeAttachment = attachments.find((item) => item.id === activeAttachmentId) || attachments[0] || null;
  const toggleInstanceNotificationMute = useCallback(async (instance: CollaboratorInstance) => {
    const nextMuted = !mutedInstanceIdSet.has(instance.id);
    try {
      await notificationMutes.setInstanceMuted(instance.id, nextMuted);
      toast(
        nextMuted
          ? `${getInstanceDisplayLabel(instance)} foi silenciada para você.`
          : `${getInstanceDisplayLabel(instance)} voltará a emitir som para você.`,
        "success",
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Não foi possível alterar a notificação da instância.",
        "error",
      );
    }
  }, [mutedInstanceIdSet, notificationMutes]);

  // ─── UI ───────────────────────────────────────────────────
  return (
    <div
      data-inbox-thread-open={selectedConv ? "true" : "false"}
      className="absolute inset-0 flex min-h-0 overflow-hidden bg-muted/15 text-foreground"
    >
      <style jsx global>{`
        .inbox-thread-messages {
          background-color: #efeae2;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.68)),
            url('/crm-chat-pattern.svg');
          background-size: auto, 360px 360px;
        }

        .inbox-message-incoming {
          --inbox-message-bubble-color: #ffffff;
          background: var(--inbox-message-bubble-color);
          color: #111b21;
        }

        .inbox-message-outgoing {
          --inbox-message-bubble-color: #d9fdd3;
          background: var(--inbox-message-bubble-color);
          color: #111b21;
        }

        .inbox-message-tail-incoming::before,
        .inbox-message-tail-outgoing::before {
          position: absolute;
          top: 0;
          width: 0;
          height: 0;
          content: '';
        }

        .inbox-message-tail-incoming::before {
          left: -7px;
          border-top: 8px solid var(--inbox-message-bubble-color);
          border-left: 8px solid transparent;
        }

        .inbox-message-tail-outgoing::before {
          right: -7px;
          border-top: 8px solid var(--inbox-message-bubble-color);
          border-right: 8px solid transparent;
        }

        .inbox-message-timestamp-incoming,
        .inbox-message-timestamp-outgoing {
          color: #667781;
        }

        .inbox-date-divider {
          border-color: rgba(17, 27, 33, 0.08);
          background: rgba(255, 255, 255, 0.92);
          color: #54656f;
        }

        .inbox-thread-composer {
          border-color: rgba(17, 27, 33, 0.1);
          background: #f0f2f5;
        }

        .inbox-composer-field {
          background: #ffffff;
          color: #111b21;
        }

        html[data-theme="dark"] .inbox-thread-header {
          border-color: rgba(134, 150, 160, 0.16);
          background: rgba(32, 44, 51, 0.98);
        }

        html[data-theme="dark"] .inbox-thread-composer {
          border-color: rgba(134, 150, 160, 0.14);
          background: #202c33;
        }

        html[data-theme="dark"] .inbox-composer-field {
          background: #2a3942;
          color: #e9edef;
        }

        html[data-theme="dark"] .inbox-thread-messages {
          background-color: #0b141a;
          background-image:
            linear-gradient(rgba(11, 20, 26, 0.88), rgba(11, 20, 26, 0.88)),
            url('/crm-chat-pattern.svg');
        }

        html[data-theme="dark"] .inbox-message-incoming {
          --inbox-message-bubble-color: #202c33;
          color: #e9edef;
        }

        html[data-theme="dark"] .inbox-message-outgoing {
          --inbox-message-bubble-color: #005c4b;
          color: #e9edef;
        }

        html[data-theme="dark"] .inbox-message-timestamp-incoming {
          color: #8696a0;
        }

        html[data-theme="dark"] .inbox-message-timestamp-outgoing {
          color: #a7c8c0;
        }

        html[data-theme="dark"] .inbox-date-divider {
          border-color: rgba(134, 150, 160, 0.14);
          background: rgba(32, 44, 51, 0.94);
          color: #8696a0;
        }

        @media (max-width: 639px) {
          .crm-viewport-lock:has([data-inbox-thread-open="true"]) .crm-shell-header {
            display: none;
          }

          .crm-viewport-lock:has([data-inbox-thread-open="true"]) .crm-shell-content {
            padding: 0;
          }

          .inbox-thread-header {
            height: calc(4.25rem + env(safe-area-inset-top));
            padding-top: env(safe-area-inset-top);
            padding-left: max(0.75rem, env(safe-area-inset-left));
            padding-right: max(0.75rem, env(safe-area-inset-right));
          }

          .inbox-thread-messages {
            padding-left: max(0.75rem, env(safe-area-inset-left));
            padding-right: max(0.75rem, env(safe-area-inset-right));
            overscroll-behavior: contain;
          }

          .inbox-thread-composer {
            padding-left: max(0.5rem, env(safe-area-inset-left));
            padding-right: max(0.5rem, env(safe-area-inset-right));
            padding-bottom: max(0.375rem, env(safe-area-inset-bottom)) !important;
          }

          html[data-keyboard-open] .inbox-thread-composer {
            padding-bottom: 0.375rem !important;
          }

          .inbox-contact-panel {
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
          }

          .inbox-preview-header {
            height: calc(3.5rem + env(safe-area-inset-top));
            padding-top: env(safe-area-inset-top);
            padding-left: max(1rem, env(safe-area-inset-left));
            padding-right: max(1rem, env(safe-area-inset-right));
          }

          .inbox-preview-content {
            padding-left: max(1rem, env(safe-area-inset-left));
            padding-right: max(1rem, env(safe-area-inset-right));
            padding-bottom: max(1rem, env(safe-area-inset-bottom));
          }
        }
      `}</style>
      
      {/* ── LEFT: Conversation List ── */}
      <div
        className={`flex h-full w-full flex-shrink-0 flex-col border-r border-border/80 bg-card shadow-[4px_0_18px_rgba(0,0,0,0.04)] sm:w-[360px] xl:w-[390px] ${
          selectedConv || bulkFollowUpComposerOpen ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* Seletor de instância — mesma altura fixa (h-16) do cabeçalho
            do chat ao lado, para as duas linhas divisórias ficarem alinhadas. */}
        {canSwitchInboxInstance && (
          <div className="h-16 flex-shrink-0 border-b border-border/70 bg-card/80">
            <div className="relative h-full">
              <button
                onClick={() => setCollaboratorDropdownOpen((o) => !o)}
                className="flex h-full w-full items-center gap-3 px-4 transition-colors hover:bg-muted/50"
                aria-haspopup="listbox"
                aria-expanded={collaboratorDropdownOpen}
                aria-label="Trocar instância do Inbox"
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
                    {selectedCollaborator && mutedInstanceIdSet.has(selectedCollaborator.id) && (
                      <VolumeX className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Instância silenciada" />
                    )}
                    {selectedCollaborator && (
                      <>
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${selectedInstanceConnection.dotClassName}`}
                          aria-label={selectedInstanceConnection.label}
                          title={selectedInstanceConnection.label}
                        />
                        {selectedCollaborator.canReply === false && (
                          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                            Consulta
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground truncate w-full text-left">
                    {selectedCollaborator
                      ? `${activeInstanceChannel === "instagram" ? "Instagram" : "WhatsApp"} · ${selectedCollaborator.unit} · ${selectedInstanceConnection.label}`
                      : !canViewCollaborators && ownInstances.length > 1
                        ? `${ownInstances.length} instâncias · ${effectiveUnit || currentUser?.unit || "Todas"}`
                        : "WhatsApp · Principal"}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>

              {collaboratorDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCollaboratorDropdownOpen(false)} />
                  <div
                    className="absolute left-3 right-3 top-[calc(100%-8px)] z-50 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg"
                    role="listbox"
                    aria-label="Instâncias disponíveis"
                  >
                    <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Contas
                    </div>
                    <button
                      onClick={() => selectCollaborator(null)}
                      className={`flex min-h-11 w-full items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted ${
                        !selectedCollaborator ? "bg-primary/5 text-primary" : "text-foreground"
                      }`}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </div>
                      <ChannelMark channel="whatsapp" />
                      <span className="truncate">
                        {canViewCollaborators ? "Meu Inbox" : "Todas as minhas contas"}
                      </span>
                      {!selectedCollaborator && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                    </button>
                    {inboxInstanceOptions.length > 0 && <div className="my-1 border-t border-border" />}
                    <div className="max-h-60 overflow-y-auto">
                      {inboxInstanceOptions.map((collab) => {
                        const label = getInstanceDisplayLabel(collab);
                        const channel = getInstanceChannel(collab);
                        const connection = getInstanceConnectionPresentation(collab.status);
                        const isEditing = editingInstanceId === collab.id;
                        const isSavingChannel = savingInstanceChannelId === collab.id;

                        return (
                          <div
                            key={collab.id}
                            onClick={() => {
                              if (!isEditing) selectCollaborator(collab.userId, collab);
                            }}
                            className={`group flex min-h-11 w-full gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted ${
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
                                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                          : "border-border text-muted-foreground hover:bg-muted hover:text-emerald-700 dark:hover:text-emerald-400"
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
                                          ? "border-pink-500/40 bg-pink-500/15 text-pink-700 dark:text-pink-400"
                                          : "border-border text-muted-foreground hover:bg-muted hover:text-pink-700 dark:hover:text-pink-400"
                                      }`}
                                      title="Marcar como Instagram"
                                    >
                                      <ChannelIcon channel="instagram" className="h-3.5 w-3.5" />
                                      Instagram
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <span className="truncate font-medium">{label}</span>
                                    {collab.isShared && (
                                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                                        Equipe
                                      </span>
                                    )}
                                    {collab.canReply === false && (
                                      <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                        Consulta
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className={`mt-0.5 block truncate text-[10px] ${
                                      connection.label === "Desconectado"
                                        ? "text-red-600 dark:text-red-400"
                                        : connection.label === "Conectando"
                                          ? "text-amber-600 dark:text-amber-400"
                                          : "text-muted-foreground"
                                    }`}
                                  >
                                    {collab.unit} · {connection.historyLabel}
                                  </span>
                                </>
                              )}
                            </div>

                            {isEditing && isAdmin ? (
                              <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  disabled={savingInstanceName}
                                  onClick={() => saveInstanceName(collab)}
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
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
                              <div className="ml-auto flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  disabled={notificationMutes.savingInstanceIds.includes(collab.id)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void toggleInstanceNotificationMute(collab);
                                  }}
                                  aria-pressed={mutedInstanceIdSet.has(collab.id)}
                                  aria-label={mutedInstanceIdSet.has(collab.id) ? `Reativar som de ${label}` : `Silenciar ${label}`}
                                  title={mutedInstanceIdSet.has(collab.id) ? "Reativar som desta instância" : "Silenciar esta instância"}
                                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-wait disabled:opacity-50 sm:h-8 sm:w-8 ${
                                    mutedInstanceIdSet.has(collab.id)
                                      ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
                                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                  }`}
                                >
                                  {notificationMutes.savingInstanceIds.includes(collab.id) ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : mutedInstanceIdSet.has(collab.id) ? (
                                    <VolumeX className="h-4 w-4" />
                                  ) : (
                                    <Volume2 className="h-4 w-4" />
                                  )}
                                </button>
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
                                <span
                                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${connection.dotClassName}`}
                                  aria-label={connection.label}
                                  title={connection.historyLabel}
                                />
                              </div>
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
                    {openCount} em aberto
                  </span>
                )}
                {activeNotificationInstance && (
                  <button
                    type="button"
                    disabled={notificationMutes.savingInstanceIds.includes(activeNotificationInstance.id)}
                    onClick={() => void toggleInstanceNotificationMute(activeNotificationInstance)}
                    aria-pressed={mutedInstanceIdSet.has(activeNotificationInstance.id)}
                    aria-label={
                      mutedInstanceIdSet.has(activeNotificationInstance.id)
                        ? `Reativar som de ${getInstanceDisplayLabel(activeNotificationInstance)}`
                        : `Silenciar ${getInstanceDisplayLabel(activeNotificationInstance)}`
                    }
                    title={mutedInstanceIdSet.has(activeNotificationInstance.id) ? "Reativar som desta instância" : "Silenciar esta instância"}
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-wait disabled:opacity-50 sm:h-8 sm:w-8 ${
                      mutedInstanceIdSet.has(activeNotificationInstance.id)
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                    }`}
                  >
                    {notificationMutes.savingInstanceIds.includes(activeNotificationInstance.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : mutedInstanceIdSet.has(activeNotificationInstance.id) ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                )}
                {activeInstanceChannel === "whatsapp" && (
                  <button
                    type="button"
                    onClick={() => setShowNewConversationDialog(true)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400 sm:h-8 sm:w-8"
                    title="Nova conversa"
                    aria-label="Nova conversa"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {isOsascoFollowUpPilotScope && (
              <button
                type="button"
                onClick={() => router.push(buildUrl("/crm/inbox/follow-up", {
                  scopeLabel: selectedCollaborator
                    ? getInstanceDisplayLabel(selectedCollaborator)
                    : "Meu Inbox",
                }))}
                className="mb-3 flex min-h-11 w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 text-left transition-colors hover:border-emerald-500/35 hover:bg-emerald-500/12"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                  <ListChecks className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-black text-foreground">Central de Follow-up</span>
                  <span className="block truncate text-[10px] text-muted-foreground">Piloto Osasco · priorize a fila vencida</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setBulkSelectedConversationIds([]);
                }}
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
              { key: "followup" as const, label: "Retornos", count: conversationQueueCounts.followup },
              { key: "callback" as const, label: "Rechamada", count: conversationQueueCounts.callback },
              { key: "lost" as const, label: "Perdidos", count: conversationQueueCounts.lost },
              { key: "archived" as const, label: "Arquivadas", count: undefined },
            ]).map(({ key, label, count }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    const currentServerStatus = serverConversationStatusForTab(tab);
                    const nextServerStatus = serverConversationStatusForTab(key);
                    if ((tab === "archived") !== (key === "archived") || currentServerStatus !== nextServerStatus) {
                      leaveConversation(key === "archived" ? { archived: "1" } : undefined);
                    }
                    setTab(key);
                    setBulkSelectedConversationIds([]);
                    if (key === "archived") setBulkSelectionMode(false);
                  }}
                  aria-pressed={active}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors sm:min-h-8 ${
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
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            {availableTags.length > 0 && (
              <button
                type="button"
                onClick={() => setTagFilterOpen((open) => !open)}
                aria-expanded={tagFilterOpen}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors sm:min-h-8 ${
                  tagFilter.length > 0
                    ? "border-primary/30 bg-primary/12 text-primary"
                    : "border-border/80 bg-background/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Tag className="h-3.5 w-3.5" />
                Campanhas
                {tagFilter.length > 0 && (
                  <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary">
                    {tagFilter.length}
                  </span>
                )}
              </button>
            )}

            {activeInstanceChannel === "whatsapp" && tab !== "archived" && activeScopeCanReply && (
              <button
                type="button"
                onClick={() => {
                  if (bulkSelectionMode) {
                    leaveBulkSelectionMode();
                    return;
                  }
                  leaveConversation();
                  setBulkSelectionMode(true);
                  setBulkSelectedConversationIds([]);
                  setBulkFollowUpProgress(null);
                }}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors sm:min-h-8 ${
                  bulkSelectionMode
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/80 bg-background/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <ListChecks className="h-3.5 w-3.5" />
                {bulkSelectionMode ? "Cancelar seleção" : "Selecionar"}
              </button>
            )}
          </div>

          {/* Filtro por etiqueta (campanha) */}
          {availableTags.length > 0 && tagFilterOpen && (
            <div className="relative z-50 h-0">
              <div className="fixed inset-0 z-40" onClick={() => setTagFilterOpen(false)} />
              <div className="absolute left-4 right-4 top-0 z-50 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Filtrar por campanha
                  </span>
                  {tagFilter.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTagFilter([]);
                        setBulkSelectedConversationIds([]);
                      }}
                      className="text-[11px] font-semibold text-primary hover:text-primary/80"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                {availableTags.map((tag) => {
                  const active = tagFilter.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setTagFilter((current) => (
                          active ? current.filter((item) => item !== tag) : [...current, tag]
                        ));
                        setBulkSelectedConversationIds([]);
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted sm:min-h-9"
                    >
                      <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${active ? "border-primary bg-primary" : "border-border"}`}>
                        {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </span>
                      <span className={`inline-flex min-w-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${campaignTagStyle(tag)}`}>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
                        <span className="truncate">{tag}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* List */}
        <div
          ref={conversationListViewportRef}
          className="flex-1 overflow-y-auto"
          onScroll={handleConversationListScroll}
        >
          {conversationListLoading && filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              <span>{conversationSearch ? "Buscando em todas as conversas…" : "Carregando conversas…"}</span>
            </div>
          ) : conversationListError && filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center" role="alert">
              <XCircle className="h-7 w-7 text-red-500" aria-hidden="true" />
              <p className="max-w-xs text-sm text-red-700 dark:text-red-400">{conversationListError}</p>
              <button
                type="button"
                onClick={() => void fetchConversations({ phase: "initial" })}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Tentar novamente
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                {tab === "archived" ? (
                  <Archive className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <MessageSquare className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {conversationSearchTooShort
                  ? "Digite ao menos 3 letras ou 4 números"
                  : search || tagFilter.length > 0
                    ? "Nenhuma conversa encontrada"
                  : tab === "archived"
                    ? "Nenhuma conversa arquivada"
                    : "Nenhuma conversa ainda"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-2">
              {filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={selectedConv?.id === conv.id}
                  selectionMode={bulkSelectionMode}
                  isSelected={bulkSelectedConversationIds.includes(conv.id)}
                  channel={activeInstanceChannel}
                  slaClockNow={slaClockNow}
                  onClick={() => {
                    selectConversation(conv);
                  }}
                  onToggleSelection={() => toggleBulkConversation(conv.id)}
                />
              ))}
            </div>
          )}

          {conversationListError && filtered.length > 0 && (
            <div className="mx-4 my-3 flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400" role="alert">
              <span className="min-w-0 flex-1">{conversationListError}</span>
              <button
                type="button"
                onClick={() => void fetchConversations({ phase: "refresh" })}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-red-500/25 px-2.5 font-semibold transition-colors hover:bg-red-500/10"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Tentar novamente
              </button>
            </div>
          )}

          {hasMoreConversations && (
            <div className="flex flex-col items-center gap-2 px-4 py-4">
              {conversationLoadError && (
                <p className="text-center text-xs text-red-700 dark:text-red-400">{conversationLoadError}</p>
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

        {bulkSelectionMode && (
          <div className="shrink-0 border-t border-border/70 bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] lg:hidden">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Follow-up em lote</p>
                <p className="text-[10px] text-muted-foreground">
                  {bulkSelectedConversationIds.length} de {MAX_BULK_FOLLOW_UP_CONVERSATIONS} selecionadas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkFollowUpComposerOpen(true)}
                disabled={bulkSelectedConversationIds.length === 0}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Escrever mensagem
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── CENTER: Message Thread ── */}
      <div
        className={`relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background ${
          selectedConv || bulkFollowUpComposerOpen ? "flex" : "hidden lg:flex"
        }`}
        onDragEnter={bulkSelectionMode ? undefined : handleAttachmentDragEnter}
        onDragOver={bulkSelectionMode ? undefined : handleAttachmentDragOver}
        onDragLeave={bulkSelectionMode ? undefined : handleAttachmentDragLeave}
        onDrop={bulkSelectionMode ? undefined : handleAttachmentDrop}
      >
        {bulkSelectionMode ? (
          <div
            className="flex h-full min-h-0 flex-col bg-background"
            onDragEnter={(event) => {
              if (bulkFollowUpSending || !dragContainsFiles(event)) return;
              event.preventDefault();
              event.stopPropagation();
              setIsDraggingBulkImage(true);
            }}
            onDragOver={(event) => {
              if (bulkFollowUpSending || !dragContainsFiles(event)) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(event) => {
              if (!isDraggingBulkImage) return;
              event.preventDefault();
              event.stopPropagation();
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsDraggingBulkImage(false);
              }
            }}
            onDrop={handleBulkImageDrop}
          >
            <div className="flex h-[68px] shrink-0 items-center gap-2 border-b border-border/70 bg-card/95 px-3 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur sm:h-16 sm:px-5">
              <button
                type="button"
                onClick={() => setBulkFollowUpComposerOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted lg:hidden"
                aria-label="Voltar para a seleção"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-foreground">Follow-up em lote</p>
                <p className="text-xs text-muted-foreground">
                  {bulkSelectedConversationIds.length} de {MAX_BULK_FOLLOW_UP_CONVERSATIONS} conversas selecionadas
                </p>
              </div>
              <button
                type="button"
                onClick={leaveBulkSelectionMode}
                disabled={bulkFollowUpSending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label="Cancelar follow-up em lote"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
              {isDraggingBulkImage && (
                <div className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm sm:inset-6 lg:inset-8">
                  <div className="flex flex-col items-center gap-2 text-primary">
                    <UploadCloud className="h-9 w-9" />
                    <span className="text-sm font-semibold">Solte a imagem aqui</span>
                  </div>
                </div>
              )}

              <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
                <div>
                  <p className="text-sm font-semibold text-foreground">Mensagem para os contatos selecionados</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Cada envio é individual. Imagens usam um intervalo maior para proteger a estabilidade da instância.
                  </p>
                </div>

                {bulkFollowUpImage ? (
                  <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                    <div
                      className="aspect-[16/9] max-h-72 w-full bg-muted bg-cover bg-center"
                      style={{ backgroundImage: `url(${bulkFollowUpImage.previewUrl})` }}
                      role="img"
                      aria-label={`Prévia de ${bulkFollowUpImage.file.name}`}
                    />
                    <div className="flex items-center gap-3 border-t border-border px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{bulkFollowUpImage.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {bulkFollowUpImage.status === "uploading"
                            ? `Enviando arquivo · ${bulkFollowUpImage.progress}%`
                            : bulkFollowUpImage.status === "error"
                              ? bulkFollowUpImage.error || "Falha no upload"
                              : formatAttachmentSize(bulkFollowUpImage.file.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBulkFollowUpImage(null)}
                        disabled={bulkFollowUpSending}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        aria-label="Remover imagem"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {bulkFollowUpImage.status === "uploading" && (
                      <div className="h-1.5 bg-muted">
                        <div className="h-full bg-primary transition-[width]" style={{ width: `${bulkFollowUpImage.progress}%` }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => bulkFileInputRef.current?.click()}
                    disabled={bulkFollowUpSending}
                    className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 px-5 py-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                  >
                    <UploadCloud className="h-7 w-7 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Adicionar imagem</span>
                    <span className="text-xs text-muted-foreground">Clique ou arraste uma imagem para esta área</span>
                  </button>
                )}
                <input
                  ref={bulkFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBulkImageSelect}
                />

                <textarea
                  value={bulkFollowUpDraft}
                  onChange={(event) => setBulkFollowUpDraft(event.target.value)}
                  disabled={bulkFollowUpSending}
                  rows={7}
                  maxLength={4096}
                  lang="pt-BR"
                  spellCheck
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  placeholder="Digite a mensagem que será enviada para os chats selecionados..."
                  className="min-h-44 w-full resize-y rounded-2xl border border-border bg-card px-4 py-3 text-[15px] leading-6 text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                />

                {bulkFollowUpProgress && (
                  <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <span>{bulkFollowUpProgress.completed} de {bulkFollowUpProgress.total}</span>
                      <span>
                        {bulkFollowUpProgress.sent} enviados
                        {bulkFollowUpProgress.failed > 0 ? ` · ${bulkFollowUpProgress.failed} falharam` : ""}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: `${(bulkFollowUpProgress.completed / bulkFollowUpProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-border/70 bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
              <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSavedReplyDialogTarget("bulk");
                    setShowSavedRepliesDialog(true);
                  }}
                  disabled={bulkFollowUpSending}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <MessageSquareText className="h-4 w-4" />
                  <span className="hidden sm:inline">Resposta rápida</span>
                </button>
                <button
                  type="button"
                  onClick={() => bulkFileInputRef.current?.click()}
                  disabled={bulkFollowUpSending}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <UploadCloud className="h-4 w-4" />
                  <span className="hidden sm:inline">Imagem</span>
                </button>
                <button
                  type="button"
                  onClick={openBulkFollowUpConfirmation}
                  disabled={bulkFollowUpSending || bulkSelectedConversationIds.length === 0 || (!bulkFollowUpDraft.trim() && !bulkFollowUpImage)}
                  className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkFollowUpSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {bulkFollowUpSending ? "Enviando..." : `Revisar envio para ${bulkSelectedConversationIds.length || 0}`}
                </button>
              </div>
            </div>
          </div>
        ) : selectedConv ? (
          <>
            {/* Banner admin no topo do thread */}
            {showCollaboratorInboxBanner && (
              <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-sm lg:hidden">
                <Eye className="h-4 w-4 text-amber-800 dark:text-amber-400" />
                <span className="text-amber-600 dark:text-amber-400">
                  Inbox de <strong>{getInstanceDisplayLabel(selectedCollaborator)}</strong>
                </span>
                <button
                  onClick={clearTargetUser}
                  className="ml-auto text-xs text-amber-800 hover:underline dark:text-amber-400"
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
                  onClick={() => leaveConversation(archivedView ? { archived: "1" } : undefined)}
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
                  <span className="flex min-w-0 flex-col text-left">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-base font-semibold leading-tight text-foreground sm:text-[15px]">
                        {displayContactName(selectedConv.contact)}
                      </span>
                      {selectedConv.campaignAccountOrigin === "secondary" && <SecondaryMetaAccountBadge />}
                      {selectedConv.blockedAt && (
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                          title="Contato bloqueado"
                        >
                          <Ban className="h-3 w-3" />
                        </span>
                      )}
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

                {selectedConv.blockedAt && (
                  <span className="hidden h-8 items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 text-xs font-medium text-destructive sm:flex">
                    <Ban className="h-3.5 w-3.5" />
                    Bloqueado
                  </span>
                )}

                {!canReplyToSelectedConversation && (
                  <span className="hidden h-8 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-medium text-amber-700 dark:text-amber-300 sm:flex">
                    <Eye className="h-3.5 w-3.5" />
                    Somente consulta
                  </span>
                )}

                {!selectedConv.blockedAt && evaluationConfirmation?.visible && (
                  <button
                    type="button"
                    onClick={() => void handleSendEvaluationConfirmation()}
                    disabled={isSendingEvaluationConfirmation || evaluationConfirmation.alreadySent}
                    aria-label={evaluationConfirmation.alreadySent ? "Confirmação já enviada" : "Enviar confirmação da avaliação"}
                    title={evaluationConfirmation.alreadySent ? "Confirmação já enviada" : "Enviar confirmação da avaliação"}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors sm:h-8 sm:w-auto sm:gap-2 sm:px-3 ${
                      evaluationConfirmation.alreadySent
                        ? "cursor-default border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                    } disabled:opacity-80`}
                  >
                    {isSendingEvaluationConfirmation ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : evaluationConfirmation.alreadySent ? (
                      <CheckCheck className="h-4 w-4" />
                    ) : (
                      <CalendarDays className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">
                      {evaluationConfirmation.alreadySent ? "Enviado" : "Confirmar"}
                    </span>
                  </button>
                )}

                {!selectedConv.blockedAt && canReplyToSelectedConversation && (
                  <button
                    type="button"
                    onClick={() => setShowEvaluationAvailabilityDialog(true)}
                    className="hidden h-8 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/15 lg:flex"
                    title="Consultar e enviar horários livres"
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    Horários
                  </button>
                )}

                <button
                  ref={internalNotesTriggerRef}
                  type="button"
                  onClick={() => setInternalNotesOpen(true)}
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-800 transition-colors hover:bg-amber-500/15 dark:text-amber-300 sm:h-8 sm:w-auto sm:gap-2 sm:px-3"
                  aria-label={`Abrir notas internas${internalNotes.length ? `, ${internalNotes.length} salvas` : ""}`}
                  title="Notas internas — visíveis somente para a equipe"
                >
                  <MessageSquareText className="h-4 w-4" />
                  <span className="hidden sm:inline">Notas</span>
                  {internalNotes.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-black sm:static sm:h-4">
                      {internalNotes.length > 99 ? "99+" : internalNotes.length}
                    </span>
                  )}
                </button>

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
                        {canReplyToSelectedConversation ? (
                          <>
                            <button
                              onClick={() => {
                                setShowEvaluationAvailabilityDialog(true);
                                setKebabOpen(false);
                              }}
                              className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                            >
                              <CalendarDays className="h-4 w-4 text-muted-foreground" />
                              Enviar disponibilidade
                            </button>

                            <button
                              onClick={() => { setEvoSignal((s) => s + 1); setKebabOpen(false); }}
                              className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                            >
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              Adicionar observação
                            </button>

                            <button
                              onClick={() => { openFollowUpModal(); setKebabOpen(false); }}
                              className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                            >
                              <Clock3 className="h-4 w-4 text-muted-foreground" />
                              {selectedConv?.activeFollowUp ? "Reagendar retorno" : "Agendar retorno"}
                            </button>

                            <button
                              onClick={() => { void handleMarkConversationUnread(); setKebabOpen(false); }}
                              disabled={isMarkingUnread}
                              className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isMarkingUnread ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : (
                                <Mail className="h-4 w-4 text-muted-foreground" />
                              )}
                              Marcar como não lida
                            </button>

                            <button
                              onClick={() => {
                                void handleArchiveConversation(!selectedConv?.archivedAt);
                                setKebabOpen(false);
                              }}
                              disabled={isArchivingConversation}
                              className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isArchivingConversation ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : selectedConv?.archivedAt ? (
                                <ArchiveRestore className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Archive className="h-4 w-4 text-muted-foreground" />
                              )}
                              {selectedConv?.archivedAt ? "Restaurar conversa" : "Arquivar conversa"}
                            </button>

                            <div className="my-1 h-px bg-border" />

                            {selectedConv && selectedConv.status !== 'resolved' && selectedConv.status !== 'closed' ? (
                              <button
                                onClick={() => { setShowCloseModal(true); setKebabOpen(false); }}
                                className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10"
                              >
                                <Check className="h-4 w-4" />
                                Finalizar conversa
                              </button>
                            ) : (
                              <button
                                onClick={() => { handleReopenConversation(); setKebabOpen(false); }}
                                className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                              >
                                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                Reabrir conversa
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="mx-2 my-1 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
                            <Eye className="mt-0.5 h-4 w-4 shrink-0" />
                            Histórico disponível para consulta. O bloqueio do contato continua disponível abaixo.
                          </div>
                        )}

                        {selectedConv && (
                          <>
                            <div className="my-1 h-px bg-border" />
                            <button
                              onClick={() => { setShowBlockModal(true); setKebabOpen(false); }}
                              disabled={isUpdatingContactBlock}
                              className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                selectedConv.blockedAt
                                  ? "text-foreground hover:bg-muted"
                                  : "text-destructive hover:bg-destructive/10"
                              }`}
                            >
                              {isUpdatingContactBlock ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Ban className="h-4 w-4" />
                              )}
                              {selectedConv.blockedAt ? "Desbloquear contato" : "Bloquear contato"}
                            </button>
                          </>
                        )}

                        {/* Excluir — apenas ADMINISTRADOR */}
                        {isAdmin && selectedConv && (
                          <>
                            <div className="my-1 h-px bg-border" />
                            <button
                              onClick={() => { setShowDeleteModal(true); setKebabOpen(false); }}
                              className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
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
            <div ref={messagesViewportRef} className="inbox-thread-messages min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Carregando mensagens...</p>
                  </div>
                </div>
              ) : messageLoadError ? (
                <div className="flex h-full items-center justify-center px-4">
                  <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center sm:p-6">
                    <AlertTriangle className="h-7 w-7 text-destructive" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">Não foi possível carregar as mensagens</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{messageLoadError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMessageReloadKey((current) => current + 1)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Tentar novamente
                    </button>
                  </div>
                </div>
              ) : visibleMessageItems.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                </div>
              ) : (
                visibleMessageItems.map((item, idx) => {
                  const msg = item.message;
                  const prevMsg = idx > 0 ? visibleMessageItems[idx - 1].message : undefined;
                  const showDateDivider = !prevMsg || messageDateKey(prevMsg.timestamp) !== messageDateKey(msg.timestamp);
                  const dateDivider = showDateDivider ? (
                    <div className="flex justify-center px-4 py-2.5">
                      <span className="inbox-date-divider rounded-lg border px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm">
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

                  const operatorChanged = Boolean(msg.fromMe && prevMsg?.fromMe &&
                    msg.respondedBy && prevMsg.respondedBy &&
                    msg.respondedBy !== prevMsg.respondedBy);
                  const showOperatorName = msg.fromMe && msg.respondedByName && (
                    !prevMsg?.fromMe || prevMsg?.respondedBy !== msg.respondedBy
                  );
                  const showMessageTail = showDateDivider || !prevMsg || prevMsg.type === "handoff_divider" ||
                    prevMsg.fromMe !== msg.fromMe || operatorChanged;
                  const audioAvatarContact = msg.fromMe ? outgoingAudioContact : selectedConv.contact;
                  const audioAvatarFetchUrl = msg.fromMe
                    ? outgoingAudioAvatarUrl
                    : profilePicUrlFor(selectedConv.contact.phone);

                  return (
                    <React.Fragment key={item.id || idx}>
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
                        albumImages={item.kind === "album" ? item.images : undefined}
                        canReact={canReplyToSelectedConversation}
                        onReply={handleReplyMessage}
                        onReact={handleMessageReaction}
                        onCopy={handleCopyMessage}
                        onEdit={openEditMessage}
                        onDelete={deleteMessageForEveryone}
                        onOpenImage={(src, gallery) => {
                          const sources = gallery?.length ? gallery : [src];
                          setImagePreview({
                            sources,
                            index: Math.max(0, sources.indexOf(src)),
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
                        onQuotedMessageClick={handleQuotedMessageNavigation}
                        showTail={showMessageTail}
                        audioAvatarContact={audioAvatarContact}
                        audioAvatarFetchUrl={audioAvatarFetchUrl}
                        onAudioPlaybackChange={handleAudioPlaybackChange}
                        quotedContactLabel={selectedConv.contact.name || selectedConv.contact.phone}
                        mediaInstanceId={selectedConv.instanceId || targetInstanceId || undefined}
                        domId={messageDomId(item.id)}
                        isHighlighted={highlightedMessageItemId === item.id}
                      />
                    </React.Fragment>
                  );
                })
              )}
              <div aria-hidden="true" />
            </div>

            {isDraggingAttachment && attachments.length < WHATSAPP_MEDIA_MAX_BATCH_FILES && (
              <div
                className={`pointer-events-none absolute inset-x-3 bottom-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/70 bg-background/92 shadow-2xl backdrop-blur-sm sm:inset-x-5 sm:bottom-5 ${
                  showCollaboratorInboxBanner ? "top-[108px] lg:top-[72px]" : "top-[72px] sm:top-[68px]"
                }`}
                aria-live="polite"
              >
                <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <UploadCloud className="h-7 w-7" />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-foreground">Solte os arquivos para anexar</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Imagens, vídeos, áudios, PDFs e documentos
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Attachment Preview Overlay */}
            {activeAttachment && (
              <div
                className={`absolute inset-x-0 bottom-0 z-50 flex flex-col bg-background/97 backdrop-blur-md ${
                  showCollaboratorInboxBanner ? "top-[104px] lg:top-[68px]" : "top-[68px] sm:top-16"
                }`}
              >
                <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-card/95 px-3 sm:px-5">
                  <button
                    type="button"
                    onClick={clearAttachments}
                    disabled={isSending}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-9 sm:w-9"
                    aria-label="Fechar pré-visualização"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {attachments.length === 1 ? activeAttachment.file.name : `${attachments.length} arquivos selecionados`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {activeAttachment.status === "uploading"
                        ? `Carregando ${activeAttachment.progress}%`
                        : activeAttachment.status === "sending"
                          ? "Enviando ao WhatsApp..."
                          : activeAttachment.error || formatAttachmentSize(activeAttachment.file.size)}
                    </p>
                  </div>
                  {attachments.length < WHATSAPP_MEDIA_MAX_BATCH_FILES && !isSending && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 sm:h-9"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar
                    </button>
                  )}
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-6">
                  {activeAttachment.type === "image" ? (
                    <img src={activeAttachment.previewUrl} alt="Prévia do anexo" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
                  ) : activeAttachment.type === "video" ? (
                    <video
                      src={activeAttachment.previewUrl}
                      controls
                      preload="metadata"
                      playsInline
                      className="max-h-full max-w-full rounded-lg bg-black object-contain shadow-2xl"
                      aria-label={`Prévia de ${activeAttachment.file.name || "vídeo"}`}
                    />
                  ) : activeAttachment.type === "audio" ? (
                    <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-7">
                      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Mic className="h-9 w-9" />
                      </span>
                      <div className="min-w-0 text-center">
                        <h3 className="max-w-[75vw] truncate text-base font-semibold text-foreground sm:max-w-sm sm:text-lg">
                          {activeAttachment.file.name || "Áudio colado"}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Será enviado como mensagem de voz · {formatAttachmentSize(activeAttachment.file.size)}
                        </p>
                      </div>
                      <audio
                        src={activeAttachment.previewUrl}
                        controls
                        preload="metadata"
                        className="w-full"
                        aria-label={`Prévia de ${activeAttachment.file.name || "áudio colado"}`}
                      />
                    </div>
                  ) : activeAttachment.file.type === "application/pdf" || activeAttachment.file.name.toLowerCase().endsWith(".pdf") ? (
                    <embed src={activeAttachment.previewUrl} type="application/pdf" className="h-full w-full max-w-4xl rounded-lg bg-white shadow-xl" />
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-muted sm:h-28 sm:w-28">
                        <FileText className="h-12 w-12 text-muted-foreground sm:h-14 sm:w-14" />
                      </div>
                      <div className="text-center">
                        <h3 className="max-w-[80vw] truncate text-base font-semibold text-foreground sm:max-w-sm sm:text-lg">{activeAttachment.file.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{formatAttachmentSize(activeAttachment.file.size)}</p>
                      </div>
                    </div>
                  )}
                </div>
                {attachments.length > 1 && (
                  <div className="shrink-0 overflow-x-auto border-t border-border/60 bg-card/70 px-3 py-2 sm:px-5">
                    <div className="mx-auto flex w-max max-w-full gap-2">
                      {attachments.map((item) => (
                        <div key={item.id} className="relative shrink-0">
                          <button
                            type="button"
                            onClick={() => setActiveAttachmentId(item.id)}
                            className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border-2 bg-muted transition-colors sm:h-20 sm:w-20 ${
                              item.id === activeAttachment.id ? "border-primary" : item.status === "error" ? "border-destructive" : "border-transparent"
                            }`}
                            aria-label={`Visualizar ${item.file.name}`}
                          >
                            {item.type === "image" ? (
                              <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                            ) : item.type === "video" ? (
                              <Video className="h-7 w-7 text-primary" />
                            ) : item.type === "audio" ? (
                              <Mic className="h-7 w-7 text-primary" />
                            ) : (
                              <FileText className="h-7 w-7 text-muted-foreground" />
                            )}
                            {(item.status === "uploading" || item.status === "sending") && (
                              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-bold text-white">
                                {item.status === "uploading" ? `${item.progress}%` : <Loader2 className="h-4 w-4 animate-spin" />}
                              </span>
                            )}
                          </button>
                          {!isSending && (
                            <button
                              type="button"
                              onClick={() => removeAttachment(item.id)}
                              className="absolute -right-1.5 -top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background shadow-md sm:h-7 sm:w-7"
                              aria-label={`Remover ${item.file.name}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="inbox-thread-composer shrink-0 border-t px-3 py-2 sm:px-5 sm:py-3">
                  <div className="mx-auto max-w-3xl">
                    {replyingTo && (
                      <div className="inbox-composer-field mb-1 flex items-stretch overflow-hidden rounded-lg shadow-sm">
                        <div className="w-1 shrink-0 bg-[#00a884]" />
                        <div className="min-w-0 flex-1 px-3 py-1.5">
                          <div className="text-[11px] font-semibold text-[#00a884]">
                            Respondendo {replyingTo.fromMe ? "você" : selectedConv?.contact?.name || selectedConv?.contact?.phone || "contato"}
                          </div>
                          <div className="truncate text-[11px] leading-4 text-muted-foreground">
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
                    <div className="inbox-composer-field flex min-h-12 items-center rounded-xl px-2 shadow-sm">
                      <div className="flex min-w-0 flex-1 items-center px-2 py-2">
                      {attachments.some((item) => item.type !== "audio") ? (
                        <input
                          className="min-w-0 flex-1 bg-transparent text-[15px] text-inherit outline-none placeholder:text-[#667781] dark:placeholder:text-[#8696a0]"
                          placeholder="Adicione uma legenda"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onPaste={handleComposerPaste}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(e as any); } }}
                          disabled={isSending}
                          autoFocus
                        />
                      ) : (
                        <p className="truncate text-xs text-muted-foreground">
                          Mensagem de voz sem legenda{newMessage.trim() ? " · seu texto continuará salvo" : ""}
                        </p>
                      )}
                      </div>
                      <button
                        type="button"
                        onClick={handleSendMessage as any}
                        disabled={isSending}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition-colors hover:bg-[#06a17f] disabled:opacity-50 sm:h-10 sm:w-10"
                        aria-label={attachments.length > 1 ? `Enviar ${attachments.length} arquivos` : "Enviar anexo"}
                      >
                        {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="ml-0.5 h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Botão Iniciar Atendimento — se a conversa não tem atendente */}
            {selectedConversationNeedsStart && (
              <div className="shrink-0 border-t border-border bg-gradient-to-r from-primary/5 to-primary/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Atendimento ainda não iniciado</p>
                    <p className="text-xs text-muted-foreground">Inicie o atendimento para marcar as mensagens como lidas e responder.</p>
                  </div>
                  <button
                    onClick={handleStartService}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg sm:w-auto sm:hover:scale-105"
                  >
                    <Play className="h-4 w-4" />
                    Iniciar Atendimento
                  </button>
                </div>
              </div>
            )}

            {selectedConv.activeFollowUp && !selectedConversationNeedsStart && (
              <div className="shrink-0 border-t border-border px-2 py-2 sm:px-5">
                <div className={`mx-auto flex max-w-3xl flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center ${
                  isWhatsAppFollowUpDue(selectedConv.activeFollowUp)
                    ? "border-red-500/30 bg-red-500/10"
                    : "border-indigo-500/25 bg-indigo-500/10"
                }`}>
                  <Clock3 className={`h-4 w-4 shrink-0 ${
                    isWhatsAppFollowUpDue(selectedConv.activeFollowUp) ? "text-red-600" : "text-indigo-600"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      {isWhatsAppFollowUpDue(selectedConv.activeFollowUp) ? "Retorno pendente" : "Retorno agendado"}
                      {" · "}{formatFollowUpSchedule(selectedConv.activeFollowUp.scheduledAt)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={selectedConv.activeFollowUp.note}>
                      {selectedConv.activeFollowUp.note} · {selectedConv.activeFollowUp.assignedToName}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={openFollowUpModal}
                      className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted sm:flex-none"
                    >
                      Reagendar
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateFollowUp("complete")}
                      disabled={isSavingFollowUp}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:flex-none"
                    >
                      {isSavingFollowUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Concluir
                    </button>
                  </div>
                </div>
              </div>
            )}



            {/* Input Bar */}
            {selectedConv.blockedAt ? (
              <div className="inbox-thread-composer shrink-0 border-t px-3 py-2.5 sm:px-5 sm:py-3">
                <div className="mx-auto flex min-h-12 max-w-3xl items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-destructive shadow-sm">
                  <Ban className="h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Contato bloqueado</p>
                    <p className="text-xs leading-5 opacity-90">As mensagens estão desativadas nesta instância. Use o menu para desbloquear.</p>
                  </div>
                </div>
              </div>
            ) : !canReplyToSelectedConversation ? (
              <div className="inbox-thread-composer shrink-0 border-t px-3 py-2.5 sm:px-5 sm:py-3">
                <div className="mx-auto flex min-h-12 max-w-3xl items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-amber-800 shadow-sm dark:text-amber-300">
                  <Eye className="h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Histórico em modo de consulta</p>
                    <p className="text-xs leading-5 opacity-90">A responsável atual pode responder, assumir e organizar esta conversa.</p>
                  </div>
                </div>
              </div>
            ) : selectedConversationNeedsStart ? null : (
            <div className="inbox-thread-composer shrink-0 border-t px-2 py-1.5 sm:px-3 sm:py-2.5">
              {composerHasFormatting && !isRecording && (
                <div
                  className="inbox-composer-field mb-1 overflow-hidden rounded-lg border border-black/5 shadow-sm dark:border-white/5"
                  aria-label="Prévia formatada da mensagem"
                  aria-live="polite"
                >
                  <div className="border-b border-black/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#667781] dark:border-white/5 dark:text-[#8696a0]">
                    Prévia formatada
                  </div>
                  <div className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-[15px] leading-5 sm:max-h-[120px]">
                    <WhatsAppFormattedText text={newMessage} id={`composer-preview-${selectedConversationId || "new"}`} />
                  </div>
                </div>
              )}
              {replyingTo && !isRecording && (
                <div className="inbox-composer-field mb-1 flex items-stretch overflow-hidden rounded-lg shadow-sm">
                  <div className="w-1 shrink-0 bg-[#00a884]" />
                  <div className="min-w-0 flex-1 px-3 py-1.5">
                    <div className="text-[11px] font-semibold text-[#00a884]">
                      Respondendo {replyingTo.fromMe ? "você" : selectedConv?.contact?.name || selectedConv?.contact?.phone || "contato"}
                    </div>
                    <div className="truncate text-[11px] leading-4 text-muted-foreground">
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
                <div className="inbox-composer-field flex min-h-12 items-center gap-2 rounded-xl px-1.5 shadow-sm">
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 sm:h-10 sm:w-10"
                    title="Cancelar gravação"
                    aria-label="Cancelar gravação"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleRecordingPause}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors sm:h-10 sm:w-10 ${
                      isRecordingPaused
                        ? "bg-primary/15 text-primary hover:bg-primary/20"
                        : "text-[#54656f] hover:bg-black/5 hover:text-[#111b21] dark:text-[#aebac1] dark:hover:bg-white/10 dark:hover:text-[#e9edef]"
                    }`}
                    title={isRecordingPaused ? "Continuar gravação" : "Pausar gravação"}
                    aria-label={isRecordingPaused ? "Continuar gravação" : "Pausar gravação"}
                  >
                    {isRecordingPaused ? <Play className="ml-0.5 h-5 w-5" /> : <Pause className="h-5 w-5" />}
                  </button>
                  <div className="flex min-w-0 flex-1 items-center gap-2" aria-live="polite">
                    <div className={`h-2 w-2 shrink-0 rounded-full ${isRecordingPaused ? "bg-amber-500" : "animate-pulse bg-red-500"}`} />
                    <span className={`font-mono text-sm ${isRecordingPaused ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"}`}>
                      {Math.floor(recordingTime / 60)
                        .toString()
                        .padStart(2, "0")}
                      :
                      {(recordingTime % 60).toString().padStart(2, "0")}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {isRecordingPaused ? "Pausado" : "Gravando..."}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    disabled={isSending}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition-colors hover:bg-[#06a17f] disabled:opacity-50 sm:h-10 sm:w-10"
                    title="Enviar áudio"
                    aria-label="Enviar áudio"
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
                <div className="inbox-composer-field relative flex min-h-12 items-end rounded-xl px-1.5 py-0.5 shadow-sm">
                  <SavedRepliesComposerMenu
                    open={savedReplyMenuOpen}
                    query={savedReplyTrigger?.query || ""}
                    replies={savedReplies}
                    categories={savedReplyCategories}
                    campaignName={selectedConv?.campaignName}
                    loading={savedRepliesLoading}
                    error={savedRepliesMenuError}
                    activeIndex={savedReplyActiveIndex}
                    onActiveIndexChange={setSavedReplyActiveIndex}
                    onSelect={handleSlashSavedReplySelect}
                    onManage={() => {
                      setSavedReplyTrigger(null);
                      setSavedReplyDialogTarget("single");
                      setShowSavedRepliesDialog(true);
                    }}
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] transition-colors hover:bg-black/5 hover:text-[#111b21] dark:text-[#aebac1] dark:hover:bg-white/10 dark:hover:text-[#e9edef]"
                    aria-label="Anexar arquivo"
                  >
                    <Plus className="h-6 w-6" />
                  </button>
                  <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,video/*,audio/*,application/pdf,.mp4,.mov,.m4v,.webm,.doc,.docx,.xls,.xlsx"
                    multiple
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setEmojiPickerOpen(false);
                      setSavedReplyTrigger(null);
                      setSavedReplyDialogTarget("single");
                      setShowSavedRepliesDialog(true);
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] transition-colors hover:bg-black/5 hover:text-[#111b21] dark:text-[#aebac1] dark:hover:bg-white/10 dark:hover:text-[#e9edef]"
                    aria-label="Abrir respostas rápidas"
                    title="Respostas rápidas"
                  >
                    <MessageSquareText className="h-5 w-5" />
                  </button>

                  <div ref={emojiPickerRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const textarea = textareaRef.current;
                        if (textarea) {
                          composerSelectionRef.current = {
                            start: textarea.selectionStart ?? newMessage.length,
                            end: textarea.selectionEnd ?? newMessage.length,
                          };
                        }
                        setSavedReplyTrigger(null);
                        setEmojiPickerOpen((current) => !current);
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                        emojiPickerOpen
                          ? "bg-black/5 text-[#00a884] dark:bg-white/10"
                          : "text-[#54656f] hover:bg-black/5 hover:text-[#111b21] dark:text-[#aebac1] dark:hover:bg-white/10 dark:hover:text-[#e9edef]"
                      }`}
                      aria-label="Inserir emoji"
                      aria-expanded={emojiPickerOpen}
                      title="Emojis"
                    >
                      <Smile className="h-5 w-5" />
                    </button>
                    <EmojiPicker
                      open={emojiPickerOpen}
                      onClose={() => setEmojiPickerOpen(false)}
                      onSelect={handleEmojiSelect}
                    />
                  </div>

                  <textarea
                    key={selectedConversationId}
                    ref={textareaRef}
                    value={newMessage}
                    onChange={(e) => {
                      handleComposerValueChange(
                        e.currentTarget.value,
                        e.currentTarget.selectionStart ?? e.currentTarget.value.length,
                      );
                    }}
                    onSelect={(event) => {
                      const input = event.currentTarget;
                      composerSelectionRef.current = {
                        start: input.selectionStart ?? input.value.length,
                        end: input.selectionEnd ?? input.value.length,
                      };
                      setSavedReplyTrigger(findSavedReplyTrigger(
                        input.value,
                        input.selectionStart ?? input.value.length,
                      ));
                    }}
                    onKeyDown={handleComposerKeyDown}
                    onPaste={handleComposerPaste}
                    onBlur={() => window.setTimeout(() => setSavedReplyTrigger(null), 100)}
                    placeholder="Digite uma mensagem"
                    lang="pt-BR"
                    spellCheck
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    className="min-h-10 max-h-24 min-w-0 flex-1 resize-none border-0 bg-transparent px-1.5 py-2 text-[15px] leading-5 text-inherit shadow-none outline-none ring-0 placeholder:text-[#667781] focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 dark:placeholder:text-[#8696a0] [box-shadow:none] sm:max-h-[120px]"
                    rows={1}
                  />

                  <button
                    onClick={
                      newMessage.trim() || attachments.length > 0
                        ? (handleSendMessage as any)
                        : startRecording
                    }
                    disabled={isSending}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                      newMessage.trim() || attachments.length > 0
                        ? "bg-[#00a884] text-white hover:bg-[#06a17f]"
                        : "text-[#54656f] hover:bg-black/5 hover:text-[#111b21] dark:text-[#aebac1] dark:hover:bg-white/10 dark:hover:text-[#e9edef]"
                    }`}
                    aria-label={newMessage.trim() || attachments.length > 0 ? "Enviar mensagem" : "Gravar áudio"}
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : newMessage.trim() || attachments.length > 0 ? (
                      <Send className="h-4 w-4 ml-0.5" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </div>
            )}
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
            className="absolute inset-0 z-40 bg-black/50 xl:hidden"
            onClick={() => setContactSidebarOpen(false)}
          />
          <div className="inbox-contact-panel absolute inset-y-0 right-0 z-50 flex w-full max-w-none shadow-2xl sm:max-w-sm xl:relative xl:inset-auto xl:z-auto xl:w-auto xl:shadow-none">
            <ContactSidebar
              conversation={selectedConv}
              unit={selectedConversationUnit}
              onClose={() => setContactSidebarOpen(false)}
              pipelineRefreshKey={pipelineRefreshKey}
              profilePicUrl={profilePicUrlFor(selectedConv.contact.phone)}
              refreshProfilePicUrl={profilePicUrlFor(selectedConv.contact.phone, true)}
              onProfilePicResolved={updateContactProfilePic}
              onRenameContact={renameContact}
              onPipelineChanged={() => setEvaluationConfirmationRefreshKey((current) => current + 1)}
            />
          </div>
        </>
      )}

      {internalNotesOpen && selectedConv && (
        <div
          className="fixed inset-0 z-[85] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingInternalNote) setInternalNotesOpen(false);
          }}
        >
          <section
            ref={internalNotesDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="internal-notes-title"
            className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-amber-500/25 bg-card shadow-2xl sm:max-h-[82vh] sm:max-w-2xl sm:rounded-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-700 dark:text-amber-300">
                    <MessageSquareText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 id="internal-notes-title" className="truncate text-base font-semibold text-foreground">
                      Notas internas
                    </h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {displayContactName(selectedConv.contact)} · somente equipe
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInternalNotesOpen(false)}
                disabled={isSavingInternalNote}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label="Fechar notas internas"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {internalNotesError && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 leading-5">{internalNotesError}</span>
                  <button
                    type="button"
                    onClick={() => void loadInternalNotes(selectedConv.id)}
                    className="shrink-0 font-semibold underline underline-offset-2"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {internalNotesLoading && internalNotes.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando notas...
                </div>
              ) : internalNotes.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/25 px-5 text-center">
                  <MessageSquareText className="h-7 w-7 text-amber-600/70" />
                  <p className="mt-3 text-sm font-semibold text-foreground">Nenhuma nota interna ainda</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                    Registre contexto para a equipe sem enviar qualquer mensagem ao contato.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {internalNotes.map((note) => {
                    const mentions = Array.isArray(note.mentions) ? note.mentions : [];
                    return (
                      <article key={note.id} className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5 sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                              {note.createdByName.trim().charAt(0).toUpperCase() || "N"}
                            </span>
                            <span className="truncate text-xs font-semibold text-foreground">{note.createdByName}</span>
                          </div>
                          <time dateTime={note.createdAt} className="shrink-0 text-[10px] text-muted-foreground">
                            {formatFollowUpSchedule(note.createdAt)}
                          </time>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{note.content}</p>
                        {mentions.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Pessoas mencionadas">
                            {mentions.map((mention) => (
                              <span key={mention.userId} className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                                @{mention.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {canReplyToSelectedConversation && (
              <footer className="shrink-0 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
                {mentionableUsers.length > 0 && (
                  <div className="mb-2.5">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Mencionar equipe
                    </p>
                    <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                      {mentionableUsers.map((user) => {
                        const selected = internalNoteMentionIds.includes(user.id);
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => setInternalNoteMentionIds((current) => (
                              selected ? current.filter((id) => id !== user.id) : [...current, user.id].slice(0, 10)
                            ))}
                            aria-pressed={selected}
                            className={`min-h-11 rounded-full border px-3 text-xs font-semibold transition-colors sm:min-h-8 sm:px-2.5 ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                          >
                            @{user.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 rounded-xl border border-amber-500/25 bg-background px-3 py-2 focus-within:border-amber-500/60">
                    <textarea
                      ref={internalNoteTextareaRef}
                      value={internalNoteDraft}
                      onChange={(event) => setInternalNoteDraft(event.target.value.slice(0, 2000))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          void saveInternalNote();
                        }
                      }}
                      placeholder="Escreva uma nota visível somente para a equipe..."
                      rows={2}
                      maxLength={2000}
                      className="max-h-32 min-h-12 w-full resize-none border-0 bg-transparent p-0 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:ring-0"
                    />
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span>Ctrl/⌘ + Enter para salvar</span>
                      <span>{internalNoteDraft.length}/2000</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveInternalNote()}
                    disabled={!internalNoteDraft.trim() || isSavingInternalNote}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Salvar nota interna"
                  >
                    {isSavingInternalNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </footer>
            )}
          </section>
        </div>
      )}

      {imagePreview && (
        <div
          className="absolute inset-0 z-[70] flex flex-col bg-black/95 text-white"
          role="dialog"
          aria-modal="true"
          aria-label="Pré-visualização da imagem"
          onClick={() => setImagePreview(null)}
        >
          <div className="inbox-preview-header flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/50 px-4">
            <span className="min-w-0 truncate text-sm font-medium text-white/90">
              {imagePreview.title}
              {imagePreview.sources.length > 1 && (
                <span className="ml-2 text-white/55">
                  {imagePreview.index + 1} de {imagePreview.sources.length}
                </span>
              )}
            </span>
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
          <div className="inbox-preview-content relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
            <img
              src={imagePreview.sources[imagePreview.index]}
              alt={imagePreview.title}
              className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            {imagePreview.sources.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setImagePreview((current) => current ? {
                      ...current,
                      index: (current.index - 1 + current.sources.length) % current.sources.length,
                    } : current);
                  }}
                  className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white/90 backdrop-blur transition-colors hover:bg-black/75 sm:left-5"
                  aria-label="Imagem anterior"
                >
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setImagePreview((current) => current ? {
                      ...current,
                      index: (current.index + 1) % current.sources.length,
                    } : current);
                  }}
                  className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white/90 backdrop-blur transition-colors hover:bg-black/75 sm:right-5"
                  aria-label="Próxima imagem"
                >
                  <ChevronRight className="h-7 w-7" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {documentPreview && (
        <div
          className="absolute inset-0 z-[70] flex flex-col bg-black/95 text-white"
          role="dialog"
          aria-modal="true"
          aria-label="Pré-visualização do documento"
        >
          <div className="inbox-preview-header flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/50 px-4">
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
          <div className="inbox-preview-content flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
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

      {/* Modal Bloquear ou Desbloquear Contato */}
      {showBlockModal && selectedConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-xl border bg-card p-5 shadow-2xl sm:p-6 ${
            selectedConv.blockedAt ? "border-border" : "border-destructive/30"
          }`}>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className={`flex h-14 w-14 items-center justify-center rounded-full ${
                selectedConv.blockedAt ? "bg-primary/10" : "bg-destructive/10"
              }`}>
                <Ban className={`h-7 w-7 ${selectedConv.blockedAt ? "text-primary" : "text-destructive"}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {selectedConv.blockedAt ? "Desbloquear contato" : "Bloquear contato"}
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {selectedConv.blockedAt
                    ? "O contato poderá voltar a enviar e receber mensagens por este número de WhatsApp."
                    : "O contato será bloqueado somente nesta instância. O histórico permanecerá disponível no CRM."
                  }
                </p>
              </div>
              <div className="mt-1 flex w-full flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                <button
                  onClick={() => setShowBlockModal(false)}
                  disabled={isUpdatingContactBlock}
                  className="min-h-11 flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleUpdateContactBlock()}
                  disabled={isUpdatingContactBlock}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                    selectedConv.blockedAt
                      ? "bg-primary hover:bg-primary/90"
                      : "bg-destructive hover:bg-destructive/90"
                  }`}
                >
                  {isUpdatingContactBlock ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                  {selectedConv.blockedAt ? "Desbloquear" : "Bloquear"}
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

      {bulkFollowUpConfirmOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBulkFollowUpConfirmOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-follow-up-title"
            className="w-full rounded-t-2xl border border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="bulk-follow-up-title" className="text-base font-semibold text-foreground">
                  Confirmar follow-up
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  A mensagem será enviada individualmente para {bulkSelectedConversationIds.length}{" "}
                  {bulkSelectedConversationIds.length === 1 ? "conversa selecionada" : "conversas selecionadas"}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkFollowUpConfirmOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Fechar confirmação"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border/80 bg-muted/45">
              {bulkFollowUpImage && (
                <div
                  className="aspect-[16/9] max-h-48 w-full bg-muted bg-cover bg-center"
                  style={{ backgroundImage: `url(${bulkFollowUpImage.previewUrl})` }}
                  role="img"
                  aria-label={`Prévia de ${bulkFollowUpImage.file.name}`}
                />
              )}
              {bulkFollowUpDraft.trim() && (
                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words p-3 text-sm leading-5 text-foreground">
                  {bulkFollowUpDraft.trim()}
                </div>
              )}
            </div>

            <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
              Os envios serão feitos um por vez, com intervalo de segurança{bulkFollowUpImage ? " reforçado para imagem" : ""}. Se algum falhar, ele continuará selecionado para você revisar — sem reenvio automático.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setBulkFollowUpConfirmOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:h-10"
              >
                Voltar e revisar
              </button>
              <button
                type="button"
                onClick={() => void sendBulkFollowUp()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:h-10"
              >
                <Send className="h-4 w-4" />
                Enviar follow-up
              </button>
            </div>
          </div>
        </div>
      )}

      {showFollowUpModal && selectedConv && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingFollowUp) setShowFollowUpModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-up-title"
            className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-md sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h3 id="follow-up-title" className="text-base font-semibold text-foreground">
                  {selectedConv.activeFollowUp ? "Reagendar retorno" : "Agendar retorno"}
                </h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {displayContactName(selectedConv.contact)} · responsável: {selectedConv.assignedToName || currentUser?.name || "você"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFollowUpModal(false)}
                disabled={isSavingFollowUp}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                aria-label="Fechar agendamento de retorno"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Atalhos</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["one_hour", "Hoje +1h"],
                    ["three_hours", "Hoje +3h"],
                    ["tomorrow_morning", "Amanhã 09:00"],
                    ["tomorrow_afternoon", "Amanhã 14:00"],
                    ["next_monday", "Próxima segunda"],
                  ] as Array<[WhatsAppFollowUpShortcut, string]>).map(([shortcut, label]) => (
                    <button
                      key={shortcut}
                      type="button"
                      onClick={() => applyFollowUpShortcut(shortcut)}
                      className="min-h-11 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">Data</span>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(event) => setFollowUpDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">Horário</span>
                  <input
                    type="time"
                    value={followUpTime}
                    onChange={(event) => setFollowUpTime(event.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-foreground">Motivo do retorno</span>
                <textarea
                  value={followUpNote}
                  onChange={(event) => setFollowUpNote(event.target.value.slice(0, 500))}
                  rows={4}
                  maxLength={500}
                  placeholder="Ex.: Cliente vai verificar a agenda e pediu retorno para confirmar a avaliação."
                  className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30"
                />
                <span className="block text-right text-[10px] text-muted-foreground">{followUpNote.length}/500</span>
              </label>

              <p className="rounded-xl bg-muted/55 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                O retorno ficará visível no chat e aparecerá em <strong className="text-foreground">Retornos</strong> quando chegar o horário. A rechamada automática continuará funcionando separadamente.
              </p>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-between sm:px-5 sm:pb-4">
              {selectedConv.activeFollowUp ? (
                <button
                  type="button"
                  onClick={() => void updateFollowUp("cancel")}
                  disabled={isSavingFollowUp}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60 sm:min-h-10"
                >
                  Cancelar retorno
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowFollowUpModal(false)}
                  disabled={isSavingFollowUp}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60 sm:min-h-10 sm:flex-none"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => void saveFollowUp()}
                  disabled={isSavingFollowUp || !followUpDate || !followUpTime || followUpNote.trim().length < 3}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 sm:flex-none"
                >
                  {isSavingFollowUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                  {selectedConv.activeFollowUp ? "Reagendar" : "Agendar"}
                </button>
              </div>
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
      <EvaluationAvailabilityDialog
        open={showEvaluationAvailabilityDialog}
        unit={selectedConversationUnit}
        onOpenChange={setShowEvaluationAvailabilityDialog}
        onInsertMessage={handleEvaluationAvailabilityInsert}
      />
      <SavedRepliesDialog
        open={showSavedRepliesDialog}
        draftText={savedReplyDialogTarget === "bulk" ? bulkFollowUpDraft : newMessage}
        library={savedRepliesLibrary}
        campaignName={savedReplyDialogTarget === "bulk" ? null : selectedConv?.campaignName}
        onOpenChange={(open) => {
          setShowSavedRepliesDialog(open);
          if (!open) setSavedReplyDialogTarget("single");
        }}
        onSelect={handleSavedReplySelect}
      />
    </div>
  );
}
