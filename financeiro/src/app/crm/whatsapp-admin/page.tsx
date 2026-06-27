"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/auth-guard";
import { useGlobalUnit } from "@/contexts/UnitContext";
import {
  Shield,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
  ExternalLink,
  MessageSquare,
  X,
  Users,
  Activity,
} from "lucide-react";
import { toast } from "@/components/toast";

// ─── Tipos ──────────────────────────────────────────────────
interface CollaboratorInstance {
  id: string;
  userId: string;
  userName: string;
  instanceName?: string;
  unit: string;
  status: string;
  isActive?: boolean;
  phone?: string | null;
}

interface AdminConversation {
  id: string;
  status: string;
  unreadCount: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  contact: {
    phone: string;
    name?: string | null;
  };
}

// ─── Helpers ────────────────────────────────────────────────
function formatTime(dateString: string) {
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0)
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Ontem";
    if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" });
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

// ═══════════════════════════════════════════════════════════
// ─── WhatsApp Admin Page ──────────────────────────────────
// ═══════════════════════════════════════════════════════════
export default function WhatsAppAdminPage() {
  const router = useRouter();
  const { globalUnit } = useGlobalUnit();

  const [instances, setInstances] = useState<CollaboratorInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [hasShownInactiveNotice, setHasShownInactiveNotice] = useState(false);
  const unitFilter = globalUnit === '' ? 'Todas' : globalUnit;

  // Modal de conversas de um colaborador
  const [modalOpen, setModalOpen] = useState(false);
  const [modalUser, setModalUser] = useState<CollaboratorInstance | null>(null);
  const [modalConversations, setModalConversations] = useState<AdminConversation[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // ─── Buscar instâncias ──────────────────────────────────
  const fetchInstances = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/admin/instances?includeInactive=true");
      const data = await res.json();
      if (data.instances) {
        setInstances(data.instances);
        if (!hasShownInactiveNotice && data.instances.some((inst: CollaboratorInstance) => !inst.isActive)) {
          toast("Instâncias inativas ficam só na aba Inativas. A exclusão foi desabilitada.", "info");
          setHasShownInactiveNotice(true);
        }
      }
    } catch (error) {
      console.error("Erro ao buscar instâncias:", error);
    } finally {
      setLoading(false);
    }
  }, [hasShownInactiveNotice]);

  // Buscar ao montar + auto-refresh a cada 30s
  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 30000);
    return () => clearInterval(interval);
  }, [fetchInstances]);

  // ─── Buscar conversas de um colaborador (modal) ─────────
  const openConversationsModal = async (inst: CollaboratorInstance) => {
    setModalUser(inst);
    setModalOpen(true);
    setModalLoading(true);
    setModalConversations([]);

    try {
      const res = await fetch(`/api/whatsapp/admin/conversations?userId=${inst.userId}`);
      const data = await res.json();
      if (data.conversations) {
        setModalConversations(data.conversations);
      }
    } catch (error) {
      console.error("Erro ao buscar conversas:", error);
    } finally {
      setModalLoading(false);
    }
  };

  // ─── Filtro e estatísticas ──────────────────────────────
  const visibleByStatus = instances.filter((i) =>
    showInactive ? i.status !== "connected" : i.status === "connected",
  );

  const filteredInstances =
    unitFilter === "Todas"
      ? visibleByStatus
      : visibleByStatus.filter((i) => i.unit === unitFilter);

  const totalInstances = instances.length;
  const connectedCount = instances.filter((i) => i.status === "connected").length;
  const disconnectedCount = instances.filter((i) => i.status !== "connected" && i.status !== "connecting").length;

  return (
    <AuthGuard allowedRoles={["ADMINISTRADOR"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">WhatsApp Admin</h1>
              <p className="text-sm text-muted-foreground">
                Gerenciamento de Instâncias
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchInstances();
            }}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors border rounded-lg px-3 py-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card text-card-foreground shadow p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalInstances}</p>
                <p className="text-xs text-muted-foreground">Total Instâncias</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card text-card-foreground shadow p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <Wifi className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-500">{connectedCount}</p>
                <p className="text-xs text-muted-foreground">Conectadas</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card text-card-foreground shadow p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                <WifiOff className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{disconnectedCount}</p>
                <p className="text-xs text-muted-foreground">Desconectadas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filtro por unidade sincronizado com o header */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            Mostrando instâncias da unidade: <strong className="text-foreground">{unitFilter}</strong>
          </p>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-lg border border-border bg-card p-0.5">
              <button
                onClick={() => setShowInactive(false)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  !showInactive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Ativas
              </button>
              <button
                onClick={() => setShowInactive(true)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  showInactive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                Inativas
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              {filteredInstances.length} instância{filteredInstances.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Tabela de instâncias */}
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          {loading && instances.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredInstances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma instância encontrada.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredInstances.map((inst) => (
                <div
                  key={inst.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                >
                  {/* Avatar */}
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold flex-shrink-0">
                    {inst.userName?.charAt(0)?.toUpperCase() || "?"}
                  </div>

                  {/* Info do colaborador */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {inst.userName}
                    </p>
                    <p className="text-xs text-muted-foreground">{inst.unit}</p>
                  </div>

                  {/* Telefone */}
                  <div className="hidden md:block">
                    {inst.phone ? (
                      <span className="text-xs text-muted-foreground font-mono">
                        {inst.phone}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">—</span>
                    )}
                  </div>

                  {/* Status badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium flex-shrink-0 ${
                      inst.status === "connected"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : inst.status === "connecting"
                        ? "bg-yellow-500/10 text-yellow-500"
                        : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        inst.status === "connected"
                          ? "bg-emerald-500"
                          : inst.status === "connecting"
                          ? "bg-yellow-500 animate-pulse"
                          : "bg-red-500"
                      }`}
                    />
                    {inst.status === "connected"
                      ? "🟢 Conectado"
                      : inst.status === "connecting"
                      ? "🟡 Conectando"
                      : "🔴 Desconectado"}
                  </span>

                  {/* Ações */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => router.push(`/crm/inbox?targetUserId=${inst.userId}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ver Inbox
                    </button>
                    <button
                      onClick={() => openConversationsModal(inst)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Ver Conversas
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auto-refresh info */}
        <p className="text-xs text-muted-foreground text-center">
          <Activity className="w-3 h-3 inline-block mr-1" />
          Atualização automática a cada 30 segundos
        </p>
      </div>

      {/* ─── Modal: Conversas do Colaborador ─── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-xl mx-4 rounded-xl border bg-card text-card-foreground shadow-2xl max-h-[80vh] flex flex-col">
            {/* Header do modal */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="font-semibold text-foreground">
                  Conversas de {modalUser?.userName}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {modalUser?.unit} • {modalConversations.length} conversa{modalConversations.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setModalUser(null);
                  setModalConversations([]);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Lista de conversas */}
            <div className="flex-1 overflow-y-auto">
              {modalLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : modalConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {modalConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      {/* Avatar */}
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold flex-shrink-0">
                        {conv.contact?.name?.charAt(0)?.toUpperCase() || conv.contact?.phone?.charAt(0) || "?"}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {conv.contact?.name || conv.contact?.phone}
                          </p>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ""}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {conv.lastMessage || "—"}
                        </p>
                      </div>

                      {/* Status + unread */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            conv.status === "open"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {conv.status === "open" ? "Aberta" : "Fechada"}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer do modal */}
            {modalUser && (
              <div className="border-t border-border p-3 flex justify-end">
                <button
                  onClick={() => {
                    setModalOpen(false);
                    router.push(`/crm/inbox?targetUserId=${modalUser.userId}`);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir Inbox Completo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
