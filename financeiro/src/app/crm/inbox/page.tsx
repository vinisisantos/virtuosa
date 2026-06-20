"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
interface Contact {
  id: string;
  phone: string;
  name?: string | null;
  profilePic?: string | null;
  tags?: any;
  unit?: string | null;
}

interface Conversation {
  id: string;
  status: string;
  unreadCount: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  contact: Contact;
}

interface Message {
  id: string;
  body: string;
  type: string;
  mediaUrl?: string | null;
  fromMe: boolean;
  status: string;
  timestamp: string;
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

function formatMessageTime(dateString: string) {
  try {
    return new Date(dateString).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ─── Contact Sidebar ─────────────────────────────────────────
function ContactSidebar({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const { contact } = conversation;
  const tags: string[] = Array.isArray(contact.tags)
    ? contact.tags
    : typeof contact.tags === "string"
    ? contact.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
    : [];

  const initial = contact.name?.charAt(0)?.toUpperCase() || contact.phone?.charAt(0) || "?";

  return (
    <div className="flex h-full w-72 flex-shrink-0 flex-col border-l border-border bg-card overflow-y-auto">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-semibold text-foreground">Detalhes do Contato</span>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-3 px-4 py-6 border-b border-border">
        {/* Avatar */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl font-bold overflow-hidden">
          {contact.profilePic ? (
            <img src={contact.profilePic} alt="" className="h-16 w-16 object-cover" />
          ) : (
            initial
          )}
        </div>

        <div className="text-center">
          <p className="font-semibold text-foreground">
            {contact.name || <span className="text-muted-foreground italic">Sem nome</span>}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{contact.phone}</p>
        </div>

        {/* Status badge */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            conversation.status === "open"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <Circle className={`h-1.5 w-1.5 fill-current ${conversation.status === "open" ? "text-emerald-400" : "text-muted-foreground"}`} />
          {conversation.status === "open" ? "Aberta" : "Fechada"}
        </span>
      </div>

      {/* Info list */}
      <div className="p-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Informações</p>

        <div className="flex items-center gap-3 text-sm">
          <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-foreground font-mono text-xs">{contact.phone}</span>
        </div>

        {contact.unit && (
          <div className="flex items-center gap-3 text-sm">
            <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground text-xs">{contact.unit}</span>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex items-start gap-3 text-sm">
            <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {tags.map((tag: string) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="px-4 pb-4">
        <div className="rounded-lg border border-border bg-background p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Mensagens não lidas</span>
            <span className="font-medium text-foreground">{conversation.unreadCount || 0}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Última mensagem</span>
            <span className="font-medium text-foreground">
              {conversation.lastMessageAt ? formatTime(conversation.lastMessageAt) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isMe = msg.fromMe;

  return (
    <div className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[75%] rounded-2xl px-4 py-2.5 text-[14px] shadow-sm ${
          isMe
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        }`}
      >
        {/* Image */}
        {msg.type === "image" && msg.mediaUrl && (
          <img
            src={msg.mediaUrl}
            alt=""
            className="max-w-full rounded-md mb-2 cursor-pointer object-cover max-h-[280px]"
            onClick={() => window.open(msg.mediaUrl!, "_blank")}
          />
        )}

        {/* Audio */}
        {(msg.type === "audio" || msg.type === "ptt" || msg.type === "myaudio") && msg.mediaUrl && (
          <audio controls className="max-w-[240px] mb-1 h-9">
            <source src={msg.mediaUrl} type="audio/mpeg" />
          </audio>
        )}

        {/* Document */}
        {msg.type === "document" && msg.mediaUrl && (
          <a
            href={msg.mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 bg-black/10 p-2.5 rounded-md mb-1 hover:bg-black/20 transition-colors"
          >
            <div className="w-8 h-8 rounded bg-background/50 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-[13px] font-medium truncate max-w-[180px]">Documento</span>
          </a>
        )}

        {/* Text */}
        {msg.body && (
          <div className="break-words whitespace-pre-wrap leading-relaxed">{msg.body}</div>
        )}

        {/* Timestamp + status */}
        <div className={`mt-1 flex items-center justify-end gap-1 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          <span className="text-[10px]">{formatMessageTime(msg.timestamp)}</span>
          {isMe && (
            <>
              {msg.status === "read" ? (
                <CheckCheck className="w-3.5 h-3.5 text-blue-300" />
              ) : msg.status === "delivered" ? (
                <CheckCheck className="w-3.5 h-3.5" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Conversation Item ────────────────────────────────────────
function ConversationItem({
  conv,
  isActive,
  onClick,
}: {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  const initial = conv.contact?.name?.charAt(0)?.toUpperCase() || conv.contact?.phone?.charAt(0) || "?";

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 ${
        isActive ? "border-l-2 border-primary bg-muted/70" : "border-l-2 border-transparent"
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold overflow-hidden">
          {conv.contact?.profilePic ? (
            <img src={conv.contact.profilePic} alt="" className="h-10 w-10 object-cover" />
          ) : (
            initial
          )}
        </div>
        {conv.status === "open" && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {conv.contact?.name || conv.contact?.phone}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ""}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {conv.lastMessage || "Nova conversa"}
          </p>
          {conv.unreadCount > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground flex-shrink-0">
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ═════════════════════════════════════════════════════════════
// ─── Main Inbox Page ──────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachment, setAttachment] = useState<{ file: File; base64: string; type: string } | null>(null);
  const [contactSidebarOpen, setContactSidebarOpen] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Data fetching ────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/conversations");
      const data = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/messages?conversationId=${convId}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Polling
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => {
      fetchConversations();
      if (selectedConv) fetchMessages(selectedConv.id);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedConv, fetchConversations, fetchMessages]);

  // Load messages on conversation select
  useEffect(() => {
    if (!selectedConv) return;
    setLoadingMessages(true);
    setMessages([]);
    fetchMessages(selectedConv.id).finally(() => setLoadingMessages(false));
  }, [selectedConv, fetchMessages]);

  // Auto-scroll
  const prevLengthRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = messages.length;
  }, [messages]);

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

    setIsSending(true);
    const tempMsg = newMessage;
    const tempAttach = attachment;
    const tempId = "temp_" + Date.now();

    setNewMessage("");
    setAttachment(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        body: tempMsg,
        type: tempAttach ? tempAttach.type : "text",
        mediaUrl: tempAttach?.base64,
        fromMe: true,
        status: "sent",
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const payload: Record<string, any> = {
        instance: "virtuosa-main",
        contactId: selectedConv.contact.phone,
        body: tempMsg,
        type: tempAttach ? tempAttach.type : "text",
      };
      if (tempAttach) {
        payload.file = tempAttach.base64;
        payload.docName = tempAttach.file.name;
      }

      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Falha no envio:", err);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else {
        fetchMessages(selectedConv.id);
      }
      fetchConversations();
    } catch (error) {
      console.error(error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsSending(false);
    }
  };

  // ─── Filtered conversations ───────────────────────────────
  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.contact?.name?.toLowerCase().includes(q) ||
      c.contact?.phone?.toLowerCase().includes(q)
    );
  });

  // ─── UI ───────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden -m-4 sm:-m-6 bg-background text-foreground">
      
      {/* ── LEFT: Conversation List ── */}
      <div
        className={`flex h-full flex-col border-r border-border bg-card flex-shrink-0 w-full sm:w-80 ${
          selectedConv ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* Search */}
        <div className="border-b border-border p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar conversas..."
              className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 pl-9 text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">
              Todas
            </span>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {search ? "Nenhuma conversa encontrada" : "Nenhuma conversa ainda"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={selectedConv?.id === conv.id}
                  onClick={() => {
                    setSelectedConv(conv);
                    setContactSidebarOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CENTER: Message Thread ── */}
      <div
        className={`flex h-full min-w-0 flex-1 flex-col bg-background relative ${
          selectedConv ? "flex" : "hidden lg:flex"
        }`}
      >
        {selectedConv ? (
          <>
            {/* Thread Header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 shadow-sm z-10">
              <div className="flex items-center gap-3 min-w-0">
                {/* Back (mobile) */}
                <button
                  onClick={() => setSelectedConv(null)}
                  className="lg:hidden p-1.5 -ml-1 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold overflow-hidden">
                  {selectedConv.contact.profilePic ? (
                    <img src={selectedConv.contact.profilePic} alt="" className="h-9 w-9 object-cover" />
                  ) : (
                    selectedConv.contact.name?.charAt(0)?.toUpperCase() ||
                    selectedConv.contact.phone?.charAt(0) ||
                    "?"
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {selectedConv.contact.name || selectedConv.contact.phone}
                  </span>
                  <span className="truncate text-xs text-muted-foreground font-mono">
                    {selectedConv.contact.phone}
                  </span>
                </div>
              </div>

              {/* Info toggle */}
              <button
                onClick={() => setContactSidebarOpen((o) => !o)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  contactSidebarOpen
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                title="Detalhes do contato"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
                messages.map((msg, idx) => <MessageBubble key={msg.id || idx} msg={msg} />)
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
                <div className="p-4 bg-card border-t border-border flex items-center gap-3">
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
            )}

            {/* Input Bar */}
            <div className="shrink-0 border-t border-border bg-card p-3">
              <div className="flex items-end gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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

                <div className="flex min-h-[40px] flex-1 items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
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
                    className="flex-1 max-h-[120px] resize-none bg-transparent py-0.5 text-sm placeholder:text-muted-foreground focus:outline-none text-foreground"
                    rows={1}
                  />
                </div>

                <button
                  onClick={handleSendMessage as any}
                  disabled={(!newMessage.trim() && !attachment) || isSending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
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
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/10">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-muted ring-8 ring-background">
              <MessageSquare className="h-9 w-9 text-muted-foreground/50" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-foreground">WhatsApp Inbox</h3>
            <p className="max-w-[260px] text-sm text-muted-foreground">
              Selecione uma conversa para começar a enviar e receber mensagens.
            </p>
          </div>
        )}
      </div>

      {/* ── RIGHT: Contact Sidebar (toggleable) ── */}
      {selectedConv && contactSidebarOpen && (
        <div className="hidden lg:flex">
          <ContactSidebar
            conversation={selectedConv}
            onClose={() => setContactSidebarOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
