"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/toast";
import { Loader2, Smartphone, LogOut, ArrowLeft, RefreshCw, Wifi, WifiOff, Users, ExternalLink } from "lucide-react";
import Link from "next/link";

// ─── Tipos para instâncias de colaboradores ─────────────────
interface CollaboratorInstance {
  userId: string;
  userName: string;
  unit: string;
  status: string;
  phone?: string | null;
}

export default function WhatsAppSettingsPage() {
  const [userInstances, setUserInstances] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("loading");
  const [isLoading, setIsLoading] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Admin: dados do usuário e instâncias dos colaboradores
  const [isAdmin, setIsAdmin] = useState(false);
  const [instances, setInstances] = useState<CollaboratorInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [unitFilter, setUnitFilter] = useState<string>("Todas");

  // Buscar info do usuário logado
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role === "ADMINISTRADOR") {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
  }, []);

  // Buscar instâncias dos colaboradores (apenas admin)
  const fetchInstances = useCallback(async () => {
    if (!isAdmin) return;
    setInstancesLoading(true);
    try {
      const res = await fetch("/api/whatsapp/admin/instances");
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
    try {
      const res = await fetch("/api/whatsapp/status");
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
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/whatsapp/connect", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_new" })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Erro ao conectar");

      toast("Instância preparada! Escaneie o QR Code.", "success");
      fetchStatus();
    } catch (error: any) {
      toast(error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async (instanceId: string) => {
    if (!confirm("Tem certeza que deseja desconectar este WhatsApp?")) return;

    setIsDisconnecting(true);
    try {
      const res = await fetch(`/api/whatsapp/status?instanceId=${instanceId}`, { method: "DELETE" });
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
            <div className="flex justify-end">
              <button
                onClick={handleConnect}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-[#25D366] hover:bg-[#1DA851] text-white transition-colors disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                Adicionar Novo WhatsApp
              </button>
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
                          onClick={() => handleDisconnect(inst.id)}
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
                          onClick={() => handleDisconnect(inst.id)}
                          disabled={isDisconnecting}
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
                        <button
                          onClick={() => handleDisconnect(inst.id)}
                          disabled={isDisconnecting}
                          className="mt-2 text-sm border border-destructive/30 text-destructive px-3 py-1.5 rounded-lg hover:bg-destructive/10"
                        >
                          Remover
                        </button>
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
                      key={inst.userId}
                      className="flex items-center gap-4 rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors"
                    >
                      {/* Avatar */}
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold flex-shrink-0">
                        {inst.userName?.charAt(0)?.toUpperCase() || "?"}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{inst.userName}</p>
                        <p className="text-xs text-muted-foreground">{inst.unit}</p>
                      </div>

                      {/* Telefone */}
                      {inst.phone && (
                        <span className="text-xs text-muted-foreground font-mono hidden sm:block">
                          {inst.phone}
                        </span>
                      )}

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

                      {/* Ação: Ver Inbox */}
                      <Link
                        href={`/crm/inbox?targetUserId=${inst.userId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted transition-colors flex-shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Ver Inbox
                      </Link>
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
