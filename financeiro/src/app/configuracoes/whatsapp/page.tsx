"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "@/components/toast";
import { Loader2, Smartphone, LogOut, ArrowLeft, RefreshCw, Wifi, WifiOff, Users, ExternalLink, UserCheck } from "lucide-react";
import Link from "next/link";

// ─── Tipos para instâncias de colaboradores ─────────────────
interface CollaboratorInstance {
  id: string;
  instanceName?: string;
  displayName?: string | null;
  userId: string;
  userName: string;
  userEmail?: string;
  unit: string;
  status: string;
  phone?: string | null;
}

interface CrmUser {
  id: string;
  name: string;
  email: string;
  unit: string;
  role: string;
  isActive: boolean;
}

export default function WhatsAppSettingsPage() {
  const [userInstances, setUserInstances] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("loading");
  const [isLoading, setIsLoading] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const statusRequestInFlightRef = useRef(false);

  // Admin: dados do usuário e instâncias dos colaboradores
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [instances, setInstances] = useState<CollaboratorInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [unitFilter, setUnitFilter] = useState<string>("Todas");
  const [updatingOwnerId, setUpdatingOwnerId] = useState<string | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [restartingId, setRestartingId] = useState<string | null>(null);

  // Unidades que o usuário pode conectar + unidade escolhida para o novo WhatsApp
  const [permittedUnits, setPermittedUnits] = useState<string[]>([]);
  const [connectUnit, setConnectUnit] = useState<string>("");
  const [connectUserId, setConnectUserId] = useState<string>("");
  const connectableUnits = new Set(["Osasco", "SBC", "SCS"]);

  // Buscar info do usuário logado
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const u = data.user;
        if (!u) return;
        setCurrentUserId(u.id);
        setConnectUserId((prev) => prev || u.id);
        if (u.role === "ADMINISTRADOR") setIsAdmin(true);

        // Calcula as unidades que esse usuário pode operar (mesma regra do back).
        const VISIBLE = ["Osasco", "SBC", "SCS"];
        const perms = u.permissions || {};
        let allowed: string[];
        if (u.role === "ADMINISTRADOR" || perms.admin || perms.multiUnit) {
          allowed = [...VISIBLE];
        } else {
          const set = new Set<string>();
          if (u.unit && VISIBLE.includes(u.unit)) set.add(u.unit);
          const map: Record<string, string> = { unitOsasco: "Osasco", unitSBC: "SBC", unitSCS: "SCS" };
          for (const [k, name] of Object.entries(map)) if (perms[k]) set.add(name);
          allowed = [...set];
        }
        setPermittedUnits(allowed);
        setConnectUnit((prev) => prev || allowed[0] || u.unit || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/users", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data.filter((u) => u.isActive !== false) : [];
        setUsers(list);
      })
      .catch(() => {});
  }, [isAdmin]);

  // Buscar instâncias dos colaboradores (apenas admin)
  const fetchInstances = useCallback(async () => {
    if (!isAdmin) return;
    setInstancesLoading(true);
    try {
      const res = await fetch("/api/whatsapp/admin/instances?includeInactive=true");
      const data = await res.json();
      if (data.instances) {
        setInstances(data.instances);
      }
    } catch (error) {
      console.error("Erro ao buscar instâncias:", error);
    } finally {
      setInstancesLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) fetchInstances();
  }, [isAdmin, fetchInstances]);

  const fetchStatus = useCallback(async () => {
    if (statusRequestInFlightRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    statusRequestInFlightRef.current = true;
    try {
      const params = new URLSearchParams();
      if (isAdmin && connectUserId && connectUserId !== currentUserId) {
        params.set("targetUserId", connectUserId);
      }
      const res = await fetch(`/api/whatsapp/status${params.toString() ? `?${params.toString()}` : ""}`);
      const data = await res.json();

      if (data.instances) {
        setUserInstances(data.instances);
        if (data.instances.length === 0) {
          setStatus("disconnected");
        } else {
          setStatus("loaded");
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      statusRequestInFlightRef.current = false;
    }
  }, [connectUserId, currentUserId, isAdmin]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const startPolling = () => {
      if (document.visibilityState === "hidden") return;
      fetchStatus();
      stopPolling();
      interval = setInterval(fetchStatus, 5000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
        return;
      }
      startPolling();
    };

    const handleFocus = () => {
      if (document.visibilityState !== "hidden") fetchStatus();
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchStatus]);

  const selectableUsers = useCallback(
    (unit: string) => users.filter((user) => unit === "Todas" || user.unit === unit),
    [users],
  );

  const handleConnectUnitChange = (unit: string) => {
    setConnectUnit(unit);
    if (!isAdmin) return;

    const unitUsers = selectableUsers(unit);
    if (unitUsers.length > 0 && !unitUsers.some((user) => user.id === connectUserId)) {
      setConnectUserId(unitUsers[0].id);
    }
  };

  const handleConnectUserChange = (userId: string) => {
    setConnectUserId(userId);
    const user = users.find((item) => item.id === userId);
    if (user?.unit && permittedUnits.includes(user.unit)) {
      setConnectUnit(user.unit);
    }
  };

  const handleConnect = async () => {
    if (!connectUnit) {
      toast("Selecione a unidade deste WhatsApp antes de conectar.", "error");
      return;
    }
    if (hasActiveInstanceForConnection) {
      toast("Já existe um WhatsApp conectado para esta unidade.", "error");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_new",
          unit: connectUnit,
          ...(isAdmin && connectUserId ? { targetUserId: connectUserId } : {}),
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Erro ao conectar");

      toast(`Instância de ${connectUnit} preparada! Escaneie o QR Code.`, "success");
      fetchStatus();
    } catch (error: any) {
      toast(error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const canReconnectInstance = (inst: CollaboratorInstance) =>
    inst.status === "disconnected" &&
    !!inst.instanceName;
  const canReconnectStatusInstance = (inst: any) =>
    inst.status === "disconnected" &&
    typeof inst.name === "string";

  const handleReconnectInstance = async (inst: CollaboratorInstance) => {
    if (!inst.userId) {
      toast("Essa instância está sem responsável. Atribua um responsável antes de reconectar.", "error");
      return;
    }

    setReconnectingId(inst.id);
    setConnectUnit(connectableUnits.has(inst.unit) ? inst.unit : "");
    setConnectUserId(inst.userId);
    const reconnectUnit = connectableUnits.has(inst.unit) ? inst.unit : undefined;

    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reconnect",
          instanceId: inst.id,
          ...(reconnectUnit ? { unit: reconnectUnit } : {}),
          targetUserId: inst.userId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao reconectar");

      toast("QR Code gerado para reconectar esta instância.", "success");
      const statusRes = await fetch(`/api/whatsapp/status?targetUserId=${encodeURIComponent(inst.userId)}`);
      const statusData = await statusRes.json().catch(() => ({}));
      if (statusData.instances) {
        setUserInstances(statusData.instances);
        setStatus(statusData.instances.length ? "loaded" : "disconnected");
      }
      fetchInstances();
    } catch (error: any) {
      toast(error.message || "Erro ao reconectar instância", "error");
    } finally {
      setReconnectingId(null);
    }
  };

  const handleReconnectSelectedInstance = async (inst: any) => {
    const reconnectUnit = connectableUnits.has(inst.unit) ? inst.unit : connectableUnits.has(connectUnit) ? connectUnit : undefined;
    const targetUserId = inst.userId || connectUserId;

    if (!reconnectUnit && !inst.id) {
      toast("Selecione a unidade deste WhatsApp antes de reconectar.", "error");
      return;
    }

    if (isAdmin && !targetUserId) {
      toast("Selecione o responsável desta instância antes de reconectar.", "error");
      return;
    }

    setReconnectingId(inst.id);
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reconnect",
          instanceId: inst.id,
          ...(reconnectUnit ? { unit: reconnectUnit } : {}),
          ...(isAdmin && targetUserId ? { targetUserId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao reconectar");

      toast("QR Code gerado para reconectar esta instância.", "success");
      fetchStatus();
      fetchInstances();
    } catch (error: any) {
      toast(error.message || "Erro ao reconectar instância", "error");
    } finally {
      setReconnectingId(null);
    }
  };

  const handleRestartSelectedInstance = async (inst: any) => {
    const restartUnit = connectableUnits.has(inst.unit) ? inst.unit : connectableUnits.has(connectUnit) ? connectUnit : undefined;
    const targetUserId = inst.userId || connectUserId;

    setRestartingId(inst.id);
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restart",
          instanceId: inst.id,
          ...(restartUnit ? { unit: restartUnit } : {}),
          ...(isAdmin && targetUserId ? { targetUserId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao reiniciar sessão");

      toast(
        data.requiresReconnect
          ? "Sessão desconectada. Clique em Reconectar e escaneie o QR Code."
          : "Sessão reiniciada na Evolution.",
        "success",
      );
      fetchStatus();
      fetchInstances();
    } catch (error: any) {
      toast(error.message || "Erro ao reiniciar sessão", "error");
    } finally {
      setRestartingId(null);
    }
  };

  const handleDisconnect = async (inst: any) => {
    if (!confirm("Tem certeza que deseja desconectar este WhatsApp?")) return;

    setIsDisconnecting(true);
    try {
      const params = new URLSearchParams({ instanceId: inst.id });
      if (isAdmin && inst.userId) params.set("targetUserId", inst.userId);
      const res = await fetch(`/api/whatsapp/status?${params.toString()}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Falha ao desconectar");
      }
      toast("WhatsApp desconectado com sucesso", "success");
      setTimeout(fetchStatus, 1500);
    } catch (error: any) {
      toast(`Erro ao desconectar: ${error.message}`, "error");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleRemoveInstance = async (inst: any) => {
    if (!confirm("Remover esta instância do CRM? O histórico será preservado, mas ela não será mais reutilizada.")) return;

    setRemovingId(inst.id);
    try {
      const params = new URLSearchParams({ instanceId: inst.id, remove: "true" });
      if (isAdmin && inst.userId) params.set("targetUserId", inst.userId);
      const res = await fetch(`/api/whatsapp/status?${params.toString()}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao remover");
      }

      toast("Instância removida. Você já pode criar um novo WhatsApp.", "success");
      fetchStatus();
      fetchInstances();
    } catch (error: any) {
      toast(`Erro ao remover: ${error.message}`, "error");
    } finally {
      setRemovingId(null);
    }
  };

  const handleAssignOwner = async (instanceId: string, nextUserId: string) => {
    setUpdatingOwnerId(instanceId);
    try {
      const res = await fetch("/api/whatsapp/admin/instances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: instanceId, userId: nextUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao atribuir responsável");

      toast("Responsável da instância atualizado.", "success");
      fetchInstances();
      fetchStatus();
    } catch (error: any) {
      toast(error.message || "Erro ao atribuir responsável", "error");
    } finally {
      setUpdatingOwnerId(null);
    }
  };

  const statusColor =
    status === "connected"
      ? "text-green-500"
      : status === "connecting"
      ? "text-yellow-500"
      : "text-muted-foreground";

  const statusLabel =
    status === "connected"
      ? "Conectado e Operante"
      : status === "connecting"
      ? "Conectando..."
      : status === "loading"
      ? "Verificando..."
      : "Desconectado";

  const hasActiveInstanceForConnection = userInstances.some((inst) => {
    const instanceUnit = inst.unit || "";
    const sameUnit = !connectUnit || instanceUnit === connectUnit || instanceUnit === "Todas";
    return sameUnit && ["connected", "connecting"].includes(inst.status);
  });

  // Filtrar instâncias por unidade
  const filteredInstances =
    unitFilter === "Todas"
      ? instances
      : instances.filter((i) => i.unit === unitFilter);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/60 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link
            href="/crm"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao CRM
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">Configurações do WhatsApp</span>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">WhatsApp (Evolution API)</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie a conexão do seu WhatsApp pessoal.
            </p>
          </div>
          <button
            onClick={fetchStatus}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors border rounded-lg px-3 py-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>

        {/* Status Card */}
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 border-b">
            <h3 className="font-semibold leading-none tracking-tight">Status da Conexão</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Conecte um aparelho celular com WhatsApp Business para enviar e receber mensagens.
            </p>
          </div>

          <div className="p-6 flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {isAdmin && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Conectar para
                    </label>
                    <select
                      value={connectUserId}
                      onChange={(e) => handleConnectUserChange(e.target.value)}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {selectableUsers(connectUnit || "Todas").map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} · {user.unit}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      A conexão ficará vinculada ao perfil escolhido.
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Unidade deste WhatsApp
                </label>
                <select
                  value={connectUnit}
                  onChange={(e) => handleConnectUnitChange(e.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {permittedUnits.length === 0 && <option value="">—</option>}
                  {permittedUnits.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Tudo que cair neste WhatsApp será registrado em <b>{connectUnit || "—"}</b>.
                </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <UserCheck className="h-4 w-4 text-primary" />
                  <span>
                    Responsável: <b className="text-foreground">
                      {isAdmin ? users.find((user) => user.id === connectUserId)?.name || "Selecione um usuário" : "Você"}
                    </b>
                  </span>
                </div>
                <button
                  onClick={handleConnect}
                  disabled={isLoading || !connectUnit || (isAdmin && !connectUserId) || hasActiveInstanceForConnection}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-[#25D366] hover:bg-[#1DA851] text-white transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                  {hasActiveInstanceForConnection ? "WhatsApp já conectado" : "Adicionar Novo WhatsApp"}
                </button>
              </div>
            </div>

            {status === "loading" && (
              <div className="flex flex-col items-center justify-center py-10 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">Carregando aparelhos...</p>
              </div>
            )}

            {status !== "loading" && userInstances.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-6">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                  <WifiOff className="w-10 h-10 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-lg">Nenhum Aparelho Conectado</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Clique em "Adicionar Novo WhatsApp" para conectar.
                  </p>
                </div>
              </div>
            )}

            {status !== "loading" && userInstances.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userInstances.map((inst) => (
                  <div key={inst.id} className="border rounded-xl p-6 bg-card/50 flex flex-col gap-6">
                    {inst.status === "connecting" && (
                      <div className="flex flex-col items-center gap-4">
                        {inst.qrcode ? (
                          <>
                            <div className="p-2 bg-white rounded-xl shadow-sm border border-border">
                              <img src={inst.qrcode} alt="QR Code WhatsApp" className="w-48 h-48" />
                            </div>
                            <p className="text-sm font-medium text-center">Escaneie para conectar</p>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-3 py-10">
                            <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
                            <p className="text-sm text-muted-foreground">Aguardando QR Code...</p>
                          </div>
                        )}
                        <button
                          onClick={() => handleDisconnect(inst)}
                          disabled={isDisconnecting}
                          className="mt-2 text-sm border px-3 py-1.5 rounded-lg hover:bg-muted"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}

                    {inst.status === "connected" && (
                      <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                          {inst.profilePicUrl ? (
                            <img src={inst.profilePicUrl} alt="Profile" className="w-20 h-20 rounded-full border-4 border-[#25D366] object-cover" />
                          ) : (
                            <div className="w-20 h-20 bg-muted rounded-full border-4 border-[#25D366] flex items-center justify-center">
                              <Smartphone className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute bottom-0 right-0 w-5 h-5 bg-[#25D366] rounded-full border-2 border-background" />
                        </div>
                        <div className="text-center">
                          <h3 className="font-semibold text-lg">{inst.profileName || "WhatsApp"}</h3>
                          <p className="text-sm text-muted-foreground">{inst.phone}</p>
                          <span className="inline-flex mt-2 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                            Conectado
                          </span>
                        </div>
                        <button
                          onClick={() => handleRestartSelectedInstance(inst)}
                          disabled={restartingId === inst.id || isDisconnecting}
                          className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                        >
                          {restartingId === inst.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          Reiniciar sessão
                        </button>
                        <button
                          onClick={() => handleDisconnect(inst)}
                          disabled={isDisconnecting || restartingId === inst.id}
                          className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                        >
                          {isDisconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                          Desconectar
                        </button>
                      </div>
                    )}

                    {inst.status === "disconnected" && (
                      <div className="flex flex-col items-center justify-center py-10 gap-4">
                        <WifiOff className="w-10 h-10 text-muted-foreground" />
                        <p className="text-sm font-medium">Desconectado</p>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                          {canReconnectStatusInstance(inst) && (
                            <button
                              type="button"
                              onClick={() => handleReconnectSelectedInstance(inst)}
                              disabled={reconnectingId === inst.id}
                              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-500 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
                            >
                              {reconnectingId === inst.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              Reconectar
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveInstance(inst)}
                            disabled={removingId === inst.id}
                            className="text-sm border border-destructive/30 text-destructive px-3 py-1.5 rounded-lg hover:bg-destructive/10"
                          >
                            {removingId === inst.id ? "Removendo..." : "Remover"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-xl border bg-card/60 p-6 space-y-3">
          <h3 className="font-semibold text-sm">Como conectar</h3>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Clique em &quot;Gerar QR Code&quot;</li>
            <li>Abra o WhatsApp no seu celular</li>
            <li>Acesse <strong>Configurações → Aparelhos Conectados → Conectar um aparelho</strong></li>
            <li>Aponte a câmera para o QR Code na tela</li>
            <li>Aguarde a conexão ser confirmada</li>
          </ol>
          <p className="text-xs text-muted-foreground border-t pt-3 mt-3">
            💡 Conectado via Evolution API. Caso a sessão desconecte,
            clique em &quot;Gerar QR Code&quot; novamente para reconectar.
          </p>
        </div>

        {/* ─── Seção Admin: Instâncias dos Colaboradores ─── */}
        {isAdmin && (
          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold leading-none tracking-tight">Instâncias dos Colaboradores</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Visualize o status de conexão de todos os colaboradores.
                  </p>
                </div>
              </div>
            </div>

            {/* Filtro por unidade */}
            <div className="px-6 pt-4 flex items-center gap-2">
              {["Todas", "Osasco", "SCS", "SBC"].map((unit) => (
                <button
                  key={unit}
                  onClick={() => setUnitFilter(unit)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    unitFilter === unit
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  {unit}
                </button>
              ))}
              <button
                onClick={fetchInstances}
                className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${instancesLoading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
            </div>

            {/* Lista de instâncias */}
            <div className="p-6">
              {instancesLoading && instances.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : filteredInstances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma instância encontrada.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredInstances.map((inst) => (
                    <div
                      key={inst.id}
                      className="grid gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-muted/30 lg:grid-cols-[auto_minmax(0,1fr)_220px_auto_auto]"
                    >
                      {/* Avatar */}
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold flex-shrink-0">
                        {inst.userName?.charAt(0)?.toUpperCase() || "?"}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{inst.userName}</p>
                        <p className="text-xs text-muted-foreground">
                          {inst.unit}
                          {inst.userEmail ? ` · ${inst.userEmail}` : ""}
                        </p>
                      </div>

                      {/* Responsável */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Responsável
                        </label>
                        <select
                          value={inst.userId || ""}
                          onChange={(e) => handleAssignOwner(inst.id, e.target.value)}
                          disabled={updatingOwnerId === inst.id}
                          className="h-9 rounded-lg border border-input bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                        >
                          <option value="">Sem responsável</option>
                          {users
                            .filter((user) => unitFilter === "Todas" || user.unit === inst.unit || user.id === inst.userId)
                            .map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name} · {user.unit}
                              </option>
                            ))}
                        </select>
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
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          inst.status === "connected"
                            ? "bg-emerald-500"
                            : inst.status === "connecting"
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`} />
                        {inst.status === "connected"
                          ? "Conectado"
                          : inst.status === "connecting"
                          ? "Conectando"
                          : "Desconectado"}
                      </span>

                      {/* Telefone */}
                      {inst.phone && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {inst.phone}
                        </span>
                      )}

                      {/* Ações */}
                      <div className="flex flex-wrap items-center gap-2">
                        {canReconnectInstance(inst) && (
                          <button
                            type="button"
                            onClick={() => handleReconnectInstance(inst)}
                            disabled={reconnectingId === inst.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
                          >
                            {reconnectingId === inst.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Reconectar
                          </button>
                        )}
                        <Link
                          href={`/crm/inbox?targetInstanceId=${inst.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted transition-colors flex-shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Ver Inbox
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
